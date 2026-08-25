import { randomUUID } from "node:crypto";

import { safeAttachmentFilename } from "@/lib/communications/microsoft-attachment-core";
import { prepareSecondaryEmailRecipients } from "@/lib/communications/email-recipients";
import { outboundAttachmentError } from "@/lib/communications/outbound-attachment-core";
import { deliverCommunication } from "@/lib/communications/provider";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

type ReplyRequest = {
  threadId?: unknown;
  leadId?: unknown;
  customerId?: unknown;
  subject?: unknown;
  body?: unknown;
  recipient?: unknown;
  ccRecipients?: unknown;
  bccRecipients?: unknown;
};

type ParsedReply = ReplyRequest & {
  attachments: File[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function comparableAddress(value: string) {
  return value.trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function replySubject(value: string) {
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

function safeMessageHeader(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean && clean.length <= 998 && !/[\r\n]/.test(clean) ? clean : null;
}

async function parseReplyRequest(request: Request): Promise<ParsedReply> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("multipart/form-data")) {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 4 * 1024 * 1024) {
      throw new RangeError("The reply upload is too large.");
    }
    const form = await request.formData();
    return {
      threadId: form.get("threadId"),
      leadId: form.get("leadId"),
      customerId: form.get("customerId"),
      subject: form.get("subject"),
      body: form.get("body"),
      recipient: form.get("recipient"),
      ccRecipients: form.get("ccRecipients"),
      bccRecipients: form.get("bccRecipients"),
      attachments: form.getAll("attachments").filter((value): value is File => value instanceof File),
    };
  }
  const payload = await request.json() as ReplyRequest;
  return { ...payload, attachments: [] };
}

export async function POST(request: Request) {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) {
    return Response.json({ success: false, error: "Sign in to send email." }, { status: 401 });
  }
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return Response.json({ success: false, error: "Sales access is required to send email." }, { status: 403 });
  }

  let payload: ParsedReply;
  try {
    payload = await parseReplyRequest(request);
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ success: false, error: error.message }, { status: 413 });
    }
    return Response.json({ success: false, error: "Enter a valid email." }, { status: 400 });
  }

  const requestedThreadId = text(payload.threadId);
  const requestedLeadId = text(payload.leadId);
  const requestedCustomerId = text(payload.customerId);
  const requestedRecipient = text(payload.recipient);
  const subject = text(payload.subject);
  const body = text(payload.body);
  const attachmentError = outboundAttachmentError(payload.attachments);

  if (!requestedThreadId && !requestedLeadId && !requestedCustomerId && !requestedRecipient) {
    return Response.json({ success: false, error: "Choose a conversation or enter a recipient before sending." }, { status: 400 });
  }
  if (!subject || subject.length > 300) {
    return Response.json({ success: false, error: "Enter a subject no longer than 300 characters." }, { status: 400 });
  }
  if (!body || body.length > 20_000) {
    return Response.json({ success: false, error: "Enter a message no longer than 20,000 characters." }, { status: 400 });
  }
  if (attachmentError) {
    return Response.json({ success: false, error: attachmentError }, { status: 400 });
  }

  const attachments = await Promise.all(payload.attachments.map(async (file) => ({
    filename: safeAttachmentFilename(file.name),
    content: Buffer.from(await file.arrayBuffer()).toString("base64"),
  })));
  const attachmentMetadata = payload.attachments.map((file, index) => ({
    filename: attachments[index].filename,
    content_type: file.type.toLowerCase(),
    size: file.size,
  }));

  const supabase = createAdminServerClient();
  const settingsResult = await supabase.from("company_settings").select("email_delivery_provider,communications_from_email,company_email,communication_sandbox_mode,communication_test_recipients").limit(1).maybeSingle();
  if (settingsResult.error || !settingsResult.data) {
    return Response.json({ success: false, error: "Communication settings could not be loaded." }, { status: 500 });
  }
  const sender = settingsResult.data.communications_from_email?.trim() ?? "";
  if (settingsResult.data.email_delivery_provider !== "resend" || !sender) {
    return Response.json({ success: false, error: "Resend delivery and a company sending address must be configured first." }, { status: 409 });
  }

  let threadId = requestedThreadId;
  let leadId = requestedLeadId || null;
  let customerId = requestedCustomerId || null;
  let recipient = "";
  let canonicalSubject = subject;
  let department = "general";
  let inReplyTo: string | null = null;

  if (threadId) {
    const threadResult = await supabase.from("communication_threads").select("id,subject,department,lead_id,customer_id").eq("id", threadId).neq("provider", "twilio").maybeSingle();
    if (threadResult.error || !threadResult.data) {
      return Response.json({ success: false, error: "The email conversation could not be found." }, { status: 404 });
    }
    leadId = threadResult.data.lead_id ?? leadId;
    customerId = threadResult.data.customer_id ?? customerId;
    department = threadResult.data.department;
    canonicalSubject = threadResult.data.subject?.trim() || subject;
  } else if (leadId || customerId) {
    let existingThreadQuery = supabase.from("communication_threads").select("id,subject,department,lead_id,customer_id").neq("provider", "twilio").neq("status", "archived").order("last_message_at", { ascending: false }).limit(1);
    existingThreadQuery = leadId ? existingThreadQuery.eq("lead_id", leadId) : existingThreadQuery.eq("customer_id", customerId!);
    const existingThread = await existingThreadQuery.maybeSingle();
    if (!existingThread.error && existingThread.data) {
      threadId = existingThread.data.id;
      leadId = existingThread.data.lead_id ?? leadId;
      customerId = existingThread.data.customer_id ?? customerId;
      department = existingThread.data.department;
      canonicalSubject = existingThread.data.subject?.trim() || subject;
    }
  }

  if (threadId) {
    const inboundResult = await supabase.from("communication_messages").select("sender,internet_message_id").eq("thread_id", threadId).eq("direction", "inbound").order("received_at", { ascending: false }).limit(1).maybeSingle();
    if (!inboundResult.error && inboundResult.data) {
      recipient = inboundResult.data.sender?.trim() ?? "";
      inReplyTo = safeMessageHeader(inboundResult.data.internet_message_id);
    }
  }

  if (!recipient && leadId) {
    const leadResult = await supabase.from("leads").select("email").eq("id", leadId).maybeSingle();
    recipient = leadResult.data?.email?.trim() ?? "";
  }
  if (!recipient && customerId) {
    const customerResult = await supabase.from("customers").select("email,source_lead_id").eq("id", customerId).maybeSingle();
    recipient = customerResult.data?.email?.trim() ?? "";
    leadId = leadId ?? customerResult.data?.source_lead_id ?? null;
  }
  if (!recipient && !threadId && !leadId && !customerId) recipient = requestedRecipient;
  if (!validEmail(recipient)) {
    return Response.json({ success: false, error: "This conversation does not have a valid email recipient." }, { status: 400 });
  }

  const preparedRecipients = prepareSecondaryEmailRecipients(recipient, payload.ccRecipients, payload.bccRecipients);
  if (preparedRecipients.error) {
    return Response.json({ success: false, error: preparedRecipients.error }, { status: 400 });
  }
  const { ccRecipients, bccRecipients } = preparedRecipients;

  const allowed = new Set((settingsResult.data.communication_test_recipients ?? []).map(comparableAddress));
  const blockedRecipient = [recipient, ...ccRecipients, ...bccRecipients].find((address) => !allowed.has(comparableAddress(address)));
  if (settingsResult.data.communication_sandbox_mode && blockedRecipient) {
    return Response.json({ success: false, error: `${blockedRecipient} is not on the communication sandbox allowlist.` }, { status: 409 });
  }

  const sentAt = new Date().toISOString();
  const replyingToExistingThread = Boolean(threadId);
  if (!threadId) {
    const providerThreadId = randomUUID();
    const createdThread = await supabase.from("communication_threads").insert({
      provider: "mission_control",
      provider_thread_id: providerThreadId,
      subject,
      department,
      status: "waiting",
      lead_id: leadId,
      customer_id: customerId,
      participant_addresses: [sender, recipient],
      unread_count: 0,
      last_message_at: sentAt,
      metadata: { created_from: leadId ? "lead_record" : customerId ? "customer_record" : "company_inbox" },
    }).select("id").single();
    if (createdThread.error || !createdThread.data) {
      return Response.json({ success: false, error: "The email conversation could not be created." }, { status: 500 });
    }
    threadId = createdThread.data.id;
  }

  const outboundSubject = replyingToExistingThread ? replySubject(canonicalSubject) : subject;

  const outboxIdempotencyKey = `${replyingToExistingThread ? "mission-control-reply" : "company-inbox-compose"}:${randomUUID()}`;
  const outboxResult = await supabase.from("communication_outbox").insert({
    channel: "email",
    recipient,
    sender,
    cc_recipients: ccRecipients,
    subject: outboundSubject,
    body,
    status: "processing",
    provider: "resend",
    source_type: replyingToExistingThread ? "inbox_reply" : "inbox_compose",
    source_id: threadId,
    lead_id: leadId,
    idempotency_key: outboxIdempotencyKey,
    attempt_count: 1,
    processing_started_at: sentAt,
    metadata: {
      thread_id: threadId,
      customer_id: customerId,
      department,
      reply_to_email: settingsResult.data.company_email?.trim() || null,
      in_reply_to: inReplyTo,
      attachments: attachmentMetadata,
      cc_recipients: ccRecipients,
    },
  }).select("id").single();
  if (outboxResult.error || !outboxResult.data) {
    return Response.json({ success: false, error: "The email could not be added to the delivery outbox." }, { status: 500 });
  }

  let delivery;
  try {
    delivery = await deliverCommunication({
      id: outboxResult.data.id,
      channel: "email",
      recipient,
      sender,
      replyTo: settingsResult.data.company_email?.trim() || null,
      ccRecipients,
      bccRecipients,
      subject: outboundSubject,
      body,
      idempotencyKey: outboxIdempotencyKey,
      provider: "resend",
      headers: inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : {},
      attachments,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Provider delivery failed.";
    await supabase.from("communication_outbox").update({
      status: attachments.length || bccRecipients.length ? "failed" : "queued",
      processing_started_at: null,
      next_attempt_at: attachments.length || bccRecipients.length ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error_code: "provider_delivery_failed",
      last_error_message: message,
    }).eq("id", outboxResult.data.id);
    const retryMessage = attachments.length || bccRecipients.length
      ? "The email was not sent. For privacy, Mission Control does not retain attachment contents or Bcc addresses for automatic retries; please try again."
      : "The email was queued for retry.";
    return Response.json({ success: false, error: `${retryMessage} ${message}` }, { status: 502 });
  }

  const finalOutbox = await supabase.from("communication_outbox").update({
    status: "sent",
    provider_message_id: delivery.providerMessageId,
    sent_at: sentAt,
    processing_started_at: null,
    last_error_code: null,
    last_error_message: null,
    metadata: {
      thread_id: threadId,
      customer_id: customerId,
      department,
      reply_to_email: settingsResult.data.company_email?.trim() || null,
      in_reply_to: inReplyTo,
      provider_accepted_status: delivery.acceptedStatus,
      attachments: attachmentMetadata,
      cc_recipients: ccRecipients,
    },
  }).eq("id", outboxResult.data.id);

  const messageResult = await supabase.from("communication_messages").insert({
    channel: "email",
    direction: "outbound",
    sender,
    recipient,
    subject: outboundSubject,
    body,
    status: "sent",
    provider: "resend",
    provider_message_id: delivery.providerMessageId,
    lead_id: leadId,
    outbox_id: outboxResult.data.id,
    thread_id: threadId,
    in_reply_to: inReplyTo,
    is_read: true,
    has_attachments: attachments.length > 0,
    department,
    sent_at: sentAt,
    metadata: { customer_id: customerId, sent_by_team_member_id: workspace.access?.user_id ?? null, attachments: attachmentMetadata, cc_recipients: ccRecipients, used_bcc: bccRecipients.length > 0 },
  });

  await Promise.all([
    supabase.from("communication_threads").update({ status: "waiting", unread_count: 0, last_message_at: sentAt }).eq("id", threadId),
    supabase.from("communication_messages").update({ is_read: true }).eq("thread_id", threadId).eq("direction", "inbound"),
    leadId ? supabase.from("lead_activities").insert({
      lead_id: leadId,
      activity_type: "email_sent",
      channel: "email",
      direction: "outbound",
      summary: replyingToExistingThread ? "Email reply sent from Mission Control" : "Email sent from Mission Control",
      details: outboundSubject,
      external_id: delivery.providerMessageId,
      occurred_at: sentAt,
      metadata: { communication_thread_id: threadId, communication_outbox_id: outboxResult.data.id },
    }) : Promise.resolve(),
  ]);

  if (finalOutbox.error || messageResult.error) {
    return Response.json({ success: true, warning: "The provider sent the email, but part of its local audit record needs review." });
  }
  return Response.json({ success: true, threadId, sentAt });
}
