import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import {
  assertExactFields, calculateMutation, canonicalItemRpcValue,
  completeCommittedMutationState, expectedRevision, loadMutationState,
  MutationStateChangedError, rpcResult, UUID_PATTERN,
} from "@/lib/estimate-mutations";
import {
  buildReviewedFenceMaterialMutation,
  FENCE_MATERIAL_APPLICATION_FIELDS,
} from "@/lib/fence-material-application";
import { FENCE_ESTIMATE_APPLICATION_VERSION } from "@/lib/fence-estimate-application";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

function failure(code: string) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "forbidden") return NextResponse.json({ success: false, error: "Estimate price-edit access is required.", code }, { status: 403 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only draft estimates can receive Fence materials.", code }, { status: 409 });
  if (code === "stale_fence_revision" || code === "stale_calculation_revision") {
    return NextResponse.json({ success: false, error: "The Fence preview or estimate changed. Reload and review it again.", code }, { status: 409 });
  }
  if (code === "replayed_application" || code === "application_identity_conflict") {
    return NextResponse.json({ success: false, error: "This Fence material action was already used and will not be reapplied.", code }, { status: 409 });
  }
  if (code === "invalid_application") return NextResponse.json({ success: false, error: "The reviewed Fence material application is invalid.", code }, { status: 400 });
  return NextResponse.json({ success: false, error: "Fence materials could not be applied." }, { status: 500 });
}

function firstRpcRow(value: unknown) {
  return (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | undefined;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canEditPrices) return failure("forbidden");

  try {
    const body = await request.json() as Record<string, unknown>;
    assertExactFields(body, FENCE_MATERIAL_APPLICATION_FIELDS);
    if (Object.keys(body).length !== FENCE_MATERIAL_APPLICATION_FIELDS.size
      || typeof body.applicationId !== "string" || !UUID_PATTERN.test(body.applicationId)
      || typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)
      || body.applicationVersion !== FENCE_ESTIMATE_APPLICATION_VERSION
      || typeof body.previewBinding !== "string" || body.previewBinding.length < 1 || body.previewBinding.length > 12000
      || !Number.isSafeInteger(body.expectedFenceRevision) || (body.expectedFenceRevision as number) < 1) {
      throw new TypeError("The Fence material action identity or revision is invalid.");
    }
    const calculationRevision = expectedRevision(body.expectedCalculationRevision);
    const supabase = createAdminServerClient();
    const [state, draftResult] = await Promise.all([
      loadMutationState(supabase, estimateId),
      supabase.rpc("get_fence_estimate_draft", {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_estimate_id: estimateId,
      }),
    ]);
    if (!state) return failure("not_found");
    if (draftResult.error) throw new Error("The saved Fence draft could not be loaded.");
    const draftOutcome = firstRpcRow(draftResult.data);
    if (draftOutcome?.result_code !== "ok" || !draftOutcome.draft) return failure(String(draftOutcome?.result_code ?? "not_found"));
    if (state.estimate.status !== "draft") return failure("non_draft");
    if (state.estimate.calculation_policy_version !== "structured-estimate-v2-material-tax") return failure("not_found");
    if (state.estimate.calculation_revision !== calculationRevision) return failure("stale_calculation_revision");

    const built = buildReviewedFenceMaterialMutation({
      draft: draftOutcome.draft as never,
      state,
      expectedFenceRevision: body.expectedFenceRevision as number,
      previewBinding: body.previewBinding,
    });
    const proposedItems = [...state.items, ...built.newItems];
    const calculated = calculateMutation(state.estimate, proposedItems);
    const result = await supabase.rpc("apply_reviewed_fence_materials", {
      requested_auth_user_id: auth.authorization!.authUserId,
      requested_estimate_id: estimateId,
      requested_application_id: body.applicationId,
      requested_idempotency_key: body.idempotencyKey,
      requested_expected_fence_revision: body.expectedFenceRevision,
      requested_expected_calculation_revision: calculationRevision,
      requested_application_version: body.applicationVersion,
      requested_preview_binding: body.previewBinding,
      requested_section_id: built.sectionId,
      requested_new_items: built.newItems.map(canonicalItemRpcValue),
      requested_item_calculations: calculated.itemCalculations,
      requested_estimate_calculation: calculated.estimateCalculation,
      requested_evidence_snapshot: built.evidenceSnapshot,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return failure(outcome.result_code);
    const completion = await completeCommittedMutationState(
      supabase, estimateId, auth.authorization!, outcome.next_calculation_revision,
      "applicationId", String(body.applicationId),
    );
    if (!completion.ok) return NextResponse.json(completion.body, { status: completion.status });
    return NextResponse.json({
      success: true,
      applicationId: body.applicationId,
      sectionId: built.sectionId,
      nextCalculationRevision: completion.state.calculationRevision,
      ...completion.state,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return failure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: status === 400 && error instanceof Error ? error.message : "Fence materials could not be applied." }, { status });
  }
}
