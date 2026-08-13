import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, revision, UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const F = new Set([
  "expectedRevision",
  "action",
  "observation",
  "followUpReasonCode",
  "followUpNotes",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string; visitItemId: string }> },
) {
  const auth = await authorizeGuidedSiteVisit(request);
  if (auth.response) return auth.response;
  const { visitId, visitItemId } = await params;
  if (!UUID.test(visitId) || !UUID.test(visitItemId))
    return NextResponse.json(
      { success: false, error: "Invalid ID." },
      { status: 400 },
    );
  try {
    const body = exactObject(await request.json(), F);
    const db = createAdminServerClient();
    const result =
      body.action === "complete_optional"
        ? await db.rpc("complete_optional_guided_site_visit_item", {
            requested_auth_user_id: auth.authorization!.authUserId,
            requested_visit_id: visitId,
            requested_item_id: visitItemId,
            requested_expected_revision: revision(body.expectedRevision),
            requested_notes:
              typeof body.followUpNotes === "string" ? body.followUpNotes : "",
          })
        : await db.rpc("update_guided_site_visit_item", {
            requested_auth_user_id: auth.authorization!.authUserId,
            requested_visit_id: visitId,
            requested_item_id: visitItemId,
            requested_expected_revision: revision(body.expectedRevision),
            requested_action: body.action,
            requested_observation: body.observation,
            requested_follow_up_reason_code: body.followUpReasonCode ?? null,
            requested_follow_up_notes: body.followUpNotes ?? null,
          });
    if (result.error) throw new Error(result.error.message);
    const row = (result.data as Record<string, unknown>[])[0];
    return NextResponse.json(
      {
        success: row.result_code === "ok",
        resultCode: row.result_code,
        nextRevision: row.next_revision,
      },
      {
        status:
          row.result_code === "ok"
            ? 200
            : ["stale_revision", "not_editable"].includes(
                  String(row.result_code),
                )
              ? 409
              : row.result_code === "not_found"
                ? 404
                : 400,
      },
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Invalid item." },
      { status: e instanceof TypeError ? 400 : 500 },
    );
  }
}
