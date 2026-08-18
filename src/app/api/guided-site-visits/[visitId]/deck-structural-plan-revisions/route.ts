import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, revision, UUID } from "@/lib/guided-site-visits/core";
import {
  buildCustomDeckEstimatingConcept,
  isCanonicalCustomDeckEstimatingConcept,
  isValidDeckOutline,
  type CustomDeckJoistDirection,
  type DeckOutlinePoint,
  type DeckStairPlacement,
} from "@/lib/deck-prescriptive-plan";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const BODY_FIELDS = new Set([
  "expectedPlanRevision",
  "idempotencyKey",
  "joistDirection",
  "joistSpacingInches",
]);

function parseShape(row: Record<string, unknown>) {
  if (
    typeof row.id !== "string" ||
    !UUID.test(row.id) ||
    !Number.isSafeInteger(row.shape_revision) ||
    !Array.isArray(row.outline) ||
    typeof row.stairs_present !== "boolean" ||
    typeof row.request_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.request_sha256)
  )
    throw new TypeError("The approved Deck shape is invalid.");
  const outline = row.outline as DeckOutlinePoint[];
  if (!isValidDeckOutline(outline))
    throw new TypeError("The approved Deck shape is invalid.");
  return {
    id: row.id,
    shapeRevision: row.shape_revision as number,
    outline,
    stairsPresent: row.stairs_present,
    stairPlacement: (row.stair_placement ?? null) as DeckStairPlacement | null,
    shapeDigest: row.request_sha256,
  };
}

async function latestShape(
  companyId: string,
  visitId: string,
) {
  const result = await createAdminServerClient()
    .from("guided_deck_shape_revisions")
    .select("id,shape_revision,outline,stairs_present,stair_placement,request_sha256")
    .eq("company_id", companyId)
    .eq("visit_id", visitId)
    .order("shape_revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error("The approved Deck shape could not be loaded.");
  return result.data ? parseShape(result.data) : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId } = await params;
    if (!UUID.test(visitId))
      return NextResponse.json({ success: false, error: "Invalid visit ID." }, { status: 400 });
    const companyId = auth.authorization!.companyId;
    const [shape, plan] = await Promise.all([
      latestShape(companyId, visitId),
      createAdminServerClient()
        .from("guided_deck_structural_plan_revisions")
        .select("id,plan_revision,shape_revision_id,shape_revision,shape_digest,source_type,status,concept_payload,unresolved_packages,created_at")
        .eq("company_id", companyId)
        .eq("visit_id", visitId)
        .order("plan_revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (plan.error)
      return NextResponse.json({ success: false, error: "The preliminary Deck plan could not be loaded." }, { status: 500 });
    if (!shape)
      return NextResponse.json({ success: true, latestPlan: null, currentPlanRevision: 0, staleShape: false }, { headers: { "Cache-Control": "private, no-store" } });
    if (!plan.data)
      return NextResponse.json({ success: true, latestPlan: null, currentPlanRevision: 0, staleShape: false }, { headers: { "Cache-Control": "private, no-store" } });
    const staleShape =
      plan.data.shape_revision_id !== shape.id ||
      plan.data.shape_revision !== shape.shapeRevision ||
      plan.data.shape_digest !== shape.shapeDigest;
    if (staleShape)
      return NextResponse.json({ success: true, latestPlan: null, currentPlanRevision: plan.data.plan_revision, staleShape: true }, { headers: { "Cache-Control": "private, no-store" } });
    if (!isCanonicalCustomDeckEstimatingConcept(plan.data.concept_payload, shape))
      return NextResponse.json({ success: false, error: "The saved preliminary Deck plan failed its geometry check." }, { status: 500 });
    return NextResponse.json(
      {
        success: true,
        staleShape: false,
        currentPlanRevision: plan.data.plan_revision,
        latestPlan: {
          id: plan.data.id,
          planRevision: plan.data.plan_revision,
          shapeRevisionId: plan.data.shape_revision_id,
          shapeRevision: plan.data.shape_revision,
          shapeDigest: plan.data.shape_digest,
          sourceType: plan.data.source_type,
          status: plan.data.status,
          concept: plan.data.concept_payload,
          unresolvedPackages: plan.data.unresolved_packages,
          createdAt: plan.data.created_at,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, error: "The preliminary Deck plan could not be loaded." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId } = await params;
    if (!UUID.test(visitId))
      return NextResponse.json({ success: false, error: "Invalid visit ID." }, { status: 400 });
    const body = exactObject(await request.json(), BODY_FIELDS);
    const expectedPlanRevision = revision(body.expectedPlanRevision);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new TypeError("A valid save key is required.");
    const joistDirection = body.joistDirection as CustomDeckJoistDirection;
    if (joistDirection !== "house_to_yard" && joistDirection !== "side_to_side")
      throw new TypeError("Choose a supported joist-run direction.");
    if (body.joistSpacingInches !== 12 && body.joistSpacingInches !== 16 && body.joistSpacingInches !== 24)
      throw new TypeError("Choose 12, 16, or 24 inches on center.");
    const shape = await latestShape(auth.authorization!.companyId, visitId);
    if (!shape)
      return NextResponse.json({ success: false, error: "Approve the Deck footprint before generating its preliminary plan." }, { status: 422 });
    const concept = buildCustomDeckEstimatingConcept({
      shapeRevisionId: shape.id,
      shapeRevision: shape.shapeRevision,
      outline: shape.outline,
      stairsPresent: shape.stairsPresent,
      stairPlacement: shape.stairPlacement,
      joistDirection,
      joistSpacingInches: body.joistSpacingInches,
    });
    if (!concept)
      return NextResponse.json({ success: false, error: "This outline is outside the supported preliminary geometry generator." }, { status: 422 });
    const requestSha256 = createHash("sha256")
      .update(JSON.stringify({ visitId, expectedPlanRevision, shapeRevisionId: shape.id, shapeRevision: shape.shapeRevision, shapeDigest: shape.shapeDigest, concept }))
      .digest("hex");
    const result = await createAdminServerClient().rpc("create_guided_deck_structural_plan_revision", {
      requested_auth_user_id: auth.authorization!.authUserId,
      requested_visit_id: visitId,
      requested_expected_plan_revision: expectedPlanRevision,
      requested_shape_revision_id: shape.id,
      requested_shape_revision: shape.shapeRevision,
      requested_shape_digest: shape.shapeDigest,
      requested_idempotency_key: idempotencyKey,
      requested_request_sha256: requestSha256,
      requested_concept_payload: concept,
      requested_unresolved_packages: concept.unresolvedPackages,
    });
    if (result.error)
      return NextResponse.json({ success: false, error: "The preliminary Deck plan could not be saved." }, { status: 500 });
    const row = (result.data as Record<string, unknown>[])[0];
    const code = String(row.result_code ?? "unknown");
    if (code === "stale_shape_revision" || code === "stale_plan_revision" || code === "idempotency_conflict")
      return NextResponse.json({ success: false, error: code === "stale_shape_revision" ? "The Deck shape changed. Reload before generating again." : code === "stale_plan_revision" ? "The preliminary plan changed elsewhere. Reload before generating again." : "This save key belongs to a different preliminary plan.", code }, { status: 409 });
    if (code === "forbidden")
      return NextResponse.json({ success: false, error: "You do not have permission to save this preliminary plan.", code }, { status: 403 });
    if (code === "not_found")
      return NextResponse.json({ success: false, error: "The completed site visit was not found.", code }, { status: 404 });
    if (code !== "ok")
      return NextResponse.json({ success: false, error: code === "visit_incomplete" ? "Complete the site visit first." : code === "not_editable" ? "This estimate can no longer be edited." : "The preliminary plan was invalid.", code }, { status: 422 });
    return NextResponse.json({ success: true, id: row.structural_plan_revision_id, planRevision: row.next_plan_revision, idempotentReplay: row.idempotent_replay, concept }, { status: row.idempotent_replay ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof TypeError ? error.message : "The preliminary Deck plan could not be saved." }, { status: error instanceof TypeError ? 400 : 500 });
  }
}
