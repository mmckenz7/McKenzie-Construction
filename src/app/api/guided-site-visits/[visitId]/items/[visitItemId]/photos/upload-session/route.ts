import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import {
  exactObject,
  GUIDED_PHOTO_MAX_BYTES,
  GUIDED_PHOTO_MIME_TYPES,
  photoPath,
  revision,
  safeFilename,
  UUID,
} from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
const F = new Set([
  "expectedRevision",
  "idempotencyKey",
  "captureIntent",
  "sourceDecisionId",
  "originalFilename",
  "mimeType",
  "byteSize",
  "sha256",
  "retakeOfAttemptId",
  "reservationNonce",
  "batchId",
  "batchOrdinal",
]);

function stableUuid(scope: string) {
  const bytes = createHash("sha256").update(scope).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function POST(
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
    const body = exactObject(await request.json(), F),
      db = createAdminServerClient(),
      filename = safeFilename(body.originalFilename),
      idempotencyKey =
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.trim()
          : "",
      captureIntent = body.captureIntent,
      sourceDecisionId = body.sourceDecisionId ?? null,
      retakeOfAttemptId = body.retakeOfAttemptId ?? null,
      batchId = body.batchId ?? null,
      batchOrdinal = body.batchOrdinal ?? null;
    if (
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      !(["initial", "complement", "retake", "batch"] as unknown[]).includes(
        captureIntent,
      ) ||
      (sourceDecisionId !== null &&
        (typeof sourceDecisionId !== "string" ||
          !UUID.test(sourceDecisionId))) ||
      (retakeOfAttemptId !== null &&
        (typeof retakeOfAttemptId !== "string" ||
          !UUID.test(retakeOfAttemptId))) ||
      ((batchId === null) !== (batchOrdinal === null)) ||
      ((captureIntent === "batch") !== (batchId !== null)) ||
      (batchId !== null &&
        (typeof batchId !== "string" || !UUID.test(batchId))) ||
      (batchOrdinal !== null &&
        (!Number.isSafeInteger(batchOrdinal) ||
          (batchOrdinal as number) < 1 ||
          (batchOrdinal as number) > 5)) ||
      typeof body.reservationNonce !== "string" ||
      !UUID.test(body.reservationNonce) ||
      typeof body.mimeType !== "string" ||
      !GUIDED_PHOTO_MIME_TYPES.has(body.mimeType) ||
      !Number.isSafeInteger(body.byteSize) ||
      (body.byteSize as number) < 1 ||
      (body.byteSize as number) > GUIDED_PHOTO_MAX_BYTES ||
      typeof body.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(body.sha256)
    )
      throw new TypeError("Photo declaration is invalid.");
    const visit = await db
      .from("guided_site_visits")
      .select("case_id")
      .eq("id", visitId)
      .eq("company_id", auth.authorization!.companyId)
      .maybeSingle();
    if (visit.error || !visit.data)
      return NextResponse.json(
        { success: false, error: "Visit not found." },
        { status: 404 },
      );
    const stableScope = `${auth.authorization!.companyId}:${idempotencyKey}`,
      attemptId = stableUuid(`${stableScope}:attempt`),
      assetId = stableUuid(`${stableScope}:asset`),
      path = photoPath(
        auth.authorization!.companyId,
        String(visit.data.case_id),
        assetId,
        filename,
      );
    const reservationArguments = {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_visit_id: visitId,
        requested_item_id: visitItemId,
        requested_expected_revision: revision(body.expectedRevision),
        requested_idempotency_key: idempotencyKey,
        requested_capture_intent: captureIntent,
        requested_source_decision_id: sourceDecisionId,
        requested_retake_of_attempt_id: retakeOfAttemptId,
        requested_attempt_id: attemptId,
        requested_asset_id: assetId,
        requested_storage_path: path,
        requested_filename: filename,
        requested_mime_type: body.mimeType,
        requested_byte_size: body.byteSize,
        requested_sha256: body.sha256,
      };
    const reserved = await db.rpc(
      batchId === null
        ? "reserve_guided_site_visit_photo_set_member"
        : "reserve_guided_site_visit_photo_batch_member",
      batchId === null
        ? reservationArguments
        : {
            ...reservationArguments,
            requested_batch_id: batchId,
            requested_batch_ordinal: batchOrdinal,
          },
    );
    if (reserved.error)
      return NextResponse.json(
        { success: false, error: "Photo reservation failed." },
        { status: 500 },
      );
    const row = (reserved.data as Record<string, unknown>[])[0],
      code = String(row.result_code);
    if (code === "already_confirmed")
      return NextResponse.json({
        success: true,
        resultCode: code,
        attemptId: row.attempt_id,
        assetId: row.asset_id,
        nextRevision: row.next_revision,
        alreadyConfirmed: true,
      });
    if (code !== "ok")
      return NextResponse.json(
        { success: false, resultCode: code, nextRevision: row.next_revision },
        {
          status: [
            "stale_revision",
            "idempotency_conflict",
            "retry_conflict",
            "upload_in_progress",
            "active_photo_limit",
            "source_decision_used",
            "attempt_limit_reached",
            "recovery_limit_reached",
            "reservation_failed",
            "reservation_not_uploadable",
            "batch_member_conflict",
          ].includes(code)
            ? 409
            : 400,
        },
      );
    const signed = await db.storage
      .from("ai-estimator-private")
      .createSignedUploadUrl(String(row.storage_path), { upsert: false });
    if (signed.error) {
      let failedRevision = row.next_revision;
      if (!row.idempotent_replay) {
        const failed = await db.rpc(
          "fail_guided_site_visit_photo_reservation",
          {
            requested_auth_user_id: auth.authorization!.authUserId,
            requested_visit_id: visitId,
            requested_attempt_id: row.attempt_id,
            requested_expected_revision: row.next_revision,
          },
        );
        const failedRow = (
          failed.data as Record<string, unknown>[] | null
        )?.[0];
        if (typeof failedRow?.next_revision === "number")
          failedRevision = failedRow.next_revision;
      }
      return NextResponse.json(
        {
          success: false,
          error: "Private upload URL could not be created.",
          nextRevision: failedRevision,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        success: true,
        attemptId: row.attempt_id,
        assetId: row.asset_id,
        nextRevision: row.next_revision,
        idempotentReplay: row.idempotent_replay,
        batchId,
        batchOrdinal,
        upload: {
          ...signed.data,
          requiredMimeType: body.mimeType,
          maximumByteSize: GUIDED_PHOTO_MAX_BYTES,
        },
      },
      { status: row.idempotent_replay ? 200 : 201 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Upload failed.",
      },
      { status: e instanceof TypeError ? 400 : 500 },
    );
  }
}
