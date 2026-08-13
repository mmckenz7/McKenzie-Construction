import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const auth = await authorizeGuidedSiteVisit(request);
    if (auth.response) return auth.response;
    const { visitId } = await params;
    if (!UUID.test(visitId))
      return NextResponse.json(
        { success: false, error: "Invalid visit ID." },
        { status: 400 },
      );
    const db = createAdminServerClient();
    const [visit, items, photos, reviews, visibleReviews, visibleDecisions] =
      await Promise.all([
        db
          .from("guided_site_visits")
          .select(
            "id,case_id,target_estimate_id,revision,status,completion_outcome,retention_policy_status,started_at,completed_at",
          )
          .eq("id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .maybeSingle(),
        db
          .from("guided_site_visit_items")
          .select(
            "id,item_key,ordinal,title,instructions,requirement,state,observation,follow_up_reason_code,follow_up_notes,confirmed_at",
          )
          .eq("visit_id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .order("ordinal"),
        db
          .from("guided_site_visit_photo_attempts")
          .select(
            "id,visit_item_id,asset_id,retake_of_attempt_id,ordinal,state,capture_intent,requested_from_visible_fact_decision_id,confirmed_at",
          )
          .eq("visit_id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .order("ordinal"),
        db
          .from("guided_site_visit_ai_usability_reviews")
          .select(
            "id,photo_attempt_id,idempotency_key,provider,model_version,prompt_version,schema_version,request_sha256,response_sha256,verdict,issue_codes,created_at",
          )
          .eq("visit_id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .order("created_at")
          .order("id"),
        db
          .from("guided_site_visit_ai_visible_fact_reviews")
          .select(
            "id,photo_attempt_id,provider,criteria,recommended_next_capture,created_at",
          )
          .eq("visit_id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .order("created_at")
          .order("id"),
        db
          .from("guided_site_visit_visible_fact_decisions")
          .select(
            "id,visible_fact_review_id,decision,next_action,final_criteria,final_recommended_next_capture,resulting_visit_revision,created_at",
          )
          .eq("visit_id", visitId)
          .eq("company_id", auth.authorization!.companyId)
          .order("created_at")
          .order("id"),
      ]);
    if (
      visit.error ||
      items.error ||
      photos.error ||
      reviews.error ||
      visibleReviews.error ||
      visibleDecisions.error
    )
      return NextResponse.json(
        { success: false, error: "Visit could not be loaded." },
        { status: 500 },
      );
    if (!visit.data)
      return NextResponse.json(
        { success: false, error: "Visit not found." },
        { status: 404 },
      );
    const decisions = (visibleDecisions.data ?? []).map((row) => ({
      id: row.id,
      reviewId: row.visible_fact_review_id,
      decision: row.decision,
      nextAction: row.next_action,
      criteria: row.final_criteria,
      recommendedNextCapture: row.final_recommended_next_capture,
      resultingVisitRevision: row.resulting_visit_revision,
      createdAt: row.created_at,
    }));
    const factRows = (visibleReviews.data ?? []).map((row) => ({
      id: row.id,
      photoAttemptId: row.photo_attempt_id,
      sourceMode: row.provider === "local_manual_boundary" ? "manual" : "ai",
      criteria: row.criteria,
      recommendedNextCapture: row.recommended_next_capture,
      createdAt: row.created_at,
      humanDecisions: decisions.filter(
        (decision) => decision.reviewId === row.id,
      ),
    }));
    const reviewRows = (reviews.data ?? []).map((review) => ({
      id: review.id,
      idempotencyKey: review.idempotency_key,
      provider: review.provider,
      modelVersion: review.model_version,
      promptVersion: review.prompt_version,
      schemaVersion: review.schema_version,
      requestSha256: review.request_sha256,
      responseSha256: review.response_sha256,
      verdict: review.verdict,
      issueCodes: review.issue_codes,
      createdAt: review.created_at,
      photoAttemptId: review.photo_attempt_id,
    }));
    const attempts = (photos.data ?? []).map((photo) => ({
      id: photo.id,
      visitItemId: photo.visit_item_id,
      assetId: photo.asset_id,
      retakeOfAttemptId: photo.retake_of_attempt_id,
      ordinal: photo.ordinal,
      state: photo.state,
      captureIntent: photo.capture_intent,
      requestedFromDecisionId: photo.requested_from_visible_fact_decision_id,
      confirmedAt: photo.confirmed_at,
      usabilityReviews: reviewRows
        .filter((review) => review.photoAttemptId === photo.id)
        .map(({ photoAttemptId: _, ...review }) => {
          void _;
          return review;
        }),
      visibleFactReviews: factRows
        .filter((review) => review.photoAttemptId === photo.id)
        .map(({ photoAttemptId: _, ...review }) => {
          void _;
          return review;
        }),
    }));
    return NextResponse.json(
      {
        success: true,
        visit: {
          id: visit.data.id,
          caseId: visit.data.case_id,
          targetEstimateId: visit.data.target_estimate_id,
          revision: visit.data.revision,
          status: visit.data.status,
          completionOutcome: visit.data.completion_outcome,
          retentionPolicyStatus: visit.data.retention_policy_status,
          startedAt: visit.data.started_at,
          completedAt: visit.data.completed_at,
          items: (items.data ?? []).map((item) => ({
            id: item.id,
            itemKey: item.item_key,
            ordinal: item.ordinal,
            title: item.title,
            instructions: item.instructions,
            requirement: item.requirement,
            state: item.state,
            observation: item.observation,
            followUpReasonCode: item.follow_up_reason_code,
            followUpNotes: item.follow_up_notes,
            confirmedAt: item.confirmed_at,
            photoAttempts: attempts.filter(
              (photo) => photo.visitItemId === item.id,
            ),
          })),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Visit could not be loaded." },
      { status: 500 },
    );
  }
}
