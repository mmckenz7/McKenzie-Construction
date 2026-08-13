import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, revision, UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const FIELDS = new Set([
  "expectedRevision",
  "idempotencyKey",
  "assignmentEventIds",
  "observation",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string; visitItemId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId, visitItemId } = await params;
    if (!UUID.test(visitId) || !UUID.test(visitItemId))
      throw new TypeError("Invalid ID.");
    const body = exactObject(await request.json(), FIELDS);
    const idempotencyKey =
      typeof body.idempotencyKey === "string"
        ? body.idempotencyKey.trim()
        : "";
    const assignmentEventIds = body.assignmentEventIds;
    if (
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      !Array.isArray(assignmentEventIds) ||
      assignmentEventIds.length < 1 ||
      assignmentEventIds.length > 12 ||
      assignmentEventIds.some((id) => typeof id !== "string" || !UUID.test(id))
    )
      throw new TypeError("Invalid intake evidence confirmation.");

    const result = await createAdminServerClient().rpc(
      "confirm_guided_site_visit_item_from_intake",
      {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_visit_id: visitId,
        requested_item_id: visitItemId,
        requested_expected_revision: revision(body.expectedRevision),
        requested_idempotency_key: idempotencyKey,
        requested_assignment_event_ids: assignmentEventIds,
        requested_observation: body.observation,
      },
    );
    if (result.error)
      return NextResponse.json(
        { success: false, error: "Intake evidence could not be confirmed." },
        { status: 500 },
      );
    const row = (result.data as Record<string, unknown>[])[0];
    const code = String(row.result_code);
    if (code !== "ok")
      return NextResponse.json(
        { success: false, resultCode: code, nextRevision: row.next_revision },
        {
          status: [
            "stale_revision",
            "not_editable",
            "idempotency_conflict",
          ].includes(code)
            ? 409
            : code === "not_found"
              ? 404
              : code === "forbidden"
                ? 403
                : 422,
        },
      );
    return NextResponse.json({
      success: true,
      confirmationId: row.confirmation_id,
      nextRevision: row.next_revision,
      idempotentReplay: row.idempotent_replay,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof TypeError
            ? error.message
            : "Intake evidence confirmation failed.",
      },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
