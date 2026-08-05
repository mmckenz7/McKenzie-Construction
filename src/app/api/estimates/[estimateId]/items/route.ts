import { randomUUID } from "node:crypto";

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

type RouteContext = { params: Promise<{ estimateId: string }> };

function mutationFailure(code: string) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only draft estimates can be edited.", code }, { status: 409 });
  if (code === "stale_calculation_revision") return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code }, { status: 409 });
  if (code === "invalid_item") return NextResponse.json({ success: false, error: "The estimate item is invalid.", code }, { status: 400 });
  return NextResponse.json({ success: false, error: "Estimate item calculation failed.", code: "invalid_calculation" }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canEditPrices) return NextResponse.json({ success: false, error: "You do not have permission to edit estimate prices." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    assertExactFields(body, ITEM_FIELDS);
    const revision = expectedRevision(body.expectedCalculationRevision);
    const itemId = randomUUID();
    const item = parseCanonicalItem(itemId, body);
    const supabase = createAdminServerClient();
    const state = await loadMutationState(supabase, estimateId);
    if (!state) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    if (state.estimate.status !== "draft") return mutationFailure("non_draft");
    if (state.estimate.calculation_revision !== revision) return mutationFailure("stale_calculation_revision");
    if (!state.sections.some((section) => section.id === item.sectionId)) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    state.items.push(item);
    const calculated = calculateMutation(state.estimate, state.items);
    const result = await supabase.rpc("create_structured_estimate_item", {
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
    return NextResponse.json({ success: true, itemId, nextCalculationRevision: outcome.next_calculation_revision, ...projection }, { status: 201 });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate item creation failed." }, { status });
  }
}
