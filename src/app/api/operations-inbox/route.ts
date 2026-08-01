import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type InboxItem = {
  id: string;
  type:
    | "schedule_response"
    | "material_review"
    | "change_order";
  status: string;
  title: string;
  project: ReturnType<typeof normalizeProject>;
  installer: ReturnType<typeof normalizeInstaller>;
  submittedAt: string | null;
  createdAt: string;
  activityAt: string;
  href: string;
  reviewedAt?: string | null;
  responseReviewedAt?: string | null;
  reviewResult?: string | null;
  unresolvedIssues: number;
  [key: string]: unknown;
};

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

  await supabase.rpc(
    "expire_change_order_approvals",
  );

  const [
    scheduleResult,
    reviewResult,
    issuesResult,
    changeOrdersResult,
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

    supabase
      .from(
        "project_change_orders",
      )
      .select(`
        *,
        projects (*)
      `)
      .order("updated_at", {
        ascending: false,
      })
      .limit(100),
  ]);

  const firstError =
    scheduleResult.error ??
    reviewResult.error ??
    issuesResult.error ??
    changeOrdersResult.error;

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

  const scheduleItems: InboxItem[] = (
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
      reviewedAt:
        typeof raw.reviewed_at ===
        "string"
          ? raw.reviewed_at
          : null,
      reviewedBy:
        typeof raw.reviewed_by ===
        "string"
          ? raw.reviewed_by
          : null,
      unresolvedIssues: 0,
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

  const reviewItems: InboxItem[] = (
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
      reviewedAt:
        typeof raw.reviewed_at ===
        "string"
          ? raw.reviewed_at
          : null,
      reviewedBy:
        typeof raw.reviewed_by ===
        "string"
          ? raw.reviewed_by
          : null,
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

  const changeOrderItems: InboxItem[] = (
    changeOrdersResult.data ?? []
  ).map((record) => {
    const raw =
      record as Record<string, unknown>;

    const id = String(
      raw.id ?? "",
    );

    const status = String(
      raw.status ?? "draft",
    );

    const approvalOpenedAt =
      typeof raw.approval_opened_at ===
      "string"
        ? raw.approval_opened_at
        : null;

    const approvalSentAt =
      typeof raw.approval_sent_at ===
      "string"
        ? raw.approval_sent_at
        : null;

    const approvedAt =
      typeof raw.approved_at ===
      "string"
        ? raw.approved_at
        : null;

    const declinedAt =
      typeof raw.declined_at ===
      "string"
        ? raw.declined_at
        : null;

    const updatedAt =
      typeof raw.updated_at ===
      "string"
        ? raw.updated_at
        : new Date(0).toISOString();

    const createdAt =
      typeof raw.created_at ===
      "string"
        ? raw.created_at
        : updatedAt;

    return {
      id,
      type: "change_order",
      status,
      title:
        status === "approved"
          ? "Change order approved"
          : status === "declined"
            ? "Change order declined"
            : approvalOpenedAt
              ? "Customer opened change order"
              : status ===
                  "pending_customer"
                ? "Change order awaiting customer"
                : "Change order updated",
      project: normalizeProject(
        raw.projects,
      ),
      installer: null,
      submittedAt:
        approvedAt ?? declinedAt,
      createdAt,
      activityAt:
        approvedAt ??
        declinedAt ??
        approvalOpenedAt ??
        approvalSentAt ??
        updatedAt,
      changeOrderNumber: Number(
        raw.change_order_number ?? 0,
      ),
      changeOrderTitle: String(
        raw.title ?? "Change order",
      ),
      amount: Number(
        raw.amount ?? 0,
      ),
      scheduleImpactDays: Number(
        raw.schedule_impact_days ?? 0,
      ),
      approvalSentAt,
      approvalOpenedAt,
      approvalExpiresAt:
        typeof raw.approval_expires_at ===
        "string"
          ? raw.approval_expires_at
          : null,
      approvedAt,
      declinedAt,
      approvedByName:
        typeof raw.approved_by_name ===
        "string"
          ? raw.approved_by_name
          : null,
      responseReviewedAt:
        typeof raw.response_reviewed_at ===
        "string"
          ? raw.response_reviewed_at
          : null,
      responseReviewedBy:
        typeof raw.response_reviewed_by ===
        "string"
          ? raw.response_reviewed_by
          : null,
      unresolvedIssues: 0,
      customerResponseNotes:
        typeof raw
          .customer_response_notes ===
        "string"
          ? raw
              .customer_response_notes
          : null,
      notes:
        typeof raw.customer_notes ===
        "string"
          ? raw.customer_notes
          : null,
      href:
        `/operations/projects/${String(
          raw.project_id ?? "",
        )}/change-orders`,
    };
  });

  const items = [
    ...scheduleItems,
    ...reviewItems,
    ...changeOrderItems,
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
          item.status === "submitted" &&
          !item.reviewedAt
        );
      }

      if (
        item.type ===
        "change_order"
      ) {
        return (
          (
            item.status === "approved" ||
            item.status === "declined"
          ) &&
          !item.responseReviewedAt
        );
      }

      if (item.reviewedAt) {
        return false;
      }

      if (
        item.reviewResult ===
        "issues_reported"
      ) {
        return (
          item.unresolvedIssues > 0
        );
      }

      return (
        item.status === "submitted"
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
              "submitted" &&
            !item.reviewedAt,
        ).length,
      materialIssues:
        reviewItems.reduce(
          (total, item) =>
            total +
            item.unresolvedIssues,
          0,
        ),
      changeOrdersAwaitingResponse:
        changeOrderItems.filter(
          (item) =>
            item.status ===
            "pending_customer",
        ).length,
      changeOrderResponses:
        changeOrderItems.filter(
          (item) =>
            item.status ===
              "approved" ||
            item.status ===
              "declined",
        ).length,
    },
  });
}
