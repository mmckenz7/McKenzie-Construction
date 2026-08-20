import { randomUUID } from "node:crypto";

import { comparableDestination, e164UsPhone } from "@/lib/communications/phone";
import { startTwilioBridgeCall } from "@/lib/communications/twilio-voice";
import { communicationWorkspaceMatchesSingletonCompany } from "@/lib/communications/workspace-company";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

type CallRequest = { leadId?: unknown; customerId?: unknown };
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: Request) {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) return Response.json({ success: false, error: "Sign in to start a call." }, { status: 401 });
  if (!canAccessWorkspace(workspace.access, "sales")) return Response.json({ success: false, error: "Sales access is required to start a call." }, { status: 403 });

  let payload: CallRequest;
  try { payload = await request.json() as CallRequest; } catch { return Response.json({ success: false, error: "Choose a valid customer." }, { status: 400 }); }
  let leadId = text(payload.leadId) || null;
  const customerId = text(payload.customerId) || null;
  if (!leadId && !customerId) return Response.json({ success: false, error: "Choose a lead or customer to call." }, { status: 400 });

  const teamMemberPhone = e164UsPhone(workspace.access?.phone ?? "");
  if (!teamMemberPhone) return Response.json({ success: false, error: "Add your mobile number to your employee profile before using OS calling." }, { status: 409 });

  const supabase = createAdminServerClient();
  if (!await communicationWorkspaceMatchesSingletonCompany(supabase, workspace.access!.company_id)) {
    return Response.json({ success: false, error: "The company workspace could not be verified." }, { status: 403 });
  }
  let customerPhone: string | null = null;
  let displayName = "customer";
  if (leadId) {
    const lead = await supabase.from("leads").select("name,phone")
      .eq("id", leadId).maybeSingle();
    customerPhone = e164UsPhone(lead.data?.phone ?? "");
    displayName = lead.data?.name?.trim() || displayName;
  }
  if (customerId) {
    const customer = await supabase.from("customers").select("customer_name,phone,source_lead_id")
      .eq("id", customerId).maybeSingle();
    customerPhone = customerPhone ?? e164UsPhone(customer.data?.phone ?? "");
    leadId = leadId ?? customer.data?.source_lead_id ?? null;
    displayName = customer.data?.customer_name?.trim() || displayName;
  }
  if (!customerPhone) return Response.json({ success: false, error: "This lead or customer does not have a valid 10-digit phone number." }, { status: 400 });

  const settings = await supabase.from("company_settings")
    .select("sms_delivery_provider,communications_from_phone,communication_sandbox_mode,communication_test_recipients")
    .limit(1).maybeSingle();
  const companyPhone = e164UsPhone(settings.data?.communications_from_phone ?? "");
  if (settings.error || settings.data?.sms_delivery_provider !== "twilio" || !companyPhone) {
    return Response.json({ success: false, error: "Twilio and the McKenzie phone number must be configured first." }, { status: 409 });
  }
  const allowed = new Set((settings.data.communication_test_recipients ?? []).map(comparableDestination));
  if (settings.data.communication_sandbox_mode && !allowed.has(comparableDestination(customerPhone))) {
    return Response.json({ success: false, error: `${customerPhone} is not on the communication sandbox allowlist.` }, { status: 409 });
  }

  let call;
  try {
    call = await startTwilioBridgeCall({ teamMemberPhone, customerPhone, companyPhone });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "The call could not be started." }, { status: 502 });
  }

  const startedAt = new Date().toISOString();
  const message = await supabase.from("communication_messages").insert({
    channel: "voice",
    direction: "outbound",
    sender: companyPhone,
    recipient: customerPhone,
    subject: `Call with ${displayName}`,
    body: "Call started through Mission Control.",
    status: "queued",
    provider: "twilio",
    provider_message_id: call.callSid,
    lead_id: leadId,
    sent_at: startedAt,
    department: "sales",
    is_read: true,
    metadata: { customer_id: customerId, team_member_phone: teamMemberPhone, initiated_by: workspace.access?.user_id ?? null, provider_status: call.status, request_id: randomUUID() },
  });
  if (message.error) return Response.json({ success: false, error: "The call started, but its CRM history needs repair." }, { status: 500 });
  if (leadId) await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "call_started",
    channel: "phone",
    direction: "outbound",
    summary: "Call started through Mission Control",
    details: `Calling ${displayName} from the McKenzie number.`,
    occurred_at: startedAt,
    metadata: { provider_call_sid: call.callSid, customer_id: customerId },
  });
  return Response.json({ success: true, callSid: call.callSid, message: `Your phone will ring first. Answer it to connect with ${displayName}.` });
}
