import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  logPublicTokenSupabaseFailure,
  minimizeMaterialReviewPayload,
} from "@/lib/public-token-api";
import { enforcePublicTokenRateLimit } from "@/lib/public-token-rate-limit";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type MaterialIssueInput = {
  reviewItemId?: string | null;
  issueType?: string;
  notes?: string;
  reportedQuantity?: number | null;
};

type SubmitBody = {
  language?: "en" | "es";
  reviewResult?:
    | "approved"
    | "issues_reported";
  notes?: string;
  issues?: MaterialIssueInput[];
};

const allowedIssueTypes = new Set([
  "missing_material",
  "wrong_quantity",
  "wrong_material",
  "duplicate_material",
  "other",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } = await context.params;

  const rateLimitResponse = await enforcePublicTokenRateLimit({
    request,
    token,
    routeCategory: "material_review",
    method: "GET",
  });

  if (rateLimitResponse) return rateLimitResponse;

  if (!isUuid(token)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "get_material_review_by_token",
      {
        requested_token: token,
      },
    );

  if (error) {
    const failure = createPublicTokenFailure("unexpected");
    logPublicTokenSupabaseFailure({
      operation: "get_material_review_by_token",
      routeCategory: "material_review",
      method: "GET",
      error,
      status: failure.status,
    });
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  if (!data || (
    typeof data === "object" &&
    data !== null &&
    "expired" in data &&
    data.expired === true
  )) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  return NextResponse.json({
    success: true,
    review: minimizeMaterialReviewPayload(data),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } = await context.params;

  const rateLimitResponse = await enforcePublicTokenRateLimit({
    request,
    token,
    routeCategory: "material_review",
    method: "POST",
  });

  if (rateLimitResponse) return rateLimitResponse;

  if (!isUuid(token)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  if (isPublicTokenBodyTooLarge(request.headers.get("content-length"))) {
    return NextResponse.json({ success: false, error: "Invalid form submission." }, { status: 413 });
  }

  let body: SubmitBody;

  try {
    body =
      (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid form submission.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.language !== "en" &&
    body.language !== "es"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Please select a language.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.reviewResult !== "approved" &&
    body.reviewResult !==
      "issues_reported"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Please approve the list or report an issue.",
      },
      {
        status: 400,
      },
    );
  }

  const issues =
    body.reviewResult ===
    "issues_reported"
      ? body.issues ?? []
      : [];

  if (
    issues.length > 50 ||
    (body.notes?.length ?? 0) > 4_000 ||
    issues.some((issue) =>
      (issue.notes?.length ?? 0) > 2_000 ||
      (issue.reviewItemId !== null &&
        issue.reviewItemId !== undefined &&
        !isUuid(issue.reviewItemId)) ||
      (issue.reportedQuantity !== null &&
        issue.reportedQuantity !== undefined &&
        (!Number.isFinite(issue.reportedQuantity) ||
          issue.reportedQuantity < 0 ||
          issue.reportedQuantity > 1_000_000)),
    )
  ) {
    return NextResponse.json({ success: false, error: "Invalid form submission." }, { status: 400 });
  }

  if (
    body.reviewResult ===
      "issues_reported" &&
    issues.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Add at least one material issue.",
      },
      {
        status: 400,
      },
    );
  }

  for (const issue of issues) {
    if (
      !issue.issueType ||
      !allowedIssueTypes.has(
        issue.issueType,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more material issues are invalid.",
        },
        {
          status: 400,
        },
      );
    }
  }

  const supabase =
    createAdminServerClient();

  const {
    data: review,
    error: reviewError,
  } = await supabase
    .from(
      "subcontractor_material_reviews",
    )
    .select("*")
    .eq("secure_token", token)
    .single();

  if (reviewError || !review) {
    const failure = createPublicTokenFailure("unavailable");
    if (reviewError) {
      logPublicTokenSupabaseFailure({
        operation: "select_subcontractor_material_review",
        routeCategory: "material_review",
        method: "POST",
        error: reviewError,
        status: failure.status,
      });
    }
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  if (
    review.status === "cancelled"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This material review has been cancelled.",
      },
      {
        status: 410,
      },
    );
  }

  if (
    review.status === "expired" ||
    (
      review.expires_at &&
      new Date(review.expires_at) <
        new Date()
    )
  ) {
    await supabase
      .from(
        "subcontractor_material_reviews",
      )
      .update({
        status: "expired",
      })
      .eq("id", review.id)
      .neq("status", "submitted");

    return NextResponse.json(
      {
        success: false,
        error:
          "This material review has expired.",
      },
      {
        status: 410,
      },
    );
  }

  if (
    review.status === "submitted" ||
    review.submitted_at
  ) {
    return NextResponse.json(
      {
        success: false,
        alreadySubmitted: true,
        error:
          "This material review has already been submitted.",
      },
      {
        status: 409,
      },
    );
  }

  if (review.reviewed_at) {
    return NextResponse.json(
      {
        success: false,
        alreadySubmitted: true,
        error:
          "This material review has already been completed.",
      },
      {
        status: 409,
      },
    );
  }

  const notes =
    body.notes?.trim() || null;

  const {
    data: updatedReview,
    error: updateError,
  } = await supabase
    .from(
      "subcontractor_material_reviews",
    )
    .update({
      language: body.language,
      review_result:
        body.reviewResult,
      notes_original: notes,
      notes_language: notes
        ? body.language
        : null,
      translation_status:
        notes &&
        body.language === "es"
          ? "pending"
          : "not_requested",
      status: "submitted",
      submitted_at:
        new Date().toISOString(),
    })
    .eq("id", review.id)
    .in("status", ["pending", "opened"])
    .is("submitted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReview) {
    if (updateError) {
      logPublicTokenSupabaseFailure({
        operation: "update_subcontractor_material_review",
        routeCategory: "material_review",
        method: "POST",
        error: updateError,
        status: 500,
      });
    }
    return NextResponse.json(
      {
        success: false,
        alreadySubmitted: !updateError,
        error: updateError
          ? "The request could not be completed."
          : "This material review has already been submitted.",
      },
      {
        status: updateError ? 500 : 409,
        ...(updateError ? { headers: { "Cache-Control": "no-store" } } : {}),
      },
    );
  }

  const { error: deleteError } =
    await supabase
      .from(
        "subcontractor_material_issues",
      )
      .delete()
      .eq("review_id", review.id);

  if (deleteError) {
    logPublicTokenSupabaseFailure({
      operation: "delete_subcontractor_material_issues",
      routeCategory: "material_review",
      method: "POST",
      error: deleteError,
      status: 500,
    });
    return NextResponse.json(
      {
        success: false,
        error: "The request could not be completed.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (issues.length > 0) {
    const rows = issues.map(
      (issue) => ({
        review_id: review.id,
        review_item_id:
          issue.reviewItemId || null,
        issue_type:
          issue.issueType,
        notes_original:
          issue.notes?.trim() || null,
        notes_language:
          issue.notes?.trim()
            ? body.language
            : null,
        translation_status:
          issue.notes?.trim() &&
          body.language === "es"
            ? "pending"
            : "not_requested",
        reported_quantity:
          typeof issue.reportedQuantity ===
          "number"
            ? issue.reportedQuantity
            : null,
        status: "open",
      }),
    );

    const { error: issueError } =
      await supabase
        .from(
          "subcontractor_material_issues",
        )
        .insert(rows);

    if (issueError) {
      logPublicTokenSupabaseFailure({
        operation: "insert_subcontractor_material_issues",
        routeCategory: "material_review",
        method: "POST",
        error: issueError,
        status: 500,
      });
      return NextResponse.json(
        {
          success: false,
          error: "The request could not be completed.",
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  }

  return NextResponse.json({
    success: true,
  });
}
