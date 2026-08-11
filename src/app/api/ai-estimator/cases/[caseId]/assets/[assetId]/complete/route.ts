import { NextRequest, NextResponse } from "next/server";

import {
  AI_ESTIMATOR_ASSET_SELECT,
  AI_ESTIMATOR_MAX_VIDEO_BYTES,
  AI_ESTIMATOR_STORAGE_BUCKET,
  normalizeStorageContentType,
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
  context: { params: Promise<{ caseId: string; assetId: string }> },
) {
  const auth = await authorizeAiEstimatorRequest(request);
  if (auth.response) return auth.response;

  const { caseId, assetId } = await context.params;
  if (!isUuid(caseId) || !isUuid(assetId)) {
    return json({ success: false, error: "caseId and assetId must be UUIDs." }, 400);
  }

  try {
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
        { success: false, error: "Media can only be completed while the case is in intake." },
        409,
      );
    }

    const assetResult = await supabase
      .from("ai_estimator_assets")
      .select(AI_ESTIMATOR_ASSET_SELECT)
      .eq("id", assetId)
      .eq("case_id", caseId)
      .eq("company_id", companyId)
      .eq("asset_kind", "video")
      .eq("origin", "user_upload")
      .maybeSingle();
    if (assetResult.error || !assetResult.data) {
      return json({ success: false, error: "AI Estimator media not found." }, 404);
    }

    const asset = assetResult.data as unknown as Record<string, unknown>;
    if (asset.status === "quarantined" || asset.status === "available") {
      return json({ success: true, asset: projectAiEstimatorAsset(asset) });
    }
    if (asset.status !== "upload_pending") {
      return json({ success: false, error: "This media upload cannot be completed." }, 409);
    }
    if (
      asset.storage_bucket !== AI_ESTIMATOR_STORAGE_BUCKET ||
      typeof asset.storage_path !== "string"
    ) {
      throw new Error("The media storage context is invalid.");
    }

    const info = await supabase.storage
      .from(AI_ESTIMATOR_STORAGE_BUCKET)
      .info(asset.storage_path);
    if (info.error || !info.data) {
      return json({ success: false, error: "The uploaded video was not found." }, 409);
    }

    const actualSize = info.data.size;
    const actualMimeType = normalizeStorageContentType(info.data.contentType);
    const expectedSize = Number(asset.declared_byte_size);
    const expectedMimeType = String(asset.mime_type);
    const metadataMatches =
      typeof actualSize === "number" &&
      Number.isSafeInteger(actualSize) &&
      actualSize > 0 &&
      actualSize <= AI_ESTIMATOR_MAX_VIDEO_BYTES &&
      actualSize === expectedSize &&
      actualMimeType === expectedMimeType;

    if (!metadataMatches) {
      await supabase
        .from("ai_estimator_assets")
        .update({
          byte_size:
            typeof actualSize === "number" &&
            Number.isSafeInteger(actualSize) &&
            actualSize > 0
              ? actualSize
              : null,
          storage_reported_mime_type: actualMimeType || null,
          status: "failed_validation",
        } as never)
        .eq("id", assetId)
        .eq("case_id", caseId)
        .eq("company_id", companyId)
        .eq("status", "upload_pending");
      const removed = await supabase.storage
        .from(AI_ESTIMATOR_STORAGE_BUCKET)
        .remove([asset.storage_path]);
      if (removed.error) {
        await supabase
          .from("ai_estimator_assets")
          .update({ status: "deletion_pending" } as never)
          .eq("id", assetId)
          .eq("case_id", caseId)
          .eq("company_id", companyId)
          .eq("status", "failed_validation");
      }
      return json(
        { success: false, error: "The uploaded video did not match its declared metadata." },
        422,
      );
    }

    const updated = await supabase
      .from("ai_estimator_assets")
      .update({
        byte_size: actualSize,
        storage_reported_mime_type: actualMimeType,
        status: "quarantined",
      } as never)
      .eq("id", assetId)
      .eq("case_id", caseId)
      .eq("company_id", companyId)
      .eq("status", "upload_pending")
      .select(AI_ESTIMATOR_ASSET_SELECT)
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new Error("The video upload could not be finalized.");
    }

    return json({
      success: true,
      asset: projectAiEstimatorAsset(updated.data as unknown as Record<string, unknown>),
      requiresContentValidation: true,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "The video upload could not be completed.",
      },
      500,
    );
  }
}
