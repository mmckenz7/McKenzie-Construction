import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { normalizedPhone, validateTwilioWebhook } from "@/lib/communications/twilio-webhook";

export const runtime = "nodejs";

const TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function xml(status = 200) {
  return new Response(TWIML, { status, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } });
}

async function findLeadId(from: string) {
  const supabase = createAdminServerClient();
  const result = await supabase.from("leads").select("id, phone").not("phone", "is", null).limit(1000);
  if (result.error) return null;
  const wanted = normalizedPhone(from);
  return (result.data ?? []).find((lead) => normalizedPhone(String(lead.phone ?? "")) === wanted)?.id ?? null;
}

export async function POST(request: Request) {
  const form = await request.formData();
  if (!validateTwilioWebhook(request, form)) return xml(401);

  const providerMessageId = String(form.get("MessageSid") ?? form.get("SmsSid") ?? "").trim();
  if (!providerMessageId) return xml(400);
  const messageStatus = String(form.get("MessageStatus") ?? form.get("SmsStatus") ?? "").toLowerCase();
  const body = String(form.get("Body") ?? "");
  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const supabase = createAdminServerClient();

  if (body || form.has("OptOutType")) {
    if (!from || !to) return xml(400);
    const optOutValue = String(form.get("OptOutType") ?? "").toUpperCase();
    const optOutType = optOutValue === "STOP" || optOutValue === "START" || optOutValue === "HELP" ? optOutValue : null;
    const leadId = await findLeadId(from);
    const receivedAt = new Date().toISOString();
    const message = await supabase.from("communication_messages").upsert({
      channel: "sms", direction: "inbound", sender: from, recipient: to,
      body, status: "received", provider: "twilio", provider_message_id: providerMessageId,
      lead_id: leadId, opt_out_type: optOutType, received_at: receivedAt,
      metadata: { num_media: String(form.get("NumMedia") ?? "0") },
    }, { onConflict: "provider,provider_message_id,direction", ignoreDuplicates: true }).select("id").maybeSingle();
    if (message.error) return xml(500);
    if (!message.data) return xml();

    if (optOutType === "STOP" || optOutType === "START") {
      await supabase.from("communication_preferences").upsert({
        channel: "sms", address: from,
        status: optOutType === "STOP" ? "unsubscribed" : "subscribed",
        source: `twilio_${optOutType.toLowerCase()}`, provider: "twilio", effective_at: receivedAt,
        metadata: { provider_message_id: providerMessageId },
      }, { onConflict: "channel,address" });
    }

    if (leadId) {
      await Promise.all([
        supabase.from("lead_activities").insert({
          lead_id: leadId, activity_type: "sms_received", channel: "sms", direction: "inbound",
          summary: optOutType ? `SMS ${optOutType} received` : "Customer text received",
          details: body, metadata: { provider_message_id: providerMessageId, opt_out_type: optOutType },
        }),
        supabase.from("lead_tasks").update({ status: "canceled", canceled_at: receivedAt, completion_note: "Canceled because the customer replied by text." }).eq("lead_id", leadId).in("task_type", ["first_phone_follow_up", "phone_follow_up"]).in("status", ["open", "in_progress"]),
        supabase.from("tasks").update({ status: "canceled", canceled_at: receivedAt, completion_note: "Canceled because the customer replied by text." }).eq("lead_id", leadId).in("task_type", ["first_phone_follow_up", "phone_follow_up"]).in("status", ["open", "in_progress"]),
      ]);
    }
    return xml();
  }

  if (messageStatus) {
    const status = ["delivered", "sent", "undelivered", "failed"].includes(messageStatus) ? messageStatus : "sent";
    await Promise.all([
      supabase.from("communication_messages").update({ status, metadata: { error_code: form.get("ErrorCode") ?? null } }).eq("provider", "twilio").eq("provider_message_id", providerMessageId).eq("direction", "outbound"),
      supabase.from("communication_outbox").update({
        metadata: { delivery_status: messageStatus, error_code: form.get("ErrorCode") ?? null },
        ...(status === "failed" || status === "undelivered" ? { last_error_code: String(form.get("ErrorCode") ?? "delivery_failed"), last_error_message: "Twilio reported that the message was not delivered." } : {}),
      }).eq("provider", "twilio").eq("provider_message_id", providerMessageId),
    ]);
    return xml();
  }

  return xml(400);
}
