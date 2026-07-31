import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    reviewId: string;
  }>;
};

type UpdateIssueBody = {
  issueId?: string;
  status?:
    | "open"
    | "reviewing"
    | "resolved"
    | "dismissed";
};

const allowedStatuses = new Set([
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeProject(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.project_name ??
        record.title ??
        "Project",
    ),
    address: String(
      record.address ??
        record.project_address ??
        record.job_address ??
        "",
    ),
  };
}

function normalizeSubcontractor(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.display_name ??
        record.full_name ??
        "Installer",
    ),
    phone:
      typeof record.phone === "string"
        ? record.phone
        : null,
    email:
      typeof record.email === "string"
        ? record.email
        : null,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { reviewId } =
    await context.params;

  if (!isUuid(reviewId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid review ID.",
      },
      {
        status: 400,
      },
    );
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
    .select(`
      *,
      projects (*),
      team_members (*)
    `)
    .eq("id", reviewId)
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

  const [
    itemsResult,
    issuesResult,
  ] = await Promise.all([
    supabase
      .from(
        "subcontractor_material_review_items",
      )
      .select("*")
      .eq("review_id", reviewId)
      .order("display_order", {
        ascending: true,
      }),

    supabase
      .from(
        "subcontractor_material_issues",
      )
      .select("*")
      .eq("review_id", reviewId)
      .order("created_at", {
        ascending: true,
      }),
  ]);

  const firstError =
    itemsResult.error ??
    issuesResult.error;

  if (firstError) {
    return NextResponse.json(
      {
        success: false,
        error: firstError.message,
      },
      {
        status: 500,
      },
    );
  }

  const items = (
    itemsResult.data ?? []
  ).map((item) => ({
    id: String(item.id),
    itemName: String(
      item.item_name ?? "",
    ),
    description:
      typeof item.description ===
      "string"
        ? item.description
        : null,
    quantity: Number(
      item.quantity ?? 0,
    ),
    unit:
      typeof item.unit === "string"
        ? item.unit
        : null,
    displayOrder: Number(
      item.display_order ?? 0,
    ),
  }));

  const itemMap = new Map(
    items.map((item) => [
      item.id,
      item,
    ]),
  );

  const issues = (
    issuesResult.data ?? []
  ).map((issue) => ({
    id: String(issue.id),
    reviewItemId:
      typeof issue.review_item_id ===
      "string"
        ? issue.review_item_id
        : null,
    item:
      typeof issue.review_item_id ===
      "string"
        ? itemMap.get(
            issue.review_item_id,
          ) ?? null
        : null,
    issueType: String(
      issue.issue_type ?? "other",
    ),
    notesOriginal:
      typeof issue.notes_original ===
      "string"
        ? issue.notes_original
        : null,
    notesLanguage:
      typeof issue.notes_language ===
      "string"
        ? issue.notes_language
        : null,
    notesEnglishTranslation:
      typeof issue
        .notes_english_translation ===
      "string"
        ? issue
            .notes_english_translation
        : null,
    translationStatus: String(
      issue.translation_status ??
        "not_requested",
    ),
    reportedQuantity:
      issue.reported_quantity === null
        ? null
        : Number(
            issue.reported_quantity,
          ),
    photoUrl:
      typeof issue.photo_url ===
      "string"
        ? issue.photo_url
        : null,
    status: String(
      issue.status ?? "open",
    ),
    resolvedAt:
      typeof issue.resolved_at ===
      "string"
        ? issue.resolved_at
        : null,
    createdAt: String(
      issue.created_at ?? "",
    ),
  }));

  return NextResponse.json({
    success: true,
    review: {
      id: String(review.id),
      secureToken: String(
        review.secure_token ?? "",
      ),
      status: String(
        review.status ?? "pending",
      ),
      language: String(
        review.language ?? "en",
      ),
      reviewResult:
        typeof review.review_result ===
        "string"
          ? review.review_result
          : null,
      notesOriginal:
        typeof review.notes_original ===
        "string"
          ? review.notes_original
          : null,
      notesLanguage:
        typeof review.notes_language ===
        "string"
          ? review.notes_language
          : null,
      notesEnglishTranslation:
        typeof review
          .notes_english_translation ===
        "string"
          ? review
              .notes_english_translation
          : null,
      translationStatus: String(
        review.translation_status ??
          "not_requested",
      ),
      sentAt:
        typeof review.sent_at ===
        "string"
          ? review.sent_at
          : null,
      openedAt:
        typeof review.opened_at ===
        "string"
          ? review.opened_at
          : null,
      submittedAt:
        typeof review.submitted_at ===
        "string"
          ? review.submitted_at
          : null,
      reviewedAt:
        typeof review.reviewed_at ===
        "string"
          ? review.reviewed_at
          : null,
      reviewedBy:
        typeof review.reviewed_by ===
        "string"
          ? review.reviewed_by
          : null,
      expiresAt:
        typeof review.expires_at ===
        "string"
          ? review.expires_at
          : null,
      project: normalizeProject(
        review.projects,
      ),
      subcontractor:
        normalizeSubcontractor(
          review.team_members,
        ),
      items,
      issues,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { reviewId } =
    await context.params;

  if (!isUuid(reviewId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid review ID.",
      },
      {
        status: 400,
      },
    );
  }

  let body: UpdateIssueBody;

  try {
    body =
      (await request.json()) as UpdateIssueBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !body.issueId ||
    !isUuid(body.issueId) ||
    !body.status ||
    !allowedStatuses.has(body.status)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Issue ID and valid status are required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase
      .from(
        "subcontractor_material_issues",
      )
      .update({
        status: body.status,
        resolved_at:
          body.status === "resolved" ||
          body.status === "dismissed"
            ? new Date().toISOString()
            : null,
      })
      .eq("id", body.issueId)
      .eq("review_id", reviewId)
      .select("*")
      .single();

  if (error || !data) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ??
          "Material issue not found.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
    issue: data,
  });
}
