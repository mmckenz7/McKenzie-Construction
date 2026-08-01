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
    projectId: string;
  }>;
};

type CreateChangeOrderBody = {
  title?: string;
  description?: string;
  reason?: string | null;
  amount?: number;
  costAmount?: number | null;
  scheduleImpactDays?: number;
  customerNotes?: string | null;
  internalNotes?: string | null;
  requestedBy?: string | null;
  status?:
    | "draft"
    | "pending_customer";
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeProject(
  record: Record<string, unknown>,
) {
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
    title: String(record.title ?? ""),
    description: String(
      record.description ?? "",
    ),
    reason:
      typeof record.reason === "string"
        ? record.reason
        : null,
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
    customerNotes:
      typeof record.customer_notes ===
      "string"
        ? record.customer_notes
        : null,
    internalNotes:
      typeof record.internal_notes ===
      "string"
        ? record.internal_notes
        : null,
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
    customerResponseNotes:
      typeof record.customer_response_notes ===
      "string"
        ? record.customer_response_notes
        : null,
    responseReviewedAt:
      typeof record.response_reviewed_at ===
      "string"
        ? record.response_reviewed_at
        : null,
    responseReviewedBy:
      typeof record.response_reviewed_by ===
      "string"
        ? record.response_reviewed_by
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
    completedAt:
      typeof record.completed_at ===
      "string"
        ? record.completed_at
        : null,
    cancelledAt:
      typeof record.cancelled_at ===
      "string"
        ? record.cancelled_at
        : null,
    createdAt: String(
      record.created_at ?? "",
    ),
    updatedAt: String(
      record.updated_at ?? "",
    ),
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

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    projectResult,
    changeOrdersResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single(),

    supabase
      .from("project_change_orders")
      .select("*")
      .eq("project_id", projectId)
      .order("change_order_number", {
        ascending: false,
      }),
  ]);

  if (
    projectResult.error ||
    !projectResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectResult.error?.message ??
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (changeOrdersResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          changeOrdersResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  const changeOrders = (
    changeOrdersResult.data ?? []
  ).map((record) =>
    normalizeChangeOrder(
      record as Record<string, unknown>,
    ),
  );

  return NextResponse.json({
    success: true,
    project: normalizeProject(
      projectResult.data as Record<
        string,
        unknown
      >,
    ),
    changeOrders,
    summary: {
      count: changeOrders.length,
      approvedAmount:
        changeOrders
          .filter((item) =>
            [
              "approved",
              "in_progress",
              "completed",
            ].includes(item.status),
          )
          .reduce(
            (total, item) =>
              total + item.amount,
            0,
          ),
      pendingAmount:
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
      totalScheduleImpactDays:
        changeOrders
          .filter((item) =>
            [
              "approved",
              "in_progress",
              "completed",
            ].includes(item.status),
          )
          .reduce(
            (total, item) =>
              total +
              item.scheduleImpactDays,
            0,
          ),
    },
  });
}

export async function POST(
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

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  let body: CreateChangeOrderBody;

  try {
    body =
      (await request.json()) as CreateChangeOrderBody;
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

  const title =
    body.title?.trim() ?? "";

  const description =
    body.description?.trim() ?? "";

  if (!title || !description) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A title and description are required.",
      },
      {
        status: 400,
      },
    );
  }

  const amount =
    typeof body.amount === "number"
      ? body.amount
      : 0;

  const costAmount =
    typeof body.costAmount === "number"
      ? body.costAmount
      : null;

  if (
    amount < 0 ||
    (costAmount !== null &&
      costAmount < 0)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Amounts cannot be negative.",
      },
      {
        status: 400,
      },
    );
  }

  const scheduleImpactDays =
    Number.isFinite(
      body.scheduleImpactDays,
    )
      ? Math.trunc(
          body.scheduleImpactDays ?? 0,
        )
      : 0;

  const supabase =
    createAdminServerClient();

  const { data: accessData } =
    await supabase.rpc(
      "get_effective_user_access",
      {
        requested_auth_user_id:
          authUser.id,
      },
    );

  const createdBy =
    accessData &&
    typeof accessData === "object" &&
    "user_id" in accessData
      ? String(accessData.user_id)
      : null;

  const { data, error } =
    await supabase
      .from("project_change_orders")
      .insert({
        project_id: projectId,
        change_order_number: 0,
        title,
        description,
        reason:
          body.reason?.trim() || null,
        status:
          body.status ===
          "pending_customer"
            ? "pending_customer"
            : "draft",
        amount,
        cost_amount: costAmount,
        schedule_impact_days:
          scheduleImpactDays,
        customer_notes:
          body.customerNotes?.trim() ||
          null,
        internal_notes:
          body.internalNotes?.trim() ||
          null,
        requested_by:
          body.requestedBy?.trim() ||
          null,
        created_by: createdBy,
      })
      .select("*")
      .single();

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

  return NextResponse.json({
    success: true,
    changeOrder:
      normalizeChangeOrder(
        data as Record<string, unknown>,
      ),
  });
}
