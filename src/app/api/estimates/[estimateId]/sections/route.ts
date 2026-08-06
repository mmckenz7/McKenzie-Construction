import { randomUUID } from "node:crypto";

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
  SECTION_CREATE_FIELDS,
  UUID_PATTERN,
} from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

function mutationFailure(code: string) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only draft estimates can be edited.", code }, { status: 409 });
  if (code === "stale_calculation_revision") return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code }, { status: 409 });
  return NextResponse.json({ success: false, error: "Estimate section mutation failed.", code }, { status: code === "invalid_item" ? 400 : 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canEditPrices) return NextResponse.json({ success: false, error: "You do not have permission to edit estimate prices." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    assertExactFields(body, SECTION_CREATE_FIELDS);
    const revision = expectedRevision(body.expectedCalculationRevision);
    const section = parseSectionInput(body);
    const sectionId = randomUUID();
    const supabase = createAdminServerClient();
    const state = await loadMutationState(supabase, estimateId);
    if (!state) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    if (state.estimate.status !== "draft") return mutationFailure("non_draft");
    if (state.estimate.calculation_revision !== revision) return mutationFailure("stale_calculation_revision");
    const result = await supabase.rpc("create_structured_estimate_section", {
      requested_estimate_id: estimateId,
      requested_expected_revision: revision,
      requested_section_id: sectionId,
      requested_name: section.name,
      requested_customer_description: section.customerDescription,
      requested_internal_notes: section.internalNotes,
      requested_sort_order: section.sortOrder,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return mutationFailure(outcome.result_code);
    const completion = await completeCommittedMutationState(
      supabase, estimateId, auth.authorization!, outcome.next_calculation_revision, "sectionId", sectionId,
    );
    if (!completion.ok) return NextResponse.json(completion.body, { status: completion.status });
    const builderState = completion.state;
    return NextResponse.json({ success: true, sectionId, nextCalculationRevision: builderState.calculationRevision, ...builderState }, { status: 201 });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return mutationFailure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate section creation failed." }, { status });
  }
}
