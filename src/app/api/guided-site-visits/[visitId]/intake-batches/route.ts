import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, UUID } from "@/lib/guided-site-visits/core";
import {
  intakeFingerprint,
  intakeManifest,
  stableGuidedUuid,
  GUIDED_INTAKE_TOTAL_WARNING_BYTES,
} from "@/lib/guided-site-visits/intake";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
const F = new Set(["idempotencyKey", "manifest"]);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId } = await params;
    if (!UUID.test(visitId)) throw new TypeError("Visit ID is invalid.");
    const body = exactObject(await request.json(), F),
      key =
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.trim()
          : "",
      manifest = intakeManifest(body.manifest);
    if (!key || key.length > 200)
      throw new TypeError("Idempotency key is invalid.");
    const scope = `${auth.authorization!.companyId}:${key}`,
      batchId = stableGuidedUuid(`${scope}:deck-visit-intake`),
      fingerprint = intakeFingerprint(visitId, manifest);
    const result = await createAdminServerClient().rpc(
      "create_guided_site_visit_intake_batch",
      {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_visit_id: visitId,
        requested_batch_id: batchId,
        requested_idempotency_key: key,
        requested_request_fingerprint: fingerprint,
        requested_manifest: manifest,
      },
    );
    if (result.error) throw new Error("Intake batch could not be created.");
    const row = (result.data as Record<string, unknown>[])[0],
      code = String(row.result_code);
    if (code !== "ok")
      return NextResponse.json(
        { success: false, resultCode: code },
        {
          status:
            code === "not_found"
              ? 404
              : ["not_editable", "idempotency_conflict"].includes(code)
                ? 409
                : 400,
        },
      );
    const totalBytes = manifest.reduce((sum, x) => sum + x.byteSize, 0);
    return NextResponse.json(
      {
        success: true,
        batchId: row.batch_id,
        memberCount: manifest.length,
        totalBytes,
        totalSizeWarning: totalBytes > GUIDED_INTAKE_TOTAL_WARNING_BYTES,
        idempotentReplay: row.idempotent_replay,
      },
      { status: row.idempotent_replay ? 200 : 201 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error:
          e instanceof TypeError
            ? e.message
            : "Intake batch could not be created.",
      },
      { status: e instanceof TypeError ? 400 : 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  const auth = await authorizeGuidedSiteVisit(request);
  if (auth.response) return auth.response;
  const { visitId } = await params;
  if (!UUID.test(visitId))
    return NextResponse.json(
      { success: false, error: "Visit ID is invalid." },
      { status: 400 },
    );
  const db = createAdminServerClient();
  const [batches, members, attempts, reviews, applicabilityFindings, assignments, items] =
    await Promise.all([
      db
        .from("guided_site_visit_intake_batches")
        .select("id,member_count,created_at")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .order("created_at", { ascending: false }),
      db
        .from("guided_site_visit_intake_members")
        .select(
          "batch_id,ordinal,original_filename,mime_type,declared_byte_size,declared_sha256",
        )
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId),
      db
        .from("guided_site_visit_intake_attempts")
        .select("id,batch_id,member_ordinal,asset_id,state,confirmed_at")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId),
      db
        .from("guided_site_visit_intake_classification_reviews")
        .select("id,intake_attempt_id,diagnostic_class,proposals,provider,model_version,prompt_version,schema_version,created_at")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId),
      db
        .from("guided_site_visit_intake_applicability_findings")
        .select("id,visit_item_id,intake_attempt_id,classification_review_id,finding_key,finding,confidence,reason,created_at")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId),
      db
        .from("guided_site_visit_intake_assignment_events")
        .select(
          "id,intake_attempt_id,asset_id,classification_review_id,visit_item_id,criterion_key,supersedes_assignment_event_id,decision,resulting_visit_revision,created_at",
        )
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId),
      db
        .from("guided_site_visit_items")
        .select("id,item_key,ordinal,title,state,observation")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .order("ordinal"),
    ]);
  if (
    [batches, members, attempts, reviews, applicabilityFindings, assignments, items].some(
      (x) => x.error,
    )
  )
    return NextResponse.json(
      { success: false, error: "Visit intake could not be loaded." },
      { status: 500 },
    );
  return NextResponse.json(
    {
      success: true,
      batches: batches.data,
      members: members.data,
      attempts: attempts.data,
      reviews: reviews.data,
      applicabilityFindings: applicabilityFindings.data,
      assignments: assignments.data,
      items: (items.data ?? []).map(
        ({ id, item_key, ordinal, title, state, observation }) => ({
          id,
          itemKey: item_key,
          ordinal,
          title,
          state,
          observation,
        }),
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
