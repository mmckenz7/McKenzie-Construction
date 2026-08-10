import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const PATCH_FIELDS = new Set([
  "emailDeliveryProvider",
  "smsDeliveryProvider",
  "autoSendApprovedEmail",
  "autoSendSmsFollowups",
  "fromEmail",
  "replyToEmail",
  "fromPhone",
  "microsoftInboxEnabled",
  "microsoftTenantId",
  "microsoftClientId",
  "microsoftMailboxAddress",
  "sandboxMode",
  "testRecipients",
]);

async function authorize(request: Request) {
  const access = await getAuthenticatedAccess();
  if (!access) return createUnauthorizedApiResponse(request);
  if (!hasManagementAccess(access.teamMember.roles)) return createForbiddenApiResponse(request);
  return null;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const result = await createAdminServerClient()
    .from("company_settings")
    .select(`
      email_delivery_provider,
      sms_delivery_provider,
      auto_send_approved_email,
      auto_send_sms_followups,
      communications_from_email,
      company_email,
      communications_from_phone,
      communication_sandbox_mode,
      communication_test_recipients,
      microsoft_365_inbox_enabled,
      microsoft_365_tenant_id,
      microsoft_365_client_id
    `)
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) {
    return Response.json({ success: false, error: "Communication settings could not be loaded." }, { status: 500 });
  }
  const mailbox = await createAdminServerClient()
    .from("communication_mailboxes")
    .select("address,last_sync_at,last_sync_status")
    .eq("provider", "microsoft_graph")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return Response.json({
    success: true,
    settings: {
      ...result.data,
      microsoft_mailbox: mailbox.error ? null : mailbox.data,
    },
    environment: {
      resendReady: Boolean(process.env.RESEND_API_KEY),
      twilioReady: Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN
      ),
      microsoftSecretReady: Boolean(
        process.env.MICROSOFT_365_CLIENT_SECRET
      ),
    },
  });
}

export async function PATCH(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const body = await request.json() as Record<string, unknown>;
  if (Object.keys(body).some((key) => !PATCH_FIELDS.has(key))) {
    return Response.json({ success: false, error: "The request contains unsupported fields." }, { status: 400 });
  }
  if (body.emailDeliveryProvider !== "manual" && body.emailDeliveryProvider !== "resend") {
    return Response.json({ success: false, error: "Choose a supported email provider." }, { status: 400 });
  }
  if (body.smsDeliveryProvider !== "manual" && body.smsDeliveryProvider !== "twilio") {
    return Response.json({ success: false, error: "Choose a supported SMS provider." }, { status: 400 });
  }
  if (typeof body.autoSendApprovedEmail !== "boolean" || typeof body.autoSendSmsFollowups !== "boolean") {
    return Response.json({ success: false, error: "Automation settings must be true or false." }, { status: 400 });
  }
  if (typeof body.sandboxMode !== "boolean" || !Array.isArray(body.testRecipients) || body.testRecipients.some((value) => typeof value !== "string")) {
    return Response.json({ success: false, error: "Sandbox settings are invalid." }, { status: 400 });
  }
  const replyToEmail = optionalText(body.replyToEmail);
  if (replyToEmail && !validEmail(replyToEmail)) {
    return Response.json({ success: false, error: "Enter a valid reply-to email address." }, { status: 400 });
  }
  if (typeof body.microsoftInboxEnabled !== "boolean") {
    return Response.json({ success: false, error: "Microsoft inbox status must be true or false." }, { status: 400 });
  }
  const microsoftTenantId = optionalText(body.microsoftTenantId);
  const microsoftClientId = optionalText(body.microsoftClientId);
  const microsoftMailboxAddress = optionalText(body.microsoftMailboxAddress);
  if (microsoftTenantId && !validUuid(microsoftTenantId)) {
    return Response.json({ success: false, error: "Enter a valid Microsoft directory ID." }, { status: 400 });
  }
  if (microsoftClientId && !validUuid(microsoftClientId)) {
    return Response.json({ success: false, error: "Enter a valid Microsoft application ID." }, { status: 400 });
  }
  if (microsoftMailboxAddress && !validEmail(microsoftMailboxAddress)) {
    return Response.json({ success: false, error: "Enter a valid Microsoft mailbox address." }, { status: 400 });
  }
  if (body.microsoftInboxEnabled && (!microsoftTenantId || !microsoftClientId || !microsoftMailboxAddress)) {
    return Response.json({ success: false, error: "Complete all Microsoft 365 fields before enabling inbox synchronization." }, { status: 400 });
  }
  const updates = {
    email_delivery_provider: body.emailDeliveryProvider,
    sms_delivery_provider: body.smsDeliveryProvider,
    auto_send_approved_email: body.autoSendApprovedEmail,
    auto_send_sms_followups: body.autoSendSmsFollowups,
    communications_from_email: optionalText(body.fromEmail),
    company_email: replyToEmail,
    communications_from_phone: optionalText(body.fromPhone),
    communication_sandbox_mode: body.sandboxMode,
    communication_test_recipients: [...new Set(body.testRecipients.map((value) => String(value).trim()).filter(Boolean))],
    microsoft_365_inbox_enabled: body.microsoftInboxEnabled,
    microsoft_365_tenant_id: microsoftTenantId,
    microsoft_365_client_id: microsoftClientId,
  };
  const result = await createAdminServerClient()
    .from("company_settings")
    .update(updates)
    .not("id", "is", null)
    .select("id")
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) {
    return Response.json({ success: false, error: "Communication settings could not be saved." }, { status: 500 });
  }
  const supabase = createAdminServerClient();
  if (microsoftMailboxAddress) {
    const mailboxResult = await supabase.from("communication_mailboxes").upsert({
      provider: "microsoft_graph",
      address: microsoftMailboxAddress.toLowerCase(),
      display_name: "McKenzie Construction Inbox",
      department: "general",
      is_active: true,
      sync_enabled: body.microsoftInboxEnabled,
      last_sync_status: body.microsoftInboxEnabled ? "ready" : "not_configured",
    }, { onConflict: "provider,address" });
    if (mailboxResult.error) {
      return Response.json({ success: false, error: "Microsoft mailbox settings could not be saved." }, { status: 500 });
    }
  } else if (!body.microsoftInboxEnabled) {
    await supabase.from("communication_mailboxes").update({ sync_enabled: false }).eq("provider", "microsoft_graph");
  }
  return Response.json({ success: true });
}
