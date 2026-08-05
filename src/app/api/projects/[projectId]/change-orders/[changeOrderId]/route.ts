import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import {
  authorizeChangeOrderProjectRequest,
} from "@/lib/change-order-access";
import {
  filterChangeOrderFinancialFields,
  isCustomerDecisionStatus,
} from "@/lib/change-order-access-policy";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
    changeOrderId: string;
  }>;
};

type UpdateChangeOrderBody = {
  title?: string;
  description?: string;
  reason?: string | null;
  status?:
    | "draft"
    | "pending_customer"
    | "approved"
    | "declined"
    | "in_progress"
    | "completed"
    | "cancelled";
  amount?: number;
  costAmount?: number | null;
  scheduleImpactDays?: number;
  customerNotes?: string | null;
  internalNotes?: string | null;
  requestedBy?: string | null;
  approvedByName?: string | null;
};

const allowedStatuses = new Set([
  "draft",
  "pending_customer",
  "approved",
  "declined",
  "in_progress",
  "completed",
  "cancelled",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const {
    projectId,
    changeOrderId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or change-order ID.",
      },
      {
        status: 400,
      },
    );
  }

  const authorization =
    await authorizeChangeOrderProjectRequest({
      access,
      projectId,
      changeOrderId,
    });

  if (authorization.response) {
    return authorization.response;
  }

  let body: UpdateChangeOrderBody;

  try {
    body =
      (await request.json()) as UpdateChangeOrderBody;
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
    body.status &&
    !allowedStatuses.has(body.status)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid change-order status.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    isCustomerDecisionStatus(
      body.status,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Customer approval and decline must be submitted through the customer response workflow.",
      },
      { status: 400 },
    );
  }

  const approvalRelatedEdit =
    body.status ===
      "pending_customer" ||
    "approvedByName" in body;

  if (
    approvalRelatedEdit &&
    !authorization.authorization
      .canApproveChangeOrders
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "You do not have permission to approve change orders.",
      },
      { status: 403 },
    );
  }

  if (
    "costAmount" in body &&
    !authorization.authorization
      .canViewCosts
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "You do not have permission to edit change-order costs.",
      },
      { status: 403 },
    );
  }

  if (
    typeof body.amount === "number" &&
    body.amount < 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The customer amount cannot be negative.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof body.costAmount ===
      "number" &&
    body.costAmount < 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The cost amount cannot be negative.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: current,
    error: currentError,
  } = await supabase
    .from("project_change_orders")
    .select("*")
    .eq("id", changeOrderId)
    .eq("project_id", projectId)
    .single();

  if (currentError || !current) {
    return NextResponse.json(
      {
        success: false,
        error:
          currentError?.message ??
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  const update: Record<
    string,
    unknown
  > = {};

  if (
    typeof body.title === "string"
  ) {
    const title = body.title.trim();

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The title cannot be empty.",
        },
        {
          status: 400,
        },
      );
    }

    update.title = title;
  }

  if (
    typeof body.description ===
    "string"
  ) {
    const description =
      body.description.trim();

    if (!description) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The description cannot be empty.",
        },
        {
          status: 400,
        },
      );
    }

    update.description = description;
  }

  if ("reason" in body) {
    update.reason =
      body.reason?.trim() || null;
  }

  if (
    typeof body.amount === "number"
  ) {
    update.amount = body.amount;
  }

  if ("costAmount" in body) {
    update.cost_amount =
      typeof body.costAmount ===
      "number"
        ? body.costAmount
        : null;
  }

  if (
    typeof body.scheduleImpactDays ===
    "number"
  ) {
    update.schedule_impact_days =
      Math.trunc(
        body.scheduleImpactDays,
      );
  }

  if ("customerNotes" in body) {
    update.customer_notes =
      body.customerNotes?.trim() ||
      null;
  }

  if ("internalNotes" in body) {
    update.internal_notes =
      body.internalNotes?.trim() ||
      null;
  }

  if ("requestedBy" in body) {
    update.requested_by =
      body.requestedBy?.trim() ||
      null;
  }

  if ("approvedByName" in body) {
    update.approved_by_name =
      body.approvedByName?.trim() ||
      null;
  }

  if (body.status) {
    update.status = body.status;

    if (
      body.status === "completed"
    ) {
      update.completed_at =
        new Date().toISOString();
    }

    if (
      body.status === "cancelled"
    ) {
      update.cancelled_at =
        new Date().toISOString();
    }

    if (
      body.status === "draft" ||
      body.status ===
        "pending_customer" ||
      body.status === "in_progress"
    ) {
      update.declined_at = null;
      update.cancelled_at = null;
    }
  }

  const { data, error } =
    await supabase
      .from("project_change_orders")
      .update(update)
      .eq("id", changeOrderId)
      .eq("project_id", projectId)
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
      filterChangeOrderFinancialFields(
        data,
        authorization.authorization
          .canViewCosts,
      ),
  });
}
