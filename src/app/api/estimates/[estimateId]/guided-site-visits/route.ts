import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { estimateId } = await params;
    if (!UUID.test(estimateId))
      return NextResponse.json(
        { success: false, error: "Invalid estimate ID." },
        { status: 400 },
      );
    const db = createAdminServerClient();
    const visit = await db
      .from("guided_site_visits")
      .select("id,status,revision,started_at,updated_at,completion_outcome")
      .eq("company_id", auth.authorization!.companyId)
      .eq("target_estimate_id", estimateId)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (visit.error)
      return NextResponse.json(
        { success: false, error: "Active site visit could not be checked." },
        { status: 500 },
      );
    const completedVisit = visit.data
      ? null
      : await db
          .from("guided_site_visits")
          .select(
            "id,status,revision,started_at,updated_at,completion_outcome",
          )
          .eq("company_id", auth.authorization!.companyId)
          .eq("target_estimate_id", estimateId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (completedVisit?.error)
      return NextResponse.json(
        { success: false, error: "Completed site visit could not be checked." },
        { status: 500 },
      );
    const selectedVisit = visit.data ?? completedVisit?.data ?? null;
    if (!selectedVisit)
      return NextResponse.json(
        { success: true, activeVisit: null, latestCompletedVisit: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const items = await db
      .from("guided_site_visit_items")
      .select("state")
      .eq("company_id", auth.authorization!.companyId)
      .eq("visit_id", selectedVisit.id);
    if (items.error)
      return NextResponse.json(
        {
          success: false,
          error: "Active site visit progress could not be loaded.",
        },
        { status: 500 },
      );
    const rows = items.data ?? [];
    const summary = {
      id: selectedVisit.id,
      status: selectedVisit.status,
      revision: selectedVisit.revision,
      startedAt: selectedVisit.started_at,
      updatedAt: selectedVisit.updated_at,
      completionOutcome: selectedVisit.completion_outcome,
      completedItems: rows.filter((item) => item.state !== "pending").length,
      totalItems: rows.length,
    };
    return NextResponse.json(
      {
        success: true,
        activeVisit: visit.data ? summary : null,
        latestCompletedVisit: visit.data ? null : summary,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Active site visit could not be checked." },
      { status: 500 },
    );
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { estimateId } = await params;
    if (!UUID.test(estimateId))
      return NextResponse.json(
        { success: false, error: "Invalid estimate ID." },
        { status: 400 },
      );
    const body = await request.json();
    if (
      !body ||
      Object.keys(body).length !== 1 ||
      body.recordingPermissionAcknowledged !== true
    )
      return NextResponse.json(
        {
          success: false,
          error: "Recording permission acknowledgment is required.",
        },
        { status: 400 },
      );
    const result = await createAdminServerClient().rpc(
      "start_guided_deck_site_visit",
      {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_estimate_id: estimateId,
        requested_recording_permission_acknowledged: true,
      },
    );
    if (result.error)
      return NextResponse.json(
        { success: false, error: "Guided site visit could not be started." },
        { status: 500 },
      );
    const row = (result.data as Record<string, unknown>[])[0];
    return NextResponse.json(
      {
        success: row.result_code === "ok",
        resultCode: row.result_code,
        visitId: row.visit_id,
        revision: row.revision,
      },
      {
        status:
          row.result_code === "ok"
            ? 201
            : row.result_code === "forbidden"
              ? 403
              : 404,
      },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Guided site visit could not be started." },
      { status: 500 },
    );
  }
}
