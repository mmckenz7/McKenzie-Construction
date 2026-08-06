import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import {
  assertExactFields,
  completeCommittedMutationState,
  expectedRevision,
  loadMutationState,
  MutationStateChangedError,
  parseSectionInput,
  rpcResult,
  SECTION_PATCH_FIELDS,
  UUID_PATTERN,
} from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string; sectionId: string }> };
const DELETE_FIELDS = new Set(["expectedCalculationRevision"]);

function mutationFailure(code: string) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only draft estimates can be edited.", code }, { status: 409 });
  if (code === "stale_calculation_revision") return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code }, { status: 409 });
  if (code === "section_not_empty") return NextResponse.json({ success: false, error: "The section must be empty before it can be deleted.", code }, { status: 409 });
  return NextResponse.json({ success: false, error: "Estimate section mutation failed.", code }, { status: code === "invalid_item" ? 400 : 500 });
}

async function prepare(request: NextRequest, context: RouteContext, allowed: ReadonlySet<string>) {
  const { estimateId, sectionId } = await context.params;
  if (!UUID_PATTERN.test(estimateId) || !UUID_PATTERN.test(sectionId)) return { response: NextResponse.json({ success: false, error: "Invalid estimate or section ID." }, { status: 400 }) };
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return { response: auth.response };
  if (!auth.authorization!.canEditPrices) return { response: NextResponse.json({ success: false, error: "You do not have permission to edit estimate prices." }, { status: 403 }) };
  const body = await request.json() as Record<string, unknown>;
  assertExactFields(body, allowed);
  const revision = expectedRevision(body.expectedCalculationRevision);
  const supabase = createAdminServerClient();
  const state = await loadMutationState(supabase, estimateId);
  if (!state) return { response: NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 }) };
  if (state.estimate.status !== "draft") return { response: mutationFailure("non_draft") };
  if (state.estimate.calculation_revision !== revision) return { response: mutationFailure("stale_calculation_revision") };
  const index = state.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return { response: NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 }) };
  return { response: null, estimateId, sectionId, auth, body, revision, supabase, state, index };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, SECTION_PATCH_FIELDS);
    if (prepared.response) return prepared.response;
    const { estimateId, sectionId, auth, body, revision, supabase, state, index } = prepared;
    if (Object.keys(body).length === 1) throw new TypeError("At least one section field is required.");
    const current = state.sections[index];
    const section = parseSectionInput(body, {
      name: String(current.name),
      customerDescription: typeof current.customer_description === "string" ? current.customer_description : null,
      internalNotes: typeof current.internal_notes === "string" ? current.internal_notes : null,
      sortOrder: Number(current.sort_order),
    });
    const result = await supabase.rpc("update_structured_estimate_section", {
      requested_estimate_id: estimateId, requested_expected_revision: revision, requested_section_id: sectionId,
      requested_name: section.name, requested_customer_description: section.customerDescription,
      requested_internal_notes: section.internalNotes, requested_sort_order: section.sortOrder,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    const completion = await completeCommittedMutationState(
      supabase, estimateId, auth.authorization!, outcome.next_calculation_revision, "sectionId", sectionId,
    );
    if (!completion.ok) return NextResponse.json(completion.body, { status: completion.status });
    const builderState = completion.state;
    return NextResponse.json({ success: true, sectionId, nextCalculationRevision: builderState.calculationRevision, ...builderState });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate section update failed." }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, DELETE_FIELDS);
    if (prepared.response) return prepared.response;
    const { estimateId, sectionId, auth, revision, supabase, state, index } = prepared;
    const result = await supabase.rpc("delete_structured_estimate_section", {
      requested_estimate_id: estimateId, requested_expected_revision: revision, requested_section_id: sectionId,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    const completion = await completeCommittedMutationState(
      supabase, estimateId, auth.authorization!, outcome.next_calculation_revision, "deletedSectionId", sectionId,
    );
    if (!completion.ok) return NextResponse.json(completion.body, { status: completion.status });
    const builderState = completion.state;
    return NextResponse.json({ success: true, deletedSectionId: sectionId, nextCalculationRevision: builderState.calculationRevision, ...builderState });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate section deletion failed." }, { status });
  }
}
