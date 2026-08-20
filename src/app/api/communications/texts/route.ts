import { randomUUID } from "node:crypto";

import { deliverCommunication } from "@/lib/communications/provider";
import { comparableDestination, e164UsPhone } from "@/lib/communications/phone";
import { communicationWorkspaceMatchesSingletonCompany } from "@/lib/communications/workspace-company";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

type TextRequest = {
  threadId?: unknown;
  leadId?: unknown;
  customerId?: unknown;
  body?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) {
    return Response.json({ success: false, error: "Sign in to send a text." }, { status: 401 });
  }
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return Response.json({ success: false, error: "Sales access is required to send a text." }, { status: 403 });
  }

  let payload: TextRequest;
  try {
    payload = await request.json() as TextRequest;
  } catch {
    return Response.json({ success: false, error: "Enter a valid text message." }, { status: 400 });
  }

  let threadId = text(payload.threadId);
  let leadId = text(payload.leadId) || null;
  let customerId = text(payload.customerId) || null;
  const body = text(payload.body);
  if (!threadId && !leadId && !customerId) {
    return Response.json({ success: false, error: "Choose a matched lead or customer before texting." }, { status: 400 });
  }
  if (!body || body.length > 1_600) {
    return Response.json({ success: false, error: "Enter a text message no longer than 1,600 characters." }, { status: 400 });
  }

  const supabase = createAdminServerClient();
  if (!await communicationWorkspaceMatchesSingletonCompany(supabase, workspace.access!.company_id)) {
    return Response.json({ success: false, error: "The company workspace could not be verified." }, { status: 403 });
  }
  const settingsResult = await supabase.from("company_settings")
    .select("sms_delivery_provider,communications_from_phone,communication_sandbox_mode,communication_test_recipients")
    .limit(1).maybeSingle();
  if (settingsResult.error || !settingsResult.data) {
    return Response.json({ success: false, error: "Communication settings could not be loaded." }, { status: 500 });
  }
  const sender = e164UsPhone(settingsResult.data.communications_from_phone ?? "");
  if (settingsResult.data.sms_delivery_provider !== "twilio" || !sender) {
    return Response.json({ success: false, error: "Twilio and the McKenzie sending number must be configured first." }, { status: 409 });
  }

  let recipient: string | null = null;
  let participantRecipient: string | null = null;
  let displayName = "customer";
  if (threadId) {
    const thread = await supabase.from("communication_threads")
      .select("id,provider,lead_id,customer_id,participant_addresses")
      .eq("id", threadId).eq("provider", "twilio")
      .or("lead_id.not.is.null,customer_id.not.is.null").maybeSingle();
    if (thread.error || !thread.data) {
      return Response.json({ success: false, error: "The text conversation could not be found." }, { status: 404 });
    }
    leadId = thread.data.lead_id ?? leadId;
    customerId = thread.data.customer_id ?? customerId;
    participantRecipient = (thread.data.participant_addresses as string[])
      .map((address) => e164UsPhone(String(address)))
      .find((address) => Boolean(address && address !== sender)) ?? null;
  }

  if (leadId) {
    const lead = await supabase.from("leads").select("name,phone")
      .eq("id", leadId).maybeSingle();
    if (lead.error || !lead.data) {
      return Response.json({ success: false, error: "The lead could not be found." }, { status: 404 });
    }
    recipient = e164UsPhone(lead.data.phone ?? "") ?? recipient;
    displayName = lead.data.name?.trim() || displayName;
  }
  if (customerId) {
    const customer = await supabase.from("customers")
      .select("customer_name,phone,source_lead_id")
      .eq("id", customerId).maybeSingle();
    if (customer.error || !customer.data) {
      return Response.json({ success: false, error: "The customer could not be found." }, { status: 404 });
    }
    recipient = recipient ?? e164UsPhone(customer.data.phone ?? "");
    leadId = leadId ?? customer.data.source_lead_id ?? null;
    displayName = customer.data.customer_name?.trim() || displayName;
  }
  recipient = recipient ?? participantRecipient;
  if (!recipient) {
    return Response.json({ success: false, error: "This lead or customer does not have a valid 10-digit phone number." }, { status: 400 });
  }

  const preference = await supabase.from("communication_preferences")
    .select("status").eq("channel", "sms").eq("address", recipient).maybeSingle();
  if (preference.data?.status === "unsubscribed") {
    return Response.json({ success: false, error: "This number opted out of text messages. Ask the customer to text START before replying." }, { status: 409 });
  }

  const allowed = new Set((settingsResult.data.communication_test_recipients ?? []).map(comparableDestination));
  if (settingsResult.data.communication_sandbox_mode && !allowed.has(comparableDestination(recipient))) {
    return Response.json({ success: false, error: `${recipient} is not on the communication sandbox allowlist.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (!threadId) {
    const providerThreadId = `sms:${recipient}`;
    const created = await supabase.from("communication_threads").upsert({
      provider: "twilio",
      provider_thread_id: providerThreadId,
      subject: `Text conversation with ${displayName}`,
      department: "sales",
      status: "waiting",
      lead_id: leadId,
      customer_id: customerId,
      participant_addresses: [sender, recipient],
      unread_count: 0,
      last_message_at: now,
      metadata: { channel: "sms", created_from: leadId ? "lead_record" : "customer_record" },
    }, { onConflict: "provider,provider_thread_id" }).select("id").single();
    if (created.error || !created.data) {
      return Response.json({ success: false, error: "The text conversation could not be created." }, { status: 500 });
    }
    threadId = created.data.id;
  }

  const idempotencyKey = `mission-control-text:${randomUUID()}`;
  const outbox = await supabase.from("communication_outbox").insert({
    channel: "sms",
    recipient,
    sender,
    cc_recipients: [],
    subject: null,
    body,
    status: "processing",
    provider: "twilio",
    source_type: "inbox_reply",
    source_id: threadId,
    lead_id: leadId,
    idempotency_key: idempotencyKey,
    attempt_count: 1,
    processing_started_at: now,
    metadata: { thread_id: threadId, customer_id: customerId, sent_by_team_member_id: workspace.access?.user_id ?? null },
  }).select("id").single();
  if (outbox.error || !outbox.data) {
    return Response.json({ success: false, error: "The text could not be added to the delivery queue." }, { status: 500 });
  }

  let delivery;
  try {
    delivery = await deliverCommunication({
      id: outbox.data.id,
      channel: "sms",
      recipient,
      sender,
      replyTo: null,
      ccRecipients: [],
      subject: null,
      body,
      idempotencyKey,
      provider: "twilio",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Twilio delivery failed.";
    await supabase.from("communication_outbox").update({
      status: "queued",
      processing_started_at: null,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error_code: "provider_delivery_failed",
      last_error_message: message,
    }).eq("id", outbox.data.id);
    return Response.json({ success: false, error: `The text was queued for retry. ${message}` }, { status: 502 });
  }

  const [outboxUpdate, messageResult, threadUpdate] = await Promise.all([
    supabase.from("communication_outbox").update({
      status: "sent",
      provider_message_id: delivery.providerMessageId,
      sent_at: now,
      processing_started_at: null,
      last_error_code: null,
      last_error_message: null,
      metadata: { thread_id: threadId, customer_id: customerId, sent_by_team_member_id: workspace.access?.user_id ?? null, provider_accepted_status: delivery.acceptedStatus },
    }).eq("id", outbox.data.id),
    supabase.from("communication_messages").upsert({
      channel: "sms",
      direction: "outbound",
      sender,
      recipient,
      subject: null,
      body,
      status: "sent",
      provider: "twilio",
      provider_message_id: delivery.providerMessageId,
      lead_id: leadId,
      outbox_id: outbox.data.id,
      thread_id: threadId,
      department: "sales",
      is_read: true,
      sent_at: now,
      metadata: { customer_id: customerId, sent_by_team_member_id: workspace.access?.user_id ?? null },
    }, { onConflict: "provider,provider_message_id,direction", ignoreDuplicates: true }),
    supabase.from("communication_threads").update({ status: "waiting", unread_count: 0, last_message_at: now }).eq("id", threadId),
  ]);
  if (outboxUpdate.error || messageResult.error || threadUpdate.error) {
    return Response.json({ success: false, error: "Twilio accepted the text, but its CRM history needs repair." }, { status: 500 });
  }

  if (leadId) {
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      activity_type: "sms_sent",
      channel: "sms",
      direction: "outbound",
      summary: "Text sent from Mission Control",
      details: body,
      occurred_at: now,
      metadata: { provider_message_id: delivery.providerMessageId, thread_id: threadId, customer_id: customerId },
    });
  }

  return Response.json({ success: true, threadId, providerMessageId: delivery.providerMessageId });
}
