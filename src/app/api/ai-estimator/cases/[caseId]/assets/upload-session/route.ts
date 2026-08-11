import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  AI_ESTIMATOR_ASSET_SELECT,
  AI_ESTIMATOR_MAX_VIDEO_BYTES,
  AI_ESTIMATOR_SIGNED_UPLOAD_TTL_SECONDS,
  AI_ESTIMATOR_STORAGE_BUCKET,
  aiEstimatorAssetPath,
  parseVideoUploadInput,
  projectAiEstimatorAsset,
} from "@/lib/ai-estimator/asset-core";
import { authorizeAiEstimatorRequest, loadSingletonCompanyId } from "@/lib/ai-estimator/case-access";
import { isUuid } from "@/lib/ai-estimator/case-core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const auth = await authorizeAiEstimatorRequest(request);
  if (auth.response) return auth.response;

  const { caseId } = await context.params;
  if (!isUuid(caseId)) {
    return json({ success: false, error: "caseId must be a UUID." }, 400);
  }

  try {
    const input = parseVideoUploadInput(await request.json());
    const companyId = await loadSingletonCompanyId();
    const supabase = createAdminServerClient();
    const caseResult = await supabase
      .from("ai_estimator_cases")
      .select("id,status")
      .eq("id", caseId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (caseResult.error || !caseResult.data) {
      return json({ success: false, error: "AI Estimator case not found." }, 404);
    }
    if (caseResult.data.status !== "intake") {
      return json(
        { success: false, error: "Media can only be added while the case is in intake." },
        409,
      );
    }

    const existing = await supabase
      .from("ai_estimator_assets")
      .select(AI_ESTIMATOR_ASSET_SELECT)
      .eq("case_id", caseId)
      .eq("company_id", companyId)
      .eq("asset_kind", "video")
      .eq("origin", "user_upload")
      .in("status", ["upload_pending", "quarantined", "available"])
      .limit(1)
      .maybeSingle();
    if (existing.error) {
      throw new Error("Existing media could not be verified.");
    }
    if (existing.data) {
      return json(
        { success: false, error: "This V0 case already has a narrated video." },
        409,
      );
    }

    const assetId = randomUUID();
    const storagePath = aiEstimatorAssetPath(
      companyId,
      caseId,
      assetId,
      input.originalFilename,
    );
    const inserted = await supabase
      .from("ai_estimator_assets")
      .insert({
        id: assetId,
        company_id: companyId,
        case_id: caseId,
        asset_kind: "video",
        origin: "user_upload",
        storage_bucket: AI_ESTIMATOR_STORAGE_BUCKET,
        storage_path: storagePath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        declared_byte_size: input.byteSize,
        declared_sha256: input.sha256,
        created_by_auth_user_id: auth.authorization!.authUserId,
      } as never)
      .select(AI_ESTIMATOR_ASSET_SELECT)
      .single();
    if (inserted.error?.code === "23505") {
      return json(
        { success: false, error: "This V0 case already has a narrated video." },
        409,
      );
    }
    if (inserted.error || !inserted.data) {
      throw new Error("The video upload record could not be created.");
    }

    const signed = await supabase.storage
      .from(AI_ESTIMATOR_STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (signed.error || !signed.data) {
      await supabase
        .from("ai_estimator_assets")
        .update({ status: "failed_validation" } as never)
        .eq("id", assetId)
        .eq("case_id", caseId)
        .eq("company_id", companyId)
        .eq("status", "upload_pending");
      throw new Error("A secure video upload could not be created.");
    }

    return json(
      {
        success: true,
        asset: projectAiEstimatorAsset(inserted.data as unknown as Record<string, unknown>),
        upload: {
          bucket: AI_ESTIMATOR_STORAGE_BUCKET,
          path: signed.data.path,
          token: signed.data.token,
          signedUrl: signed.data.signedUrl,
          requiredMimeType: input.mimeType,
          maximumByteSize: AI_ESTIMATOR_MAX_VIDEO_BYTES,
          expiresAt: new Date(
            Date.now() + AI_ESTIMATOR_SIGNED_UPLOAD_TTL_SECONDS * 1000,
          ).toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    const isInputError = error instanceof TypeError || error instanceof SyntaxError;
    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "The video upload session could not be created.",
      },
      isInputError ? 400 : 500,
    );
  }
}
