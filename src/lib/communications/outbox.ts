import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type ApprovedEmailDraft = Readonly<{
  id: string;
  leadId: string;
  toEmail: string;
  ccEmail: string | null;
  subject: string;
  body: string;
}>;

export async function enqueueApprovedEmail(
  supabase: SupabaseClient,
  draft: ApprovedEmailDraft,
) {
  const settings = await supabase
    .from("company_settings")
    .select("auto_send_approved_email, email_delivery_provider, communications_from_email, company_email")
    .limit(1)
    .maybeSingle();

  if (settings.error) {
    if (settings.error.code === "42703") return { queued: false, reason: "schema_unavailable" } as const;
    throw new Error("Communication settings could not be loaded.");
  }
  if (!settings.data?.auto_send_approved_email) {
    return { queued: false, reason: "automatic_delivery_disabled" } as const;
  }
  if (settings.data.email_delivery_provider === "manual") {
    return { queued: false, reason: "provider_is_manual" } as const;
  }
  if (!settings.data.communications_from_email?.trim()) {
    return { queued: false, reason: "sender_not_configured" } as const;
  }

  const result = await supabase
    .from("communication_outbox")
    .upsert({
      channel: "email",
      recipient: draft.toEmail,
      sender: settings.data.communications_from_email.trim(),
      cc_recipients: draft.ccEmail ? [draft.ccEmail] : [],
      subject: draft.subject,
      body: draft.body,
      status: "queued",
      provider: settings.data.email_delivery_provider,
      source_type: "email_draft",
      source_id: draft.id,
      lead_id: draft.leadId,
      idempotency_key: `email-draft:${draft.id}:approved`,
      metadata: {
        reply_to_email: settings.data.company_email?.trim() || null,
      },
    }, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (result.error) throw new Error("The approved email could not be queued.");
  return { queued: true, outboxId: result.data?.id ?? null } as const;
}
