import { NextRequest, NextResponse } from "next/server";

import {
  buildDeckFinishMaterialMutation,
  DECK_FINISH_MATERIAL_APPLICATION_FIELDS,
  DECK_FINISH_MATERIAL_APPLICATION_VERSION,
  deckFinishMaterialPreview,
} from "@/lib/deck-finish-material-application";
import { parseDeckFinishDraftSnapshot } from "@/lib/deck-finish-draft";
import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import {
  assertExactFields,
  calculateMutation,
  canonicalItemRpcValue,
  completeCommittedMutationState,
  expectedRevision,
  loadMutationState,
  MutationStateChangedError,
  rpcResult,
  UUID_PATTERN,
} from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

const PREVIEW_FIELDS = new Set([
  "visitId",
  "finishSelectionRevisionId",
  "expectedFinishSelectionRevision",
]);

function failure(code: string) {
  if (code === "not_found")
    return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "forbidden")
    return NextResponse.json(
      { success: false, error: "Estimate price-edit access is required.", code },
      { status: 403 },
    );
  if (code === "non_draft")
    return NextResponse.json(
      { success: false, error: "Only draft estimates can receive Deck finish costs.", code },
      { status: 409 },
    );
  if (["stale_design", "stale_selection_revision", "stale_calculation_revision"].includes(code))
    return NextResponse.json(
      { success: false, error: "The Deck design, finishes, or estimate changed. Reload before adding costs.", code },
      { status: 409 },
    );
  if (["replayed_application", "application_identity_conflict", "already_applied"].includes(code))
    return NextResponse.json(
      { success: false, error: "These Deck finish costs were already added and will not be duplicated.", code },
      { status: 409 },
    );
  if (code === "invalid_application")
    return NextResponse.json(
      { success: false, error: "The reviewed Deck finish-cost application is invalid.", code },
      { status: 400 },
    );
  return NextResponse.json(
    { success: false, error: "Deck finish costs could not be added." },
    { status: 500 },
  );
}

async function loadCurrentFinishSelection(
  companyId: string,
  estimateId: string,
  visitId: string,
  finishSelectionRevisionId: string,
  finishSelectionRevision: number,
) {
  const supabase = createAdminServerClient();
  const [visit, finish, latestFinish, shape, structural] = await Promise.all([
    supabase
      .from("guided_site_visits")
      .select("id,revision,status,target_estimate_id")
      .eq("id", visitId)
      .eq("company_id", companyId)
      .eq("target_estimate_id", estimateId)
      .maybeSingle(),
    supabase
      .from("guided_deck_finish_selection_revisions")
      .select("id,selection_revision,shape_revision_id,shape_revision,shape_digest,structural_plan_revision_id,selection_snapshot")
      .eq("id", finishSelectionRevisionId)
      .eq("company_id", companyId)
      .eq("visit_id", visitId)
      .eq("target_estimate_id", estimateId)
      .maybeSingle(),
    supabase
      .from("guided_deck_finish_selection_revisions")
      .select("id,selection_revision")
      .eq("company_id", companyId)
      .eq("visit_id", visitId)
      .order("selection_revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("guided_deck_shape_revisions")
      .select("id,shape_revision,request_sha256")
      .eq("company_id", companyId)
      .eq("visit_id", visitId)
      .order("shape_revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("guided_deck_structural_plan_revisions")
      .select("id,shape_revision_id,shape_revision,shape_digest")
      .eq("company_id", companyId)
      .eq("visit_id", visitId)
      .order("plan_revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if ([visit, finish, latestFinish, shape, structural].some((result) => result.error))
    throw new Error("The saved Deck finish evidence could not be loaded.");
  if (!visit.data || visit.data.status !== "completed" || !finish.data || !latestFinish.data)
    return { code: "not_found" as const };
  if (
    finish.data.selection_revision !== finishSelectionRevision ||
    latestFinish.data.id !== finish.data.id ||
    latestFinish.data.selection_revision !== finishSelectionRevision
  )
    return { code: "stale_selection_revision" as const };
  if (
    !shape.data ||
    !structural.data ||
    finish.data.shape_revision_id !== shape.data.id ||
    finish.data.shape_revision !== shape.data.shape_revision ||
    finish.data.shape_digest !== shape.data.request_sha256 ||
    finish.data.structural_plan_revision_id !== structural.data.id ||
    structural.data.shape_revision_id !== shape.data.id ||
    structural.data.shape_revision !== shape.data.shape_revision ||
    structural.data.shape_digest !== shape.data.request_sha256
  )
    return { code: "stale_design" as const };
  return {
    code: "ok" as const,
    visit: visit.data,
    finish: finish.data,
    selection: parseDeckFinishDraftSnapshot(finish.data.selection_snapshot),
  };
}

async function prepare(request: NextRequest, context: RouteContext, fields: ReadonlySet<string>) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) return { response: failure("not_found") };
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return { response: auth.response };
  if (!auth.authorization!.canEditPrices) return { response: failure("forbidden") };
  const body = (await request.json()) as Record<string, unknown>;
  assertExactFields(body, fields);
  if (
    typeof body.visitId !== "string" ||
    !UUID_PATTERN.test(body.visitId) ||
    typeof body.finishSelectionRevisionId !== "string" ||
    !UUID_PATTERN.test(body.finishSelectionRevisionId) ||
    !Number.isSafeInteger(body.expectedFinishSelectionRevision) ||
    (body.expectedFinishSelectionRevision as number) < 1
  )
    throw new TypeError("The saved Deck finish revision is invalid.");
  const loaded = await loadCurrentFinishSelection(
    auth.authorization!.companyId,
    estimateId,
    body.visitId,
    body.finishSelectionRevisionId,
    body.expectedFinishSelectionRevision as number,
  );
  if (loaded.code !== "ok") return { response: failure(loaded.code) };
  return { estimateId, auth: auth.authorization!, body, loaded };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, PREVIEW_FIELDS);
    if ("response" in prepared) return prepared.response;
    return NextResponse.json({
      success: true,
      ...deckFinishMaterialPreview({
        finishSelectionRevisionId: prepared.loaded.finish.id,
        finishSelectionRevision: prepared.loaded.finish.selection_revision,
        selection: prepared.loaded.selection,
      }),
    });
  } catch (error) {
    const status = error instanceof TypeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json(
      { success: false, error: status === 400 && error instanceof Error ? error.message : "Deck finish costs could not be previewed." },
      { status },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(
      request,
      context,
      DECK_FINISH_MATERIAL_APPLICATION_FIELDS,
    );
    if ("response" in prepared) return prepared.response;
    const body = prepared.body;
    if (
      typeof body.applicationId !== "string" ||
      !UUID_PATTERN.test(body.applicationId) ||
      typeof body.idempotencyKey !== "string" ||
      !UUID_PATTERN.test(body.idempotencyKey) ||
      body.applicationVersion !== DECK_FINISH_MATERIAL_APPLICATION_VERSION ||
      typeof body.previewBinding !== "string" ||
      !/^[0-9a-f]{64}$/.test(body.previewBinding)
    )
      throw new TypeError("The Deck finish-cost application identity is invalid.");
    const calculationRevision = expectedRevision(body.expectedCalculationRevision);
    const supabase = createAdminServerClient();
    const state = await loadMutationState(supabase, prepared.estimateId);
    if (!state) return failure("not_found");
    if (state.estimate.status !== "draft") return failure("non_draft");
    if (state.estimate.calculation_revision !== calculationRevision)
      return failure("stale_calculation_revision");
    const built = buildDeckFinishMaterialMutation({
      finishSelectionRevisionId: prepared.loaded.finish.id,
      finishSelectionRevision: prepared.loaded.finish.selection_revision,
      selection: prepared.loaded.selection,
      state,
      previewBinding: body.previewBinding,
    });
    const calculated = calculateMutation(state.estimate, [
      ...state.items,
      ...built.newItems,
    ]);
    const result = await supabase.rpc("apply_reviewed_deck_finish_materials", {
      requested_auth_user_id: prepared.auth.authUserId,
      requested_estimate_id: prepared.estimateId,
      requested_visit_id: body.visitId,
      requested_finish_selection_revision_id: body.finishSelectionRevisionId,
      requested_application_id: body.applicationId,
      requested_idempotency_key: body.idempotencyKey,
      requested_expected_finish_selection_revision: body.expectedFinishSelectionRevision,
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
      supabase,
      prepared.estimateId,
      prepared.auth,
      outcome.next_calculation_revision,
      "applicationId",
      String(body.applicationId),
    );
    if (!completion.ok)
      return NextResponse.json(completion.body, { status: completion.status });
    return NextResponse.json(
      {
        success: true,
        applicationId: body.applicationId,
        sectionId: built.sectionId,
        materialSubtotal: built.preview.materialSubtotal,
        nextCalculationRevision: completion.state.calculationRevision,
        ...completion.state,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MutationStateChangedError)
      return failure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json(
      { success: false, error: status === 400 && error instanceof Error ? error.message : "Deck finish costs could not be added." },
      { status },
    );
  }
}
