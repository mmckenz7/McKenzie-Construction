import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

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
  _request: NextRequest,
  context: RouteContext,
) {
  const { token } = await context.params;

  if (!isUuid(token)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid material review link.",
      },
      {
        status: 400,
      },
    );
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
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error: "Material review not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "expired" in data &&
    data.expired === true
  ) {
    return NextResponse.json(
      {
        success: false,
        expired: true,
        error:
          "This material review has expired.",
      },
      {
        status: 410,
      },
    );
  }

  return NextResponse.json({
    success: true,
    review: data,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } = await context.params;

  if (!isUuid(token)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid material review link.",
      },
      {
        status: 400,
      },
    );
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
    return NextResponse.json(
      {
        success: false,
        error:
          reviewError?.message ??
          "Material review not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    review.expires_at &&
    new Date(review.expires_at) <
      new Date()
  ) {
    await supabase
      .from(
        "subcontractor_material_reviews",
      )
      .update({
        status: "expired",
      })
      .eq("id", review.id);

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

  const notes =
    body.notes?.trim() || null;

  const {
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
    .eq("id", review.id);

  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        error: updateError.message,
      },
      {
        status: 500,
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
    return NextResponse.json(
      {
        success: false,
        error: deleteError.message,
      },
      {
        status: 500,
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
      return NextResponse.json(
        {
          success: false,
          error: issueError.message,
        },
        {
          status: 500,
        },
      );
    }
  }

  return NextResponse.json({
    success: true,
    reviewId: review.id,
  });
}
