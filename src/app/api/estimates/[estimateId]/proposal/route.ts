import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { getCompanyBranding } from "@/lib/company-branding";
import { buildEstimateCustomerDocument } from "@/lib/estimate-customer-document";
import { calculateMutation, loadMutationState, UUID_PATTERN } from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

const SELECT = `
  id,
  estimate_id,
  lead_id,
  public_token,
  status,
  customer_name,
  customer_email,
  expires_at,
  issued_at,
  opened_at,
  responded_at,
  response,
  response_name,
  acknowledged_nonbinding,
  revoked_at
`;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function schemaUnavailable(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === "42P01" || candidate?.code === "PGRST202" || candidate?.code === "PGRST205"
    || candidate?.message?.includes("estimate_proposal") === true;
}

function schemaResponse() {
  return NextResponse.json({
    success: false,
    code: "estimate_proposal_schema_unavailable",
    error: "Apply the prepared public-estimate migration before creating customer links.",
  }, { status: 503 });
}

function proposal(record: Record<string, unknown>, origin: string) {
  const token = text(record.public_token);
  return {
    id: String(record.id),
    estimateId: String(record.estimate_id),
    leadId: text(record.lead_id),
    status: String(record.status),
    customerName: String(record.customer_name),
    customerEmail: text(record.customer_email),
    expiresAt: String(record.expires_at),
    issuedAt: String(record.issued_at),
    openedAt: text(record.opened_at),
    respondedAt: text(record.responded_at),
    response: text(record.response),
    responseName: text(record.response_name),
    acknowledgedNonbinding: record.acknowledged_nonbinding === true,
    revokedAt: text(record.revoked_at),
    publicUrl: token ? `${origin}/estimate/${token}` : null,
  };
}

async function authorize(request: NextRequest, estimateId: string) {
  if (!UUID_PATTERN.test(estimateId)) {
    return { auth: null, response: NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 }) };
  }
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return { auth: null, response: auth.response };
  if (!auth.authorization!.canSendProposals) {
    return { auth: null, response: NextResponse.json({ success: false, error: "You do not have permission to issue customer estimates." }, { status: 403 }) };
  }
  return { auth, response: null };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  const checked = await authorize(request, estimateId);
  if (checked.response) return checked.response;
  const result = await createAdminServerClient().from("estimate_proposals")
    .select(SELECT).eq("estimate_id", estimateId).maybeSingle();
  if (result.error) {
    if (schemaUnavailable(result.error)) return schemaResponse();
    return NextResponse.json({ success: false, error: "Customer estimate link could not be loaded." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    proposal: result.data ? proposal(result.data as Record<string, unknown>, request.nextUrl.origin) : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  const checked = await authorize(request, estimateId);
  if (checked.response) return checked.response;
  if (!["draft", "reviewing", "sent", "viewed"].includes(String(checked.auth!.estimate?.status))) {
    return NextResponse.json({ success: false, error: "This estimate is not available for customer-link issuance." }, { status: 409 });
  }

  let expiresInDays = 30;
  try {
    const body = await request.json() as { expiresInDays?: unknown };
    if (body.expiresInDays !== undefined) {
      if (!Number.isInteger(body.expiresInDays) || Number(body.expiresInDays) < 1 || Number(body.expiresInDays) > 90) {
        return NextResponse.json({ success: false, error: "expiresInDays must be a whole number from 1 to 90." }, { status: 400 });
      }
      expiresInDays = Number(body.expiresInDays);
    }
  } catch {
    // An empty request uses the company beta default of 30 days.
  }

  const supabase = createAdminServerClient();
  try {
    const state = await loadMutationState(supabase, estimateId);
    if (!state) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    if (!["draft", "reviewing", "sent", "viewed"].includes(String(state.estimate.status))) {
      return NextResponse.json({ success: false, error: "The estimate status changed before the customer link was issued." }, { status: 409 });
    }
    const { calculation } = calculateMutation(state.estimate, state.items);
    const document = buildEstimateCustomerDocument(state, calculation);
    const customerId = text(state.estimate.customer_id);
    const leadId = text(state.estimate.lead_id);
    const [branding, companyResult, customerResult, leadResult] = await Promise.all([
      getCompanyBranding(),
      supabase.from("company_settings").select("company_phone, company_email, website_url").limit(1).maybeSingle(),
      customerId
        ? supabase.from("customers").select("customer_name, email").eq("id", customerId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      leadId
        ? supabase.from("leads").select("name, email").eq("id", leadId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (companyResult.error || customerResult.error || leadResult.error) throw new Error("Customer proposal details could not be loaded.");
    const customerName = text(customerResult.data?.customer_name) ?? text(leadResult.data?.name) ?? "Customer";
    const customerEmail = text(customerResult.data?.email) ?? text(leadResult.data?.email);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const snapshot = {
      document,
      customerName,
      company: {
        publicName: branding.companyName,
        legalName: branding.companyName,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        phone: text(companyResult.data?.company_phone),
        email: text(companyResult.data?.company_email),
        websiteUrl: text(companyResult.data?.website_url),
      },
    };
    const issued = await supabase.rpc("issue_estimate_proposal", {
      requested_estimate_id: estimateId,
      requested_token: randomUUID(),
      requested_snapshot: snapshot,
      requested_customer_name: customerName,
      requested_customer_email: customerEmail,
      requested_expires_at: expiresAt.toISOString(),
      requested_app_user_id: checked.auth!.authorization!.appUserId,
    });
    if (issued.error) {
      if (schemaUnavailable(issued.error)) return schemaResponse();
      return NextResponse.json({ success: false, error: "Customer estimate link could not be issued." }, { status: 409 });
    }
    if (!issued.data || typeof issued.data !== "object") throw new Error("Customer estimate issuance returned an invalid result.");
    const token = text((issued.data as Record<string, unknown>).public_token);
    if (!token) throw new Error("Customer estimate issuance returned no public token.");
    return NextResponse.json({
      success: true,
      created: (issued.data as Record<string, unknown>).created === true,
      proposal: {
        id: String((issued.data as Record<string, unknown>).id),
        estimateId,
        leadId,
        status: String((issued.data as Record<string, unknown>).status),
        customerName,
        customerEmail,
        expiresAt: String((issued.data as Record<string, unknown>).expires_at),
        issuedAt: String((issued.data as Record<string, unknown>).issued_at),
        openedAt: text((issued.data as Record<string, unknown>).opened_at),
        publicUrl: `${request.nextUrl.origin}/estimate/${token}`,
      },
    }, { status: (issued.data as Record<string, unknown>).created === true ? 201 : 200 });
  } catch (error) {
    const message = error instanceof TypeError ? error.message : "Customer estimate link could not be issued.";
    return NextResponse.json({ success: false, error: message }, { status: error instanceof TypeError ? 422 : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  const checked = await authorize(request, estimateId);
  if (checked.response) return checked.response;
  const result = await createAdminServerClient().rpc("revoke_estimate_proposal", {
    requested_estimate_id: estimateId,
    requested_app_user_id: checked.auth!.authorization!.appUserId,
  });
  if (result.error) {
    if (schemaUnavailable(result.error)) return schemaResponse();
    return NextResponse.json({ success: false, error: "The customer estimate link could not be revoked." }, { status: 409 });
  }
  return NextResponse.json({ success: true, result: result.data });
}
