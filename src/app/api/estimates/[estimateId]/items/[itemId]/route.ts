import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import {
  assertExactFields,
  calculateMutation,
  canonicalItemRpcValue,
  expectedRevision,
  ITEM_FIELDS,
  loadMutationState,
  MutationStateChangedError,
  parseCanonicalItem,
  projectMutationState,
  rpcResult,
  UUID_PATTERN,
} from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string; itemId: string }> };
const DELETE_FIELDS = new Set(["expectedCalculationRevision"]);

function mutationFailure(code: string) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only draft estimates can be edited.", code }, { status: 409 });
  if (code === "stale_calculation_revision") return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code }, { status: 409 });
  if (code === "invalid_item") return NextResponse.json({ success: false, error: "The estimate item is invalid.", code }, { status: 400 });
  return NextResponse.json({ success: false, error: "Estimate item calculation failed.", code: "invalid_calculation" }, { status: 500 });
}

async function prepare(request: NextRequest, context: RouteContext, allowed: ReadonlySet<string>) {
  const { estimateId, itemId } = await context.params;
  if (!UUID_PATTERN.test(estimateId) || !UUID_PATTERN.test(itemId)) return { response: NextResponse.json({ success: false, error: "Invalid estimate or item ID." }, { status: 400 }) };
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
  const index = state.items.findIndex((item) => item.id === itemId);
  if (index < 0) return { response: NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 }) };
  return { response: null, estimateId, itemId, auth, body, revision, supabase, state, index };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, ITEM_FIELDS);
    if (prepared.response) return prepared.response;
    const { estimateId, itemId, auth, body, revision, supabase, state, index } = prepared;
    if (Object.keys(body).length === 1) throw new TypeError("At least one item field is required.");
    const item = parseCanonicalItem(itemId, body, state.items[index]);
    if (!state.sections.some((section) => section.id === item.sectionId)) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    state.items[index] = item;
    const calculated = calculateMutation(state.estimate, state.items);
    const result = await supabase.rpc("update_structured_estimate_item", {
      requested_estimate_id: estimateId,
      requested_expected_revision: revision,
      requested_item_id: itemId,
      requested_item: canonicalItemRpcValue(item),
      requested_item_calculations: calculated.itemCalculations,
      requested_estimate_calculation: calculated.estimateCalculation,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    const projection = projectMutationState(state, calculated.calculation, auth.authorization!, outcome.next_calculation_revision);
    return NextResponse.json({ success: true, itemId, nextCalculationRevision: outcome.next_calculation_revision, ...projection });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate item update failed." }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, DELETE_FIELDS);
    if (prepared.response) return prepared.response;
    const { estimateId, itemId, auth, revision, supabase, state, index } = prepared;
    state.items.splice(index, 1);
    const calculated = calculateMutation(state.estimate, state.items);
    const result = await supabase.rpc("delete_structured_estimate_item", {
      requested_estimate_id: estimateId,
      requested_expected_revision: revision,
      requested_item_id: itemId,
      requested_item_calculations: calculated.itemCalculations,
      requested_estimate_calculation: calculated.estimateCalculation,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    const projection = projectMutationState(state, calculated.calculation, auth.authorization!, outcome.next_calculation_revision);
    return NextResponse.json({ success: true, deletedItemId: itemId, nextCalculationRevision: outcome.next_calculation_revision, ...projection });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate item deletion failed." }, { status });
  }
}
