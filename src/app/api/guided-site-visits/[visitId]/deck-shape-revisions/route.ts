import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, revision, UUID } from "@/lib/guided-site-visits/core";
import {
  isValidDeckOutline,
  type DeckOutlinePoint,
} from "@/lib/deck-prescriptive-plan";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const BODY_FIELDS = new Set([
  "expectedShapeRevision",
  "idempotencyKey",
  "projectKind",
  "outline",
  "stairsPresent",
]);

function parseOutline(value: unknown): DeckOutlinePoint[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 24)
    throw new TypeError("The deck outline must contain 3 to 24 corners.");
  const points = value.map((entry) => {
    const point = exactObject(entry, new Set(["x", "y"]));
    if (
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > 200 ||
      point.y > 200
    )
      throw new TypeError("A deck corner is outside the supported drawing area.");
    return { x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) };
  });
  if (!isValidDeckOutline(points))
    throw new TypeError("The deck outline crosses, overlaps, or collapses.");
  return points;
}

function canonicalRequest(value: {
  visitId: string;
  expectedShapeRevision: number;
  projectKind: "replacement" | "new_construction";
  outline: readonly DeckOutlinePoint[];
  stairsPresent: boolean;
}) {
  return JSON.stringify({
    visitId: value.visitId,
    expectedShapeRevision: value.expectedShapeRevision,
    projectKind: value.projectKind,
    outline: value.outline.map((point) => ({ x: point.x, y: point.y })),
    stairsPresent: value.stairsPresent,
  });
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
    const result = await createAdminServerClient()
      .from("guided_deck_shape_revisions")
      .select("id,shape_revision,project_kind,outline,stairs_present,source,source_visit_revision,approved_at")
      .eq("company_id", auth.authorization!.companyId)
      .eq("visit_id", visitId)
      .order("shape_revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error)
      return NextResponse.json({ success: false, error: "The saved Deck shape could not be loaded." }, { status: 500 });
    return NextResponse.json(
      {
        success: true,
        latestApprovedShape: result.data
          ? {
              id: result.data.id,
              shapeRevision: result.data.shape_revision,
              projectKind: result.data.project_kind,
              outline: result.data.outline,
              stairsPresent: result.data.stairs_present,
              source: result.data.source,
              sourceVisitRevision: result.data.source_visit_revision,
              approvedAt: result.data.approved_at,
            }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, error: "The saved Deck shape could not be loaded." }, { status: 500 });
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
    const expectedShapeRevision = revision(body.expectedShapeRevision);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new TypeError("A valid save key is required.");
    if (body.projectKind !== "replacement" && body.projectKind !== "new_construction")
      throw new TypeError("Choose replacement or new construction.");
    if (typeof body.stairsPresent !== "boolean")
      throw new TypeError("Confirm whether the Deck has stairs.");
    const outline = parseOutline(body.outline);
    const requestSha256 = createHash("sha256")
      .update(canonicalRequest({
        visitId,
        expectedShapeRevision,
        projectKind: body.projectKind,
        outline,
        stairsPresent: body.stairsPresent,
      }))
      .digest("hex");
    const result = await createAdminServerClient().rpc("approve_guided_deck_shape_revision", {
      requested_auth_user_id: auth.authorization!.authUserId,
      requested_visit_id: visitId,
      requested_expected_shape_revision: expectedShapeRevision,
      requested_idempotency_key: idempotencyKey,
      requested_request_sha256: requestSha256,
      requested_project_kind: body.projectKind,
      requested_outline: outline,
      requested_stairs_present: body.stairsPresent,
    });
    if (result.error)
      return NextResponse.json({ success: false, error: "The Deck shape could not be saved." }, { status: 500 });
    const row = (result.data as Record<string, unknown>[])[0];
    const code = String(row.result_code ?? "unknown");
    if (code === "stale_shape_revision")
      return NextResponse.json({ success: false, error: "The Deck shape changed elsewhere. Reload before saving again.", code }, { status: 409 });
    if (code === "idempotency_conflict")
      return NextResponse.json({ success: false, error: "This save key belongs to a different Deck shape.", code }, { status: 409 });
    if (code === "forbidden")
      return NextResponse.json({ success: false, error: "You do not have permission to approve this Deck shape.", code }, { status: 403 });
    if (code === "not_found")
      return NextResponse.json({ success: false, error: "The completed site visit was not found.", code }, { status: 404 });
    if (code === "visit_incomplete" || code === "not_editable" || code === "invalid_shape")
      return NextResponse.json({ success: false, error: code === "visit_incomplete" ? "Complete the site visit before approving the Deck shape." : code === "not_editable" ? "This estimate can no longer be edited." : "The Deck outline is invalid.", code }, { status: 422 });
    if (code !== "ok")
      return NextResponse.json({ success: false, error: "The Deck shape was rejected.", code }, { status: 422 });
    return NextResponse.json(
      {
        success: true,
        shapeRevisionId: row.shape_revision_id,
        shapeRevision: row.next_shape_revision,
        idempotentReplay: row.idempotent_replay,
        projectKind: body.projectKind,
        outline,
        stairsPresent: body.stairsPresent,
      },
      { status: row.idempotent_replay ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof TypeError ? error.message : "The Deck shape could not be saved." },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
