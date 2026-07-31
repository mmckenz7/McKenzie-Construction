import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

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

function normalizeInstaller(
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
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    scheduleResult,
    reviewResult,
    issuesResult,
  ] = await Promise.all([
    supabase
      .from(
        "subcontractor_schedule_requests",
      )
      .select(`
        *,
        projects (*),
        team_members (*)
      `)
      .order("submitted_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(100),

    supabase
      .from(
        "subcontractor_material_reviews",
      )
      .select(`
        *,
        projects (*),
        team_members (*)
      `)
      .order("submitted_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(100),

    supabase
      .from(
        "subcontractor_material_issues",
      )
      .select(
        "id, review_id, status",
      ),
  ]);

  const firstError =
    scheduleResult.error ??
    reviewResult.error ??
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

  const issueCounts = new Map<
    string,
    {
      total: number;
      unresolved: number;
    }
  >();

  for (
    const issue of
    issuesResult.data ?? []
  ) {
    const reviewId = String(
      issue.review_id ?? "",
    );

    if (!reviewId) {
      continue;
    }

    const current =
      issueCounts.get(reviewId) ?? {
        total: 0,
        unresolved: 0,
      };

    current.total += 1;

    if (
      issue.status === "open" ||
      issue.status === "reviewing"
    ) {
      current.unresolved += 1;
    }

    issueCounts.set(
      reviewId,
      current,
    );
  }

  const scheduleItems = (
    scheduleResult.data ?? []
  ).map((record) => {
    const raw =
      record as Record<string, unknown>;

    const submittedAt =
      typeof raw.submitted_at ===
      "string"
        ? raw.submitted_at
        : null;

    const createdAt =
      typeof raw.created_at ===
      "string"
        ? raw.created_at
        : new Date(0).toISOString();

    return {
      id: String(raw.id ?? ""),
      type: "schedule_response",
      status: String(
        raw.status ?? "pending",
      ),
      title:
        raw.status === "submitted"
          ? "Installer schedule submitted"
          : "Schedule request pending",
      project: normalizeProject(
        raw.projects,
      ),
      installer: normalizeInstaller(
        raw.team_members,
      ),
      submittedAt,
      createdAt,
      activityAt:
        submittedAt ?? createdAt,
      earliestDemoStart:
        typeof raw
          .earliest_demo_start ===
        "string"
          ? raw.earliest_demo_start
          : null,
      earliestConstructionStart:
        typeof raw
          .earliest_construction_start ===
        "string"
          ? raw
              .earliest_construction_start
          : null,
      demoDurationDays:
        raw.demo_duration_days === null ||
        raw.demo_duration_days ===
          undefined
          ? null
          : Number(
              raw.demo_duration_days,
            ),
      totalDurationDays:
        raw.total_duration_days ===
          null ||
        raw.total_duration_days ===
          undefined
          ? null
          : Number(
              raw.total_duration_days,
            ),
      notes:
        typeof raw.notes === "string"
          ? raw.notes
          : typeof raw
                .notes_original ===
              "string"
            ? raw.notes_original
            : null,
      href:
        "/operations/schedule-requests",
    };
  });

  const reviewItems = (
    reviewResult.data ?? []
  ).map((record) => {
    const raw =
      record as Record<string, unknown>;

    const id = String(
      raw.id ?? "",
    );

    const counts =
      issueCounts.get(id) ?? {
        total: 0,
        unresolved: 0,
      };

    const submittedAt =
      typeof raw.submitted_at ===
      "string"
        ? raw.submitted_at
        : null;

    const openedAt =
      typeof raw.opened_at ===
      "string"
        ? raw.opened_at
        : null;

    const createdAt =
      typeof raw.created_at ===
      "string"
        ? raw.created_at
        : new Date(0).toISOString();

    const reviewResultValue =
      typeof raw.review_result ===
      "string"
        ? raw.review_result
        : null;

    return {
      id,
      type: "material_review",
      status: String(
        raw.status ?? "pending",
      ),
      title:
        reviewResultValue ===
        "approved"
          ? "Material list approved"
          : reviewResultValue ===
              "issues_reported"
            ? "Material issues reported"
            : openedAt
              ? "Material review opened"
              : "Material review pending",
      project: normalizeProject(
        raw.projects,
      ),
      installer: normalizeInstaller(
        raw.team_members,
      ),
      reviewResult:
        reviewResultValue,
      submittedAt,
      openedAt,
      createdAt,
      activityAt:
        submittedAt ??
        openedAt ??
        createdAt,
      totalIssues: counts.total,
      unresolvedIssues:
        counts.unresolved,
      notes:
        typeof raw.notes_original ===
        "string"
          ? raw.notes_original
          : null,
      href:
        `/operations/material-reviews/${id}`,
    };
  });

  const items = [
    ...scheduleItems,
    ...reviewItems,
  ].sort((a, b) => {
    return (
      new Date(b.activityAt).getTime() -
      new Date(a.activityAt).getTime()
    );
  });

  const needsAttention =
    items.filter((item) => {
      if (
        item.type ===
        "schedule_response"
      ) {
        return (
          item.status === "submitted"
        );
      }

      return (
        item.reviewResult ===
          "issues_reported" &&
        item.unresolvedIssues > 0
      );
    }).length;

  return NextResponse.json({
    success: true,
    items,
    summary: {
      total: items.length,
      needsAttention,
      submittedSchedules:
        scheduleItems.filter(
          (item) =>
            item.status ===
            "submitted",
        ).length,
      materialIssues:
        reviewItems.reduce(
          (total, item) =>
            total +
            item.unresolvedIssues,
          0,
        ),
    },
  });
}
