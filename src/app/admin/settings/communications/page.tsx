import { redirect } from "next/navigation";

import { CommunicationSettingsForm } from "@/components/communication-settings-form";
import { getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

export default async function CommunicationSettingsPage() {
  const access = await getAuthenticatedAccess();
  if (!access || !hasManagementAccess(access.teamMember.roles)) redirect("/admin");
  const result = await createAdminServerClient().from("company_settings").select(`
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
  `).limit(1).maybeSingle();
  if (result.error || !result.data) {
    return <main className="mx-auto max-w-4xl px-6 py-10"><h1 className="text-2xl font-bold">Communication settings unavailable</h1><p className="mt-2 text-slate-600">Apply the local beta communication migration before configuring providers.</p></main>;
  }
  const mailboxResult = await createAdminServerClient().from("communication_mailboxes").select("address,last_sync_at,last_sync_status").eq("provider", "microsoft_graph").eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const mailbox = mailboxResult.error ? null : mailboxResult.data;

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-500">Administration</p>
    <h1 className="mt-2 text-3xl font-bold">Email and phone integration</h1>
    <p className="mt-2 max-w-3xl text-slate-600">Provider choices live here; credentials stay in protected server environment variables and are never displayed by the app.</p>
    <CommunicationSettingsForm initial={{
      emailDeliveryProvider: result.data.email_delivery_provider === "resend" ? "resend" : "manual",
      smsDeliveryProvider: result.data.sms_delivery_provider === "twilio" ? "twilio" : "manual",
      autoSendApprovedEmail: result.data.auto_send_approved_email === true,
      autoSendSmsFollowups: result.data.auto_send_sms_followups === true,
      fromEmail: result.data.communications_from_email ?? "",
      replyToEmail: result.data.company_email ?? "",
      fromPhone: result.data.communications_from_phone ?? "",
      resendReady: Boolean(process.env.RESEND_API_KEY),
      twilioReady: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      microsoftInboxEnabled: result.data.microsoft_365_inbox_enabled === true,
      microsoftTenantId: result.data.microsoft_365_tenant_id ?? "",
      microsoftClientId: result.data.microsoft_365_client_id ?? "",
      microsoftMailboxAddress: mailbox?.address ?? "",
      microsoftSecretReady: Boolean(process.env.MICROSOFT_365_CLIENT_SECRET),
      microsoftLastSyncStatus: mailbox?.last_sync_status ?? "not_configured",
      microsoftLastSyncAt: mailbox?.last_sync_at ?? "",
      sandboxMode: result.data.communication_sandbox_mode !== false,
      testRecipients: result.data.communication_test_recipients ?? [],
    }} />
  </main>;
}
