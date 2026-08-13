import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const FIELDS = new Set(["idempotencyKey", "memberCount"]);

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
    const body = exactObject(await request.json(), FIELDS);
    const idempotencyKey =
      typeof body.idempotencyKey === "string"
        ? body.idempotencyKey.trim()
        : "";
    const memberCount = body.memberCount;
    if (
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      !Number.isSafeInteger(memberCount) ||
      (memberCount as number) < 1 ||
      (memberCount as number) > 5
    )
      throw new TypeError("Photo batch declaration is invalid.");

    const stableScope = `${auth.authorization!.companyId}:${idempotencyKey}`;
    const batchId = stableUuid(`${stableScope}:guided-photo-batch`);
    const requestFingerprint = createHash("sha256")
      .update(`${visitId}\u001f${visitItemId}\u001f${memberCount}`)
      .digest("hex");
    const result = await createAdminServerClient().rpc(
      "create_guided_site_visit_photo_batch",
      {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_visit_id: visitId,
        requested_item_id: visitItemId,
        requested_batch_id: batchId,
        requested_idempotency_key: idempotencyKey,
        requested_request_fingerprint: requestFingerprint,
        requested_member_count: memberCount,
      },
    );
    if (result.error)
      return NextResponse.json(
        { success: false, error: "Photo batch could not be created." },
        { status: 500 },
      );
    const row = (result.data as Record<string, unknown>[])[0];
    const code = String(row.result_code);
    if (code !== "ok")
      return NextResponse.json(
        { success: false, resultCode: code },
        {
          status: ["idempotency_conflict", "not_editable"].includes(code)
            ? 409
            : code === "not_found"
              ? 404
              : code === "forbidden"
                ? 403
                : 400,
        },
      );
    return NextResponse.json(
      {
        success: true,
        batchId: row.batch_id,
        memberCount,
        idempotentReplay: row.idempotent_replay,
      },
      { status: row.idempotent_replay ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof TypeError
            ? error.message
            : "Photo batch could not be created.",
      },
      { status: error instanceof TypeError ? 400 : 500 },
    );
  }
}
