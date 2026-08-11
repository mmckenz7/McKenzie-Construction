import { NextRequest, NextResponse } from "next/server";

import { buildLegalDocumentSnapshot } from "@/lib/contracts/legal-document-snapshot";
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
  legal_document_id,
  legal_document_snapshot,
  legal_document_selected_at,
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

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recipientEmail(value: unknown) {
  const candidate = text(value)?.toLowerCase() ?? null;
  return candidate && candidate.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : null;
}

function schemaUnavailable(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === "42P01" || candidate?.code === "42703"
    || candidate?.code === "PGRST202" || candidate?.code === "PGRST204" || candidate?.code === "PGRST205"
    || candidate?.message?.includes("estimate_contract_preparations") === true
    || candidate?.message?.includes("update_estimate_contract_recipient") === true;
}

function schemaResponse() {
  return NextResponse.json({
    success: false,
    code: "contract_preparation_schema_unavailable",
    error: "Apply the prepared contract-preparation migration before creating contract drafts.",
  }, { status: 503 });
}

function projectPackage(record: Record<string, unknown>) {
  const legalSnapshot = record.legal_document_snapshot && typeof record.legal_document_snapshot === "object"
    ? record.legal_document_snapshot as Record<string, unknown>
    : null;
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
    legalDocumentId: text(record.legal_document_id),
    legalDocumentTitle: text(legalSnapshot?.title),
    legalDocumentVersion: text(legalSnapshot?.versionLabel),
    legalDocumentReviewStatus: text(legalSnapshot?.legalReviewStatus),
    legalDocumentSelectedAt: text(record.legal_document_selected_at),
    signatureProvider: text(record.signature_provider),
    sentForSignatureAt: text(record.sent_for_signature_at),
    signedAt: text(record.signed_at),
    voidedAt: text(record.voided_at),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  };
}

function projectAuditEvent(row: Record<string, unknown>, actorName: string) {
  const previous = record(row.previous_state);
  const next = record(row.next_state);
  return {
    id: String(row.id),
    eventType: String(row.event_type),
    actorName,
    previousRecipientName: text(previous?.recipientName),
    previousRecipientEmail: text(previous?.recipientEmail),
    recipientName: text(next?.recipientName),
    recipientEmail: text(next?.recipientEmail),
    createdAt: String(row.created_at),
  };
}

async function loadAuditHistory(
  supabase: ReturnType<typeof createAdminServerClient>,
  contractPreparationId: string,
) {
  const events = await supabase.from("estimate_contract_preparation_events")
    .select("id,event_type,actor_app_user_id,previous_state,next_state,created_at")
    .eq("contract_preparation_id", contractPreparationId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (events.error) return { available: false, events: [] };
  const rows = (events.data ?? []) as Record<string, unknown>[];
  const actorIds = [...new Set(rows.map((row) => text(row.actor_app_user_id)).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await supabase.from("app_users").select("id,display_name,email").in("id", actorIds)
    : { data: [], error: null };
  if (actors.error) return { available: false, events: [] };
  const actorNames = new Map((actors.data ?? []).map((actor) => [
    String(actor.id),
    text(actor.display_name) ?? text(actor.email) ?? "Application user",
  ]));
  return {
    available: true,
    events: rows.map((row) => projectAuditEvent(
      row,
      actorNames.get(String(row.actor_app_user_id)) ?? "Application user",
    )),
  };
}

async function defaultLegalBinding(
  supabase: ReturnType<typeof createAdminServerClient>,
  appUserId: string,
  recipientEmail: string | null,
) {
  const company = await supabase.from("company_settings").select("id").limit(2);
  if (company.error || company.data?.length !== 1) {
    throw new TypeError("Exactly one company must be configured before selecting legal terms.");
  }
  const document = await supabase.from("company_legal_documents")
    .select("id,document_type,title,version_label,source_kind,boilerplate_body,content_sha256,legal_review_status")
    .eq("company_id", company.data[0].id)
    .eq("document_type", "construction_contract")
    .eq("status", "active")
    .eq("is_default", true)
    .maybeSingle();
  if (document.error) throw new Error("The default legal document could not be loaded.");
  if (!document.data) return null;
  const selectedAt = new Date().toISOString();
  const snapshot = buildLegalDocumentSnapshot(document.data, selectedAt);
  const approved = document.data.legal_review_status === "attorney_reviewed";
  return {
    status: approved && recipientEmail ? "ready_for_signature" : "draft",
    legal_terms_status: approved ? "approved" : "draft",
    legal_document_id: document.data.id,
    legal_document_snapshot: snapshot,
    legal_document_selected_at: selectedAt,
    legal_document_selected_by_app_user_id: appUserId,
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
  const auditHistory = result.data
    ? await loadAuditHistory(createAdminServerClient(), String(result.data.id))
    : { available: true, events: [] };
  return NextResponse.json({
    success: true,
    eligible: checked.auth!.estimate?.status === "accepted",
    estimateStatus: String(checked.auth!.estimate?.status ?? ""),
    contractPreparation: result.data ? projectPackage(result.data as Record<string, unknown>) : null,
    auditHistoryAvailable: auditHistory.available,
    auditEvents: auditHistory.events,
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
    const contractRecipientEmail = recipientEmail(customerResult.data?.email)
      ?? recipientEmail(leadResult.data?.email);
    const legalBinding = await defaultLegalBinding(
      supabase,
      checked.auth!.authorization!.appUserId,
      contractRecipientEmail,
    );

    const inserted = await supabase.from("estimate_contract_preparations").insert({
      estimate_id: estimateId,
      lead_id: leadId,
      customer_id: customerId,
      snapshot_version: "estimate-contract-preparation-v1",
      customer_document: customerDocument,
      recipient_name: recipientName,
      recipient_email: contractRecipientEmail,
      ...(legalBinding ?? { status: "draft", legal_terms_status: "not_configured" }),
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  const checked = await authorize(request, estimateId);
  if (checked.response) return checked.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }
  if (body.action !== "refresh_legal_document" && body.action !== "update_recipient") {
    return NextResponse.json({ success: false, error: "Unsupported contract-preparation action." }, { status: 400 });
  }

  const supabase = createAdminServerClient();
  const preparation = await supabase.from("estimate_contract_preparations")
    .select("id,status,recipient_email,signature_send_attempt_id,signature_envelope_id")
    .eq("estimate_id", estimateId)
    .maybeSingle();
  if (preparation.error) {
    if (schemaUnavailable(preparation.error)) return schemaResponse();
    return NextResponse.json({ success: false, error: "Contract preparation could not be loaded." }, { status: 500 });
  }
  if (!preparation.data) {
    return NextResponse.json({ success: false, error: "Contract preparation was not found." }, { status: 404 });
  }
  if (!["draft", "ready_for_signature"].includes(preparation.data.status)
    || preparation.data.signature_send_attempt_id
    || preparation.data.signature_envelope_id) {
    return NextResponse.json({ success: false, error: "Contract preparation is locked after signature sending begins." }, { status: 409 });
  }

  if (body.action === "update_recipient") {
    if (Object.keys(body).some((key) => !["action", "recipientName", "recipientEmail"].includes(key))
      || typeof body.recipientName !== "string"
      || (body.recipientEmail !== null && typeof body.recipientEmail !== "string")) {
      return NextResponse.json({ success: false, error: "Invalid recipient details." }, { status: 400 });
    }
    const recipientName = body.recipientName.trim();
    const recipientEmail = typeof body.recipientEmail === "string"
      ? body.recipientEmail.trim().toLowerCase()
      : "";
    if (!recipientName || recipientName.length > 240
      || (recipientEmail && (recipientEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)))) {
      return NextResponse.json({ success: false, error: "Enter a valid recipient name and email." }, { status: 400 });
    }
    const changed = await supabase.rpc("update_estimate_contract_recipient", {
      requested_contract_preparation_id: preparation.data.id,
      requested_app_user_id: checked.auth!.authorization!.appUserId,
      requested_recipient_name: recipientName,
      requested_recipient_email: recipientEmail || null,
    });
    if (changed.error) {
      if (schemaUnavailable(changed.error)) return schemaResponse();
      return NextResponse.json({ success: false, error: "Recipient details could not be updated." }, { status: 409 });
    }
    const updated = await supabase.from("estimate_contract_preparations")
      .select(SELECT).eq("id", preparation.data.id).single();
    if (updated.error || !updated.data) {
      return NextResponse.json({ success: false, error: "Updated recipient details could not be loaded." }, { status: 500 });
    }
    const auditHistory = await loadAuditHistory(supabase, String(preparation.data.id));
    return NextResponse.json({
      success: true,
      changed: (changed.data as { changed?: unknown } | null)?.changed === true,
      contractPreparation: projectPackage(updated.data as Record<string, unknown>),
      auditHistoryAvailable: auditHistory.available,
      auditEvents: auditHistory.events,
    });
  }

  try {
    const legalBinding = await defaultLegalBinding(
      supabase,
      checked.auth!.authorization!.appUserId,
      recipientEmail(preparation.data.recipient_email),
    );
    if (!legalBinding) {
      return NextResponse.json({ success: false, code: "default_legal_document_missing", error: "Choose a default construction contract in Company Settings first." }, { status: 409 });
    }
    const updated = await supabase.from("estimate_contract_preparations")
      .update(legalBinding)
      .eq("id", preparation.data.id)
      .in("status", ["draft", "ready_for_signature"])
      .is("signature_envelope_id", null)
      .select(SELECT)
      .maybeSingle();
    if (updated.error) {
      if (schemaUnavailable(updated.error)) return schemaResponse();
      return NextResponse.json({ success: false, error: "The contract legal document could not be updated." }, { status: 500 });
    }
    if (!updated.data) {
      return NextResponse.json({ success: false, error: "The contract changed before legal terms were updated." }, { status: 409 });
    }
    return NextResponse.json({ success: true, contractPreparation: projectPackage(updated.data as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof TypeError ? error.message : "The default legal document could not be selected.",
    }, { status: error instanceof TypeError ? 409 : 500 });
  }
}
