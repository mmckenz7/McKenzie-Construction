import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { buildEstimateCustomerDocument } from "@/lib/estimate-customer-document";
import { calculateMutation, loadMutationState, UUID_PATTERN } from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

const SELECT = `
  id,
  estimate_id,
  lead_id,
  customer_id,
  status,
  snapshot_version,
  recipient_name,
  recipient_email,
  legal_terms_status,
  signature_provider,
  sent_for_signature_at,
  signed_at,
  voided_at,
  created_at,
  updated_at
`;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function schemaUnavailable(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === "42P01" || candidate?.code === "PGRST205"
    || candidate?.message?.includes("estimate_contract_preparations") === true;
}

function schemaResponse() {
  return NextResponse.json({
    success: false,
    code: "contract_preparation_schema_unavailable",
    error: "Apply the prepared contract-preparation migration before creating contract drafts.",
  }, { status: 503 });
}

function projectPackage(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    estimateId: String(record.estimate_id),
    leadId: text(record.lead_id),
    customerId: text(record.customer_id),
    status: String(record.status),
    snapshotVersion: String(record.snapshot_version),
    recipientName: String(record.recipient_name),
    recipientEmail: text(record.recipient_email),
    legalTermsStatus: String(record.legal_terms_status),
    signatureProvider: text(record.signature_provider),
    sentForSignatureAt: text(record.sent_for_signature_at),
    signedAt: text(record.signed_at),
    voidedAt: text(record.voided_at),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  };
}

async function authorize(request: NextRequest, estimateId: string) {
  if (!UUID_PATTERN.test(estimateId)) {
    return { auth: null, response: NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 }) };
  }
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return { auth: null, response: auth.response };
  if (!auth.authorization!.canSendProposals) {
    return {
      auth: null,
      response: NextResponse.json({ success: false, error: "You do not have permission to prepare customer contracts." }, { status: 403 }),
    };
  }
  return { auth, response: null };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  const checked = await authorize(request, estimateId);
  if (checked.response) return checked.response;

  const result = await createAdminServerClient()
    .from("estimate_contract_preparations")
    .select(SELECT)
    .eq("estimate_id", estimateId)
    .maybeSingle();
  if (result.error) {
    if (schemaUnavailable(result.error)) return schemaResponse();
    return NextResponse.json({ success: false, error: "Contract preparation could not be loaded." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    eligible: checked.auth!.estimate?.status === "accepted",
    estimateStatus: String(checked.auth!.estimate?.status ?? ""),
    contractPreparation: result.data ? projectPackage(result.data as Record<string, unknown>) : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  const checked = await authorize(request, estimateId);
  if (checked.response) return checked.response;
  if (checked.auth!.estimate?.status !== "accepted") {
    return NextResponse.json({
      success: false,
      code: "estimate_not_accepted",
      error: "Contract preparation begins only after the customer accepts the estimate as a nonbinding intent to proceed.",
    }, { status: 409 });
  }

  const supabase = createAdminServerClient();
  const existing = await supabase.from("estimate_contract_preparations")
    .select(SELECT).eq("estimate_id", estimateId).maybeSingle();
  if (existing.error) {
    if (schemaUnavailable(existing.error)) return schemaResponse();
    return NextResponse.json({ success: false, error: "Contract preparation could not be checked." }, { status: 500 });
  }
  if (existing.data) {
    return NextResponse.json({ success: true, created: false, contractPreparation: projectPackage(existing.data as Record<string, unknown>) });
  }

  try {
    const state = await loadMutationState(supabase, estimateId);
    if (!state) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    if (state.estimate.status !== "accepted") {
      return NextResponse.json({ success: false, code: "estimate_not_accepted", error: "The estimate acceptance changed before contract preparation began." }, { status: 409 });
    }
    const { calculation } = calculateMutation(state.estimate, state.items);
    const customerDocument = buildEstimateCustomerDocument(state, calculation);
    const customerId = text(state.estimate.customer_id);
    const leadId = text(state.estimate.lead_id);
    const [customerResult, leadResult] = await Promise.all([
      customerId
        ? supabase.from("customers").select("customer_name, email").eq("id", customerId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      leadId
        ? supabase.from("leads").select("name, email").eq("id", leadId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (customerResult.error || leadResult.error) throw new Error("Contract recipient could not be loaded.");
    const recipientName = text(customerResult.data?.customer_name) ?? text(leadResult.data?.name) ?? "Customer";
    const recipientEmail = text(customerResult.data?.email) ?? text(leadResult.data?.email);

    const inserted = await supabase.from("estimate_contract_preparations").insert({
      estimate_id: estimateId,
      lead_id: leadId,
      customer_id: customerId,
      status: "draft",
      snapshot_version: "estimate-contract-preparation-v1",
      customer_document: customerDocument,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      legal_terms_status: "not_configured",
      created_by_app_user_id: checked.auth!.authorization!.appUserId,
      metadata: {
        estimate_status_at_creation: "accepted",
        work_authorized: false,
        project_creation_authorized: false,
      },
    }).select(SELECT).single();
    if (inserted.error) {
      if (schemaUnavailable(inserted.error)) return schemaResponse();
      if (inserted.error.code === "23505") {
        const winner = await supabase.from("estimate_contract_preparations")
          .select(SELECT).eq("estimate_id", estimateId).single();
        if (!winner.error && winner.data) {
          return NextResponse.json({ success: true, created: false, contractPreparation: projectPackage(winner.data as Record<string, unknown>) });
        }
      }
      throw new Error("Contract preparation could not be created.");
    }
    return NextResponse.json({ success: true, created: true, contractPreparation: projectPackage(inserted.data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof TypeError ? error.message : "Contract preparation could not be created.";
    return NextResponse.json({ success: false, error: message }, { status: error instanceof TypeError ? 422 : 500 });
  }
}
