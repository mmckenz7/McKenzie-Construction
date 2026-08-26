import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { finalizeAutomatedEmailDelivery } from "@/lib/communications/email-delivery-workflow";
import {
  CommunicationConfigurationError,
  deliverCommunication,
} from "@/lib/communications/provider";
import { plainTextEmailHtml } from "@/lib/communications/email-signature";

type OutboxRecord = {
  id: string;
  channel: "email" | "sms";
  recipient: string;
  sender: string;
  cc_recipients: string[];
  subject: string | null;
  body: string;
  provider: string;
  source_type: string;
  source_id: string;
  lead_id: string | null;
  idempotency_key: string;
  attempt_count: number;
  metadata: Record<string, unknown>;
};

function retryAt(attemptCount: number) {
  const minutes = Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function comparableDestination(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : trimmed.replace(/\D/g, "");
}

export type CommunicationProcessingResult = {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  canceled: number;
};

export async function processCommunicationOutbox(
  supabase: SupabaseClient,
): Promise<CommunicationProcessingResult> {
  const safety = await supabase.from("company_settings")
    .select("communication_sandbox_mode, communication_test_recipients").limit(1).maybeSingle();
  if (safety.error || !safety.data) {
    throw new Error("Communication safety settings could not be loaded.");
  }

  const allowedDestinations = new Set(
    (safety.data.communication_test_recipients ?? []).map(comparableDestination),
  );
  const candidates = await supabase
    .from("communication_outbox")
    .select(`
      id, channel, recipient, sender, cc_recipients, subject, body, provider,
      source_type, source_id, lead_id, idempotency_key, attempt_count, metadata
    `)
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(10);

  if (candidates.error) {
    throw new Error("The communication outbox could not be loaded.");
  }

  const outcomes: Array<{ status: "sent" | "queued" | "failed" | "canceled" }> = [];
  for (const candidate of (candidates.data ?? []) as OutboxRecord[]) {
    const deliveryDestinations = [candidate.recipient, ...(candidate.cc_recipients ?? [])];
    const attemptCount = candidate.attempt_count + 1;
    const claimed = await supabase
      .from("communication_outbox")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        attempt_count: attemptCount,
      })
      .eq("id", candidate.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claimed.error || !claimed.data) continue;

    if (
      safety.data.communication_sandbox_mode &&
      deliveryDestinations.some((recipient) => !allowedDestinations.has(comparableDestination(recipient)))
    ) {
      await supabase.from("communication_outbox").update({
        status: "canceled",
        processing_started_at: null,
        last_error_code: "sandbox_recipient_blocked",
        last_error_message: "Delivery was canceled because one or more recipients are not on the communication sandbox allowlist.",
      }).eq("id", candidate.id);
      outcomes.push({ status: "canceled" });
      continue;
    }

    if (candidate.channel === "sms") {
      const preference = await supabase.from("communication_preferences")
        .select("status").eq("channel", "sms").eq("address", candidate.recipient).maybeSingle();
      if (preference.data?.status === "unsubscribed") {
        await supabase.from("communication_outbox").update({
          status: "canceled",
          processing_started_at: null,
          last_error_code: "recipient_unsubscribed",
          last_error_message: "SMS delivery was canceled because the recipient opted out.",
        }).eq("id", candidate.id);
        outcomes.push({ status: "canceled" });
        continue;
      }
    }

    let delivery: Awaited<ReturnType<typeof deliverCommunication>>;
    try {
      delivery = await deliverCommunication({
        id: candidate.id,
        channel: candidate.channel,
        recipient: candidate.recipient,
        sender: candidate.sender,
        replyTo: candidate.channel === "email" && typeof candidate.metadata?.reply_to_email === "string"
          ? candidate.metadata.reply_to_email
          : null,
        ccRecipients: candidate.cc_recipients ?? [],
        bccRecipients: [],
        subject: candidate.subject,
        body: candidate.body,
        html: candidate.channel === "email"
          ? plainTextEmailHtml(candidate.body)
          : undefined,
        idempotencyKey: candidate.idempotency_key,
        provider: candidate.provider,
      });
    } catch (error) {
      const configurationFailure = error instanceof CommunicationConfigurationError;
      const terminal = configurationFailure || attemptCount >= 3;
      await supabase.from("communication_outbox").update({
        status: terminal ? "failed" : "queued",
        processing_started_at: null,
        next_attempt_at: retryAt(attemptCount),
        failed_at: terminal ? new Date().toISOString() : null,
        last_error_code: configurationFailure ? error.code : "provider_delivery_failed",
        last_error_message: error instanceof Error ? error.message.slice(0, 500) : "Provider delivery failed.",
      }).eq("id", candidate.id);
      outcomes.push({ status: terminal ? "failed" : "queued" });
      continue;
    }

    const sentAt = new Date().toISOString();
    const outboxUpdate = await supabase.from("communication_outbox").update({
      status: "sent",
      provider_message_id: delivery.providerMessageId,
      sent_at: sentAt,
      processing_started_at: null,
      last_error_code: null,
      last_error_message: null,
      metadata: { ...candidate.metadata, provider_accepted_status: delivery.acceptedStatus },
    }).eq("id", candidate.id);
    if (outboxUpdate.error) {
      // The provider accepted the message. Never retry it merely because local audit finalization failed.
      console.error("Delivery succeeded but its audit record could not be finalized:", outboxUpdate.error);
      outcomes.push({ status: "sent" });
      continue;
    }

    await supabase.from("communication_messages").upsert({
      channel: candidate.channel,
      direction: "outbound",
      sender: candidate.sender,
      recipient: candidate.recipient,
      subject: candidate.subject,
      body: candidate.body,
      status: "sent",
      provider: candidate.provider,
      provider_message_id: delivery.providerMessageId,
      lead_id: candidate.lead_id,
      outbox_id: candidate.id,
      sent_at: sentAt,
      security_disposition: "normal",
    }, { onConflict: "provider,provider_message_id,direction", ignoreDuplicates: true });

    if (candidate.source_type === "email_draft" && candidate.lead_id) {
      try {
        await finalizeAutomatedEmailDelivery(supabase, {
          draftId: candidate.source_id,
          leadId: candidate.lead_id,
          providerMessageId: delivery.providerMessageId,
          sentAt,
        });
      } catch (workflowError) {
        const message = workflowError instanceof Error ? workflowError.message : "Post-delivery workflow failed.";
        console.error("Delivered communication needs workflow repair:", workflowError);
        await Promise.all([
          supabase.from("communication_outbox").update({
            metadata: {
              ...candidate.metadata,
              provider_accepted_status: delivery.acceptedStatus,
              workflow_error: message.slice(0, 500),
            },
          }).eq("id", candidate.id),
          supabase.from("tasks").insert({
            lead_id: candidate.lead_id,
            task_type: "communication_delivery_repair",
            title: "Repair delivered-email follow-up",
            description: "The provider delivered an email, but its internal follow-up workflow needs review.",
            category: "administrative",
            status: "open",
            priority: "high",
            source_type: "communication_outbox",
            metadata: { outbox_id: candidate.id, email_draft_id: candidate.source_id },
          }),
        ]);
      }
    }
    outcomes.push({ status: "sent" });
  }

  return {
    processed: outcomes.length,
    sent: outcomes.filter((outcome) => outcome.status === "sent").length,
    retried: outcomes.filter((outcome) => outcome.status === "queued").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    canceled: outcomes.filter((outcome) => outcome.status === "canceled").length,
  };
}
