import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { parseDeckFinishDraftSnapshot } from "@/lib/deck-finish-draft";
import { authorizeEstimateRequest } from "@/lib/estimate-access";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, revision, UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const BODY_FIELDS = new Set([
  "expectedSelectionRevision",
  "idempotencyKey",
  "shapeRevisionId",
  "shapeRevision",
  "shapeDigest",
  "structuralPlanRevisionId",
  "selection",
]);

function firstRow(value: unknown) {
  return Array.isArray(value) ? (value[0] as Record<string, unknown> | undefined) : undefined;
}

function failure(code: string) {
  const conflict = ["stale_design", "stale_selection_revision", "idempotency_conflict"].includes(code);
  const forbidden = code === "forbidden";
  const notFound = code === "not_found";
  const messages: Record<string, string> = {
    stale_design: "The saved Deck shape or preliminary plan changed. Reload before saving these finishes.",
    stale_selection_revision: "These finish selections were saved somewhere else. Reload before trying again.",
    idempotency_conflict: "This save key belongs to a different finish selection.",
    forbidden: "You do not have permission to save Deck finish selections.",
    not_found: "The completed Deck visit was not found.",
    visit_incomplete: "Complete the Deck site visit before saving finishes.",
    not_editable: "This estimate can no longer be edited.",
    invalid_selection: "The Deck finish selection is invalid.",
  };
  return NextResponse.json(
    { success: false, error: messages[code] ?? "The Deck finish selection could not be saved.", code },
    { status: conflict ? 409 : forbidden ? 403 : notFound ? 404 : code === "invalid_selection" ? 400 : 422 },
  );
}

async function authorizeEstimateForVisit(
  request: NextRequest,
  companyId: string,
  visitId: string,
) {
  const visit = await createAdminServerClient()
    .from("guided_site_visits")
    .select("target_estimate_id")
    .eq("id", visitId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (visit.error)
    return {
      authorization: null,
      response: NextResponse.json(
        { success: false, error: "The Deck estimate could not be verified." },
        { status: 500 },
      ),
    };
  if (!visit.data)
    return { authorization: null, response: failure("not_found") };
  const estimateAuth = await authorizeEstimateRequest(
    request,
    String(visit.data.target_estimate_id),
  );
  if (estimateAuth.response) return estimateAuth;
  if (estimateAuth.authorization!.companyId !== companyId)
    return {
      authorization: null,
      response: NextResponse.json(
        { success: false, error: "You do not have permission to access these Deck costs." },
        { status: 403 },
      ),
    };
  return estimateAuth;
}

async function latestBindings(companyId: string, visitId: string) {
  const supabase = createAdminServerClient();
  const [shape, structuralPlan] = await Promise.all([
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
  if (shape.error || structuralPlan.error) throw new Error("The Deck design binding could not be loaded.");
  return { shape: shape.data, structuralPlan: structuralPlan.data };
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
    const estimateAuth = await authorizeEstimateForVisit(
      request,
      companyId,
      visitId,
    );
    if (estimateAuth.response) return estimateAuth.response;
    if (!estimateAuth.authorization!.canViewCosts)
      return NextResponse.json(
        { success: false, error: "You do not have permission to view estimate costs." },
        { status: 403 },
      );
    const supabase = createAdminServerClient();
    const [bindings, latest] = await Promise.all([
      latestBindings(companyId, visitId),
      supabase
        .from("guided_deck_finish_selection_revisions")
        .select("id,selection_revision,shape_revision_id,shape_revision,shape_digest,structural_plan_revision_id,selection_snapshot,saved_at")
        .eq("company_id", companyId)
        .eq("visit_id", visitId)
        .order("selection_revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (latest.error) throw new Error("The Deck finish selection could not be loaded.");
    if (!latest.data)
      return NextResponse.json(
        { success: true, currentSelectionRevision: 0, staleDesign: false, latestSelection: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const staleDesign =
      !bindings.shape ||
      !bindings.structuralPlan ||
      latest.data.shape_revision_id !== bindings.shape.id ||
      latest.data.shape_revision !== bindings.shape.shape_revision ||
      latest.data.shape_digest !== bindings.shape.request_sha256 ||
      latest.data.structural_plan_revision_id !== bindings.structuralPlan.id ||
      bindings.structuralPlan.shape_revision_id !== bindings.shape.id ||
      bindings.structuralPlan.shape_revision !== bindings.shape.shape_revision ||
      bindings.structuralPlan.shape_digest !== bindings.shape.request_sha256;
    if (staleDesign)
      return NextResponse.json(
        { success: true, currentSelectionRevision: latest.data.selection_revision, staleDesign: true, latestSelection: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const selection = parseDeckFinishDraftSnapshot(latest.data.selection_snapshot);
    return NextResponse.json(
      {
        success: true,
        currentSelectionRevision: latest.data.selection_revision,
        staleDesign: false,
        latestSelection: {
          id: latest.data.id,
          selectionRevision: latest.data.selection_revision,
          shapeRevisionId: latest.data.shape_revision_id,
          shapeRevision: latest.data.shape_revision,
          shapeDigest: latest.data.shape_digest,
          structuralPlanRevisionId: latest.data.structural_plan_revision_id,
          selection,
          savedAt: latest.data.saved_at,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, error: "The Deck finish selection could not be loaded." }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId } = await params;
    if (!UUID.test(visitId))
      return NextResponse.json({ success: false, error: "Invalid visit ID." }, { status: 400 });
    const estimateAuth = await authorizeEstimateForVisit(
      request,
      auth.authorization!.companyId,
      visitId,
    );
    if (estimateAuth.response) return estimateAuth.response;
    if (!estimateAuth.authorization!.canEditPrices)
      return NextResponse.json({ success: false, error: "You do not have permission to edit estimate prices." }, { status: 403 });
    const body = exactObject(await request.json(), BODY_FIELDS);
    const expectedSelectionRevision = revision(body.expectedSelectionRevision);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new TypeError("A valid save key is required.");
    if (
      typeof body.shapeRevisionId !== "string" ||
      !UUID.test(body.shapeRevisionId) ||
      !Number.isSafeInteger(body.shapeRevision) ||
      (body.shapeRevision as number) < 1 ||
      typeof body.shapeDigest !== "string" ||
      !/^[0-9a-f]{64}$/.test(body.shapeDigest) ||
      typeof body.structuralPlanRevisionId !== "string" ||
      !UUID.test(body.structuralPlanRevisionId)
    )
      throw new TypeError("The Deck design binding is invalid.");
    const selection = parseDeckFinishDraftSnapshot(body.selection);
    const requestSha256 = createHash("sha256")
      .update(JSON.stringify({ visitId, expectedSelectionRevision, shapeRevisionId: body.shapeRevisionId, shapeRevision: body.shapeRevision, shapeDigest: body.shapeDigest, structuralPlanRevisionId: body.structuralPlanRevisionId, selection }))
      .digest("hex");
    const result = await createAdminServerClient().rpc("create_guided_deck_finish_selection_revision", {
      requested_auth_user_id: auth.authorization!.authUserId,
      requested_visit_id: visitId,
      requested_expected_selection_revision: expectedSelectionRevision,
      requested_shape_revision_id: body.shapeRevisionId,
      requested_shape_revision: body.shapeRevision,
      requested_shape_digest: body.shapeDigest,
      requested_structural_plan_revision_id: body.structuralPlanRevisionId,
      requested_idempotency_key: idempotencyKey,
      requested_request_sha256: requestSha256,
      requested_selection_snapshot: selection,
    });
    if (result.error) throw new Error(result.error.message);
    const row = firstRow(result.data);
    const code = String(row?.result_code ?? "unknown");
    if (code !== "ok") return failure(code);
    return NextResponse.json(
      {
        success: true,
        id: row?.finish_selection_revision_id,
        selectionRevision: row?.next_selection_revision,
        idempotentReplay: row?.idempotent_replay,
        selection,
      },
      { status: row?.idempotent_replay ? 200 : 201 },
    );
  } catch (error) {
    const status = error instanceof TypeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json(
      { success: false, error: status === 400 && error instanceof Error ? error.message : "The Deck finish selection could not be saved." },
      { status },
    );
  }
}
