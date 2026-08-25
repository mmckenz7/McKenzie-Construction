import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { validateTwilioWebhook } from "@/lib/communications/twilio-webhook";

export async function POST(request: Request) {
  const form = await request.formData();
  if (!validateTwilioWebhook(request, form)) return new Response(null, { status: 401 });
  const callSid = String(form.get("CallSid") ?? "").trim();
  const callStatus = String(form.get("CallStatus") ?? "").trim().toLowerCase();
  if (!callSid || !callStatus) return new Response(null, { status: 400 });
  const terminalSuccess = callStatus === "completed";
  const terminalFailure = ["busy", "failed", "no-answer", "canceled"].includes(callStatus);
  const status = terminalSuccess ? "delivered" : terminalFailure ? "failed" : "queued";
  const supabase = createAdminServerClient();
  const existing = await supabase.from("communication_messages")
    .select("id,metadata").eq("provider", "twilio").eq("provider_message_id", callSid)
    .eq("channel", "voice").eq("security_disposition", "normal").maybeSingle();
  if (existing.error || !existing.data) return new Response(null, { status: 404 });
  const result = await supabase.from("communication_messages").update({
    status,
    metadata: { ...(existing.data.metadata ?? {}), provider_status: callStatus, call_duration_seconds: Number(form.get("CallDuration") ?? "0") || null },
  }).eq("id", existing.data.id).eq("security_disposition", "normal");
  return new Response(null, { status: result.error ? 500 : 204 });
}
