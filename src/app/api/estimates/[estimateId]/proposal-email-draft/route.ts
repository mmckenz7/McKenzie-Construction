import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest } from "@/lib/estimate-access";
import { getCompanyBranding } from "@/lib/company-branding";
import { UUID_PATTERN } from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

const TEMPLATE_KEY = "estimate_proposal_link";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function validEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function emailBody(input: {
  customerName: string;
  companyName: string;
  publicUrl: string;
  expiresAt: string;
  companyPhone: string | null;
  companyEmail: string | null;
}) {
  const contact = [input.companyPhone, input.companyEmail].filter(Boolean).join(" | ");
  return [
    `Hi ${input.customerName},`,
    "",
    `Your estimate from ${input.companyName} is ready to review:`,
    input.publicUrl,
    "",
    `This secure link is available through ${readableDate(input.expiresAt)}.`,
    "",
    "Accepting the estimate records a nonbinding intent to proceed. A separate signed construction contract is required before work begins, and no work is authorized by estimate acceptance alone.",
    "",
    "Please reply to this email if you have any questions.",
    "",
    input.companyName,
    ...(contact ? [contact] : []),
  ].join("\n");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) {
    return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  }

  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canSendProposals) {
    return NextResponse.json({ success: false, error: "You do not have permission to prepare customer estimate emails." }, { status: 403 });
  }

  const supabase = createAdminServerClient();
  const proposalResult = await supabase
    .from("estimate_proposals")
    .select("id, lead_id, public_token, status, customer_name, customer_email, expires_at")
    .eq("estimate_id", estimateId)
    .maybeSingle();
  if (proposalResult.error) {
    return NextResponse.json({ success: false, error: "The issued customer estimate could not be loaded." }, { status: 500 });
  }

  const proposal = proposalResult.data;
  if (!proposal || !["issued", "viewed"].includes(String(proposal.status))) {
    return NextResponse.json({ success: false, error: "Create an active customer estimate link before preparing its email." }, { status: 409 });
  }
  const expiresAt = new Date(String(proposal.expires_at));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ success: false, error: "This customer estimate link has expired. Revoke it and issue a new link before preparing its email." }, { status: 409 });
  }
  const proposalId = text(proposal.id);
  const leadId = text(proposal.lead_id);
  const token = text(proposal.public_token);
  const customerEmail = text(proposal.customer_email);
  if (!proposalId || !leadId || !token) {
    return NextResponse.json({ success: false, error: "This estimate is not connected to a customer lead." }, { status: 409 });
  }
  if (!validEmail(customerEmail)) {
    return NextResponse.json({ success: false, error: "Add a valid email address to the customer lead before preparing this email." }, { status: 409 });
  }

  const existing = await supabase
    .from("email_drafts")
    .select("id, lead_id, status")
    .eq("lead_id", leadId)
    .eq("template_key", TEMPLATE_KEY)
    .contains("metadata", { estimate_proposal_id: proposalId })
    .in("status", ["draft", "approved", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ success: false, error: "Existing customer email drafts could not be checked." }, { status: 500 });
  }
  if (existing.data) {
    return NextResponse.json({
      success: true,
      created: false,
      draft: { id: String(existing.data.id), leadId: String(existing.data.lead_id), status: String(existing.data.status) },
    });
  }

  const [branding, companyResult] = await Promise.all([
    getCompanyBranding(),
    supabase.from("company_settings").select("company_phone, company_email").limit(1).maybeSingle(),
  ]);
  if (companyResult.error) {
    return NextResponse.json({ success: false, error: "Company contact details could not be loaded." }, { status: 500 });
  }

  const subject = `Your estimate from ${branding.companyName}`;
  const publicUrl = `${request.nextUrl.origin}/estimate/${token}`;
  const created = await supabase.from("email_drafts").insert({
    lead_id: leadId,
    template_key: TEMPLATE_KEY,
    to_email: customerEmail,
    subject,
    body: emailBody({
      customerName: text(proposal.customer_name) ?? "there",
      companyName: branding.companyName,
      publicUrl,
      expiresAt: expiresAt.toISOString(),
      companyPhone: text(companyResult.data?.company_phone),
      companyEmail: text(companyResult.data?.company_email),
    }),
    status: "draft",
    metadata: {
      created_by: "estimate_proposal_workflow",
      estimate_id: estimateId,
      estimate_proposal_id: proposalId,
      estimate_proposal_expires_at: proposal.expires_at,
      nonbinding_acceptance: true,
      separate_contract_required: true,
      work_authorized: false,
      next_phone_follow_up_after_send: true,
      next_phone_follow_up_business_days: 3,
    },
  }).select("id, lead_id, status").single();
  if (created.error || !created.data) {
    return NextResponse.json({ success: false, error: "The customer email draft could not be created." }, { status: 500 });
  }

  const activity = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "email_draft_created",
    channel: "email",
    direction: "outbound",
    summary: "Estimate email draft created",
    details: "Draft requires review and approval before sending.",
    metadata: {
      email_draft_id: created.data.id,
      template_key: TEMPLATE_KEY,
      estimate_id: estimateId,
      estimate_proposal_id: proposalId,
    },
  });
  if (activity.error) console.error("Unable to record estimate email draft activity:", activity.error);

  return NextResponse.json({
    success: true,
    created: true,
    draft: { id: String(created.data.id), leadId: String(created.data.lead_id), status: String(created.data.status) },
  }, { status: 201 });
}
