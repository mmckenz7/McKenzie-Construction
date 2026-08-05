import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import {
  assertExactFields,
  calculateMutation,
  expectedRevision,
  loadMutationState,
  MutationStateChangedError,
  parseSectionInput,
  projectMutationState,
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
    const { calculation } = calculateMutation(state.estimate, state.items);
    const result = await supabase.rpc("update_structured_estimate_section", {
      requested_estimate_id: estimateId, requested_expected_revision: revision, requested_section_id: sectionId,
      requested_name: section.name, requested_customer_description: section.customerDescription,
      requested_internal_notes: section.internalNotes, requested_sort_order: section.sortOrder,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    state.sections[index] = { id: sectionId, name: section.name, customer_description: section.customerDescription, internal_notes: section.internalNotes, sort_order: section.sortOrder };
    const projection = projectMutationState(state, calculation, auth.authorization!, outcome.next_calculation_revision);
    return NextResponse.json({ success: true, sectionId, nextCalculationRevision: outcome.next_calculation_revision, ...projection });
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
    const { calculation } = calculateMutation(state.estimate, state.items);
    const result = await supabase.rpc("delete_structured_estimate_section", {
      requested_estimate_id: estimateId, requested_expected_revision: revision, requested_section_id: sectionId,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    state.sections.splice(index, 1);
    const projection = projectMutationState(state, calculation, auth.authorization!, outcome.next_calculation_revision);
    return NextResponse.json({ success: true, deletedSectionId: sectionId, nextCalculationRevision: outcome.next_calculation_revision, ...projection });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate section deletion failed." }, { status });
  }
}
