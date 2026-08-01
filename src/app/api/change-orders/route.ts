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

function normalizeChangeOrder(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    projectId: String(
      record.project_id ?? "",
    ),
    changeOrderNumber: Number(
      record.change_order_number ?? 0,
    ),
    title: String(
      record.title ?? "Change order",
    ),
    description: String(
      record.description ?? "",
    ),
    status: String(
      record.status ?? "draft",
    ),
    amount: Number(
      record.amount ?? 0,
    ),
    costAmount:
      record.cost_amount === null ||
      record.cost_amount === undefined
        ? null
        : Number(record.cost_amount),
    scheduleImpactDays: Number(
      record.schedule_impact_days ?? 0,
    ),
    requestedBy:
      typeof record.requested_by ===
      "string"
        ? record.requested_by
        : null,
    approvedByName:
      typeof record.approved_by_name ===
      "string"
        ? record.approved_by_name
        : null,
    approvalToken:
      typeof record.approval_token ===
      "string"
        ? record.approval_token
        : null,
    customerResponseNotes:
      typeof record.customer_response_notes ===
      "string"
        ? record.customer_response_notes
        : null,
    approvalSentAt:
      typeof record.approval_sent_at ===
      "string"
        ? record.approval_sent_at
        : null,
    approvalOpenedAt:
      typeof record.approval_opened_at ===
      "string"
        ? record.approval_opened_at
        : null,
    approvalExpiresAt:
      typeof record.approval_expires_at ===
      "string"
        ? record.approval_expires_at
        : null,
    approvedAt:
      typeof record.approved_at ===
      "string"
        ? record.approved_at
        : null,
    declinedAt:
      typeof record.declined_at ===
      "string"
        ? record.declined_at
        : null,
    responseReviewedAt:
      typeof record.response_reviewed_at ===
      "string"
        ? record.response_reviewed_at
        : null,
    createdAt: String(
      record.created_at ?? "",
    ),
    updatedAt: String(
      record.updated_at ?? "",
    ),
    project: normalizeProject(
      record.projects,
    ),
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

  const { data, error } =
    await supabase
      .from("project_change_orders")
      .select(`
        *,
        projects (*)
      `)
      .order("updated_at", {
        ascending: false,
      })
      .limit(250);

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

  const changeOrders = (
    data ?? []
  ).map((record) =>
    normalizeChangeOrder(
      record as Record<string, unknown>,
    ),
  );

  const approvedStatuses =
    new Set([
      "approved",
      "in_progress",
      "completed",
    ]);

  return NextResponse.json({
    success: true,
    changeOrders,
    summary: {
      total: changeOrders.length,

      pendingCustomer:
        changeOrders.filter(
          (item) =>
            item.status ===
            "pending_customer",
        ).length,

      approved:
        changeOrders.filter(
          (item) =>
            approvedStatuses.has(
              item.status,
            ),
        ).length,

      needsReview:
        changeOrders.filter(
          (item) =>
            (
              item.status ===
                "approved" ||
              item.status ===
                "declined"
            ) &&
            !item.responseReviewedAt,
        ).length,

      approvedRevenue:
        changeOrders
          .filter((item) =>
            approvedStatuses.has(
              item.status,
            ),
          )
          .reduce(
            (total, item) =>
              total + item.amount,
            0,
          ),

      pendingRevenue:
        changeOrders
          .filter(
            (item) =>
              item.status ===
              "pending_customer",
          )
          .reduce(
            (total, item) =>
              total + item.amount,
            0,
          ),

      approvedProfit:
        changeOrders
          .filter((item) =>
            approvedStatuses.has(
              item.status,
            ),
          )
          .reduce(
            (total, item) =>
              total +
              item.amount -
              (item.costAmount ?? 0),
            0,
          ),
    },
  });
}
