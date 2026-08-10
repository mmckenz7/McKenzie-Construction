import { Webhook } from "svix";

import {
  communicationStatusForResendEvent,
  eventIsNewer,
  normalizeResendDeliveryEvent,
  outboxStatusForResendEvent,
} from "@/lib/communications/resend-webhook";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

function webhookHeaders(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  return id && timestamp && signature
    ? {
        id,
        verification: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": signature,
        },
      }
    : null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return Response.json({ success: false, error: "Resend webhook verification is not configured." }, { status: 503 });
  }
  const headers = webhookHeaders(request);
  if (!headers) {
    return Response.json({ success: false, error: "Resend webhook signature headers are required." }, { status: 400 });
  }

  const payload = await request.text();
  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(payload, headers.verification);
  } catch {
    return Response.json({ success: false, error: "The Resend webhook signature is invalid." }, { status: 400 });
  }

  const event = normalizeResendDeliveryEvent(verified);
  if (!event) {
    return Response.json({ success: true, ignored: true });
  }

  const supabase = createAdminServerClient();
  const eventRecord = await supabase.from("communication_provider_events").insert({
    provider: "resend",
    event_id: headers.id,
    event_type: event.type,
    provider_message_id: event.emailId,
    occurred_at: event.createdAt,
    metadata: event.metadata,
  }).select("id").maybeSingle();

  let providerEventId = eventRecord.data?.id ?? null;
  if (eventRecord.error?.code === "23505") {
    const existing = await supabase.from("communication_provider_events")
      .select("id,processed_at").eq("provider", "resend").eq("event_id", headers.id).maybeSingle();
    if (existing.error || !existing.data) {
      return Response.json({ success: false, error: "The Resend event audit record could not be loaded." }, { status: 500 });
    }
    if (existing.data.processed_at) return Response.json({ success: true, duplicate: true });
    providerEventId = existing.data.id;
  } else if (eventRecord.error || !providerEventId) {
    return Response.json({ success: false, error: "The Resend event audit record could not be created." }, { status: 500 });
  }

  const [outboxResult, messageResult] = await Promise.all([
    supabase.from("communication_outbox")
      .select("id,metadata").eq("provider", "resend").eq("provider_message_id", event.emailId).maybeSingle(),
    supabase.from("communication_messages")
      .select("id,metadata").eq("provider", "resend").eq("provider_message_id", event.emailId).eq("direction", "outbound").maybeSingle(),
  ]);

  if (outboxResult.error || messageResult.error) {
    await supabase.from("communication_provider_events").update({ processing_error: "The related communication could not be loaded." }).eq("id", providerEventId);
    return Response.json({ success: false, error: "The related communication could not be loaded." }, { status: 500 });
  }

  const eventMetadata = {
    resend_event_type: event.type,
    resend_event_created_at: event.createdAt,
    ...event.metadata,
  };
  const updates: PromiseLike<unknown>[] = [];
  if (outboxResult.data && eventIsNewer(outboxResult.data.metadata, event.createdAt)) {
    const failed = outboxStatusForResendEvent(event.type) === "failed";
    updates.push(supabase.from("communication_outbox").update({
      status: outboxStatusForResendEvent(event.type),
      failed_at: failed ? event.createdAt : null,
      last_error_code: failed ? event.type : null,
      last_error_message: failed ? String(event.metadata.provider_detail ?? "Resend reported that the email was not delivered.") : null,
      metadata: { ...(outboxResult.data.metadata ?? {}), ...eventMetadata },
    }).eq("id", outboxResult.data.id));
  }
  if (messageResult.data && eventIsNewer(messageResult.data.metadata, event.createdAt)) {
    updates.push(supabase.from("communication_messages").update({
      status: communicationStatusForResendEvent(event.type),
      metadata: { ...(messageResult.data.metadata ?? {}), ...eventMetadata },
    }).eq("id", messageResult.data.id));
  }

  const updateResults = await Promise.all(updates);
  const failedUpdate = updateResults.find((result) => {
    return Boolean(result && typeof result === "object" && "error" in result && (result as { error?: unknown }).error);
  });
  if (failedUpdate) {
    await supabase.from("communication_provider_events").update({ processing_error: "The delivery status could not be updated." }).eq("id", providerEventId);
    return Response.json({ success: false, error: "The delivery status could not be updated." }, { status: 500 });
  }

  const finalized = await supabase.from("communication_provider_events").update({
    outbox_id: outboxResult.data?.id ?? null,
    message_id: messageResult.data?.id ?? null,
    processed_at: new Date().toISOString(),
    processing_error: null,
  }).eq("id", providerEventId);
  if (finalized.error) {
    return Response.json({ success: false, error: "The Resend event audit record could not be finalized." }, { status: 500 });
  }

  return Response.json({
    success: true,
    matched: Boolean(outboxResult.data || messageResult.data),
    status: communicationStatusForResendEvent(event.type),
  });
}
