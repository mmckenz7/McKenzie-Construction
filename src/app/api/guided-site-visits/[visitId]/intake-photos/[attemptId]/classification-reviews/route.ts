import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { exactObject, UUID } from "@/lib/guided-site-visits/core";
import { GUIDED_VISIBLE_FACT_CRITERIA } from "@/lib/guided-site-visits/visible-fact-criteria";
import {
  INTAKE_CLASSIFICATION_MODEL,
  INTAKE_CLASSIFICATION_PROMPT_VERSION,
  INTAKE_CLASSIFICATION_PROVIDER,
  INTAKE_CLASSIFICATION_SCHEMA_VERSION,
  IntakeClassificationError,
  runOpenAiIntakeClassification,
} from "@/lib/guided-site-visits/ai-intake-classification";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
const F = new Set(["idempotencyKey", "focusItemId", "focusCriterionKey"]);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string; attemptId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId, attemptId } = await params;
    if (!UUID.test(visitId) || !UUID.test(attemptId))
      throw new TypeError("Photo ID is invalid.");
    const body = exactObject(await request.json(), F),
      key =
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.trim()
          : "",
      focusItemId =
        typeof body.focusItemId === "string" ? body.focusItemId : "",
      focusCriterionKey =
        typeof body.focusCriterionKey === "string"
          ? body.focusCriterionKey
          : "";
    if (!key || key.length > 200)
      throw new TypeError("Idempotency key is invalid.");
    if (Boolean(focusItemId) !== Boolean(focusCriterionKey))
      throw new TypeError("Focused review is incomplete.");
    const db = createAdminServerClient(),
      attempt = await db
        .from("guided_site_visit_intake_attempts")
        .select(
          "id,asset_id,state,ai_estimator_assets!inner(storage_path,mime_type,status)",
        )
        .eq("id", attemptId)
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId)
        .maybeSingle(),
      items = await db
        .from("guided_site_visit_items")
        .select("id,item_key,title")
        .eq("visit_id", visitId)
        .eq("company_id", auth.authorization!.companyId);
    if (
      attempt.error ||
      !attempt.data ||
      attempt.data.state !== "confirmed" ||
      items.error
    )
      return NextResponse.json(
        { success: false, error: "Confirmed intake photo not found." },
        { status: 404 },
      );
    const focusItem = (items.data ?? []).find(
        (item) => item.id === focusItemId,
      ),
      focusCriterion = focusItem
        ? (GUIDED_VISIBLE_FACT_CRITERIA[focusItem.item_key] ?? []).find(
            (criterion) => criterion.key === focusCriterionKey,
          )
        : undefined;
    if (focusItemId && (!focusItem || !focusCriterion))
      throw new TypeError("Focused checklist item is invalid.");
    const previousReview = focusItemId
      ? await db
          .from("guided_site_visit_intake_classification_reviews")
          .select("proposals")
          .eq("intake_attempt_id", attemptId)
          .eq("visit_id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .eq("diagnostic_class", "classified")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null;
    if (previousReview?.error)
      throw new Error("Earlier photo review could not be loaded.");
    const linked = attempt.data as unknown as {
        asset_id: string;
        ai_estimator_assets: {
          storage_path: string;
          mime_type: string;
          status: string;
        };
      },
      asset = linked.ai_estimator_assets;
    let diagnostic:
        | "classified"
        | "retake_recommended"
        | "unsupported_media"
        | "review_unavailable" = "classified",
      issueCodes: string[] = [],
      proposals: { visitItemId: string; criterionKey: string }[] = [],
      requestSha256 = "",
      responseSha256 = "",
      safeDiagnostic: string | undefined;
    if (["image/heic", "image/heif"].includes(asset.mime_type)) {
      diagnostic = "unsupported_media";
      issueCodes = ["unsupported_media"];
      requestSha256 = createHash("sha256")
        .update(
          `${attemptId}:${asset.mime_type}:${INTAKE_CLASSIFICATION_SCHEMA_VERSION}`,
        )
        .digest("hex");
      responseSha256 = createHash("sha256").update(diagnostic).digest("hex");
    } else {
      const download = await db.storage
        .from("ai-estimator-private")
        .download(asset.storage_path);
      if (download.error || !download.data)
        return NextResponse.json(
          { success: false, error: "Private photo could not be downloaded." },
          { status: 409 },
        );
      try {
        const result = await runOpenAiIntakeClassification({
          bytes: await download.data.arrayBuffer(),
          mimeType: asset.mime_type,
          idempotencyKey: `${auth.authorization!.companyId}:${key}`,
          items: (items.data ?? []).map((i) => ({
            id: i.id,
            itemKey: i.item_key,
            title: i.title,
          })),
          ...(focusItem && focusCriterion
            ? {
                focus: {
                  visitItemId: focusItem.id,
                  criterionKey: focusCriterion.key,
                  label: `${focusItem.title}: ${focusCriterion.label}`,
                },
              }
            : {}),
        });
        const focusedProposals =
          result.usabilityVerdict === "usable" ? result.proposals : [];
        if (focusItem && focusCriterion && previousReview?.data) {
          const prior = Array.isArray(previousReview.data.proposals)
            ? (previousReview.data.proposals as {
                visitItemId: string;
                criterionKey: string;
              }[])
            : [];
          proposals = [
            ...prior.filter(
              (proposal) =>
                proposal.visitItemId !== focusItem.id ||
                proposal.criterionKey !== focusCriterion.key,
            ),
            ...focusedProposals.filter(
              (proposal) =>
                proposal.visitItemId === focusItem.id &&
                proposal.criterionKey === focusCriterion.key,
            ),
          ];
          diagnostic = "classified";
          issueCodes = [];
        } else {
          diagnostic =
            result.usabilityVerdict === "usable"
              ? "classified"
              : "retake_recommended";
          issueCodes = result.issueCodes;
          proposals = focusedProposals;
        }
        requestSha256 = result.requestSha256;
        responseSha256 = result.responseSha256;
      } catch (e) {
        if (!(e instanceof IntakeClassificationError)) throw e;
        diagnostic = "review_unavailable";
        safeDiagnostic = e.diagnostic;
        issueCodes = [];
        requestSha256 = createHash("sha256")
          .update(
            `${attemptId}:${INTAKE_CLASSIFICATION_SCHEMA_VERSION}:${e.diagnostic}`,
          )
          .digest("hex");
        responseSha256 = createHash("sha256")
          .update(e.diagnostic)
          .digest("hex");
        console.warn("guided_deck_intake_classification", {
          diagnostic: e.diagnostic,
          model: INTAKE_CLASSIFICATION_MODEL,
        });
      }
    }
    const saved = await db.rpc(
      "record_guided_site_visit_intake_classification",
      {
        requested_auth_user_id: auth.authorization!.authUserId,
        requested_visit_id: visitId,
        requested_attempt_id: attemptId,
        requested_idempotency_key: key,
        requested_provider:
          diagnostic === "unsupported_media"
            ? "local_boundary"
            : INTAKE_CLASSIFICATION_PROVIDER,
        requested_model_version:
          diagnostic === "unsupported_media"
            ? "unsupported-media-v1"
            : INTAKE_CLASSIFICATION_MODEL,
        requested_prompt_version: INTAKE_CLASSIFICATION_PROMPT_VERSION,
        requested_schema_version: INTAKE_CLASSIFICATION_SCHEMA_VERSION,
        requested_request_sha256: requestSha256,
        requested_response_sha256: responseSha256,
        requested_diagnostic_class: diagnostic,
        requested_issue_codes: issueCodes,
        requested_proposals: proposals,
      },
    );
    if (saved.error) {
      console.warn("guided_deck_intake_classification_persistence", {
        code: saved.error.code,
      });
      throw new Error("Classification review could not be recorded.");
    }
    const row = (saved.data as Record<string, unknown>[])[0],
      code = String(row.result_code);
    if (code !== "ok")
      return NextResponse.json(
        { success: false, resultCode: code },
        { status: code === "idempotency_conflict" ? 409 : 422 },
      );
    return NextResponse.json(
      {
        success: true,
        reviewId: row.review_id,
        diagnosticClass: diagnostic,
        issueCodes,
        proposals,
        idempotentReplay: row.idempotent_replay,
        ...(safeDiagnostic ? { safeDiagnostic } : null),
      },
      { status: row.idempotent_replay ? 200 : 201 },
    );
  } catch (e) {
    console.warn("guided_deck_intake_classification_route", {
      kind: e instanceof TypeError ? "invalid_request" : "unexpected",
    });
    return NextResponse.json(
      {
        success: false,
        error:
          e instanceof TypeError ? e.message : "Classification review failed.",
      },
      { status: e instanceof TypeError ? 400 : 500 },
    );
  }
}
