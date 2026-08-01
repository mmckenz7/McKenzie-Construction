import {
  randomUUID,
} from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { checkApiFeature } from "@/lib/features/server";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
    changeOrderId: string;
  }>;
};

type CreateApprovalLinkBody = {
  expiresInDays?: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_customer_approval",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_customer_approval",
      },
      {
        status: 403,
      },
    );
  }


  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
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

  let body: CreateApprovalLinkBody = {};

  try {
    body =
      (await request.json()) as CreateApprovalLinkBody;
  } catch {
    body = {};
  }

  const expiresInDays =
    typeof body.expiresInDays ===
      "number" &&
    body.expiresInDays >= 1 &&
    body.expiresInDays <= 90
      ? Math.trunc(
          body.expiresInDays,
        )
      : 14;

  const expiresAt = new Date();

  expiresAt.setDate(
    expiresAt.getDate() +
      expiresInDays,
  );

  const supabase =
    createAdminServerClient();

  const {
    data: changeOrder,
    error: changeOrderError,
  } = await supabase
    .from("project_change_orders")
    .select(
      `
        id,
        project_id,
        change_order_number,
        title,
        status,
        approval_token,
        superseded_by_change_order_id
      `,
    )
    .eq("id", changeOrderId)
    .eq("project_id", projectId)
    .single();

  if (
    changeOrderError ||
    !changeOrder
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          changeOrderError?.message ??
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    changeOrder.status ===
      "completed" ||
    changeOrder.status ===
      "cancelled"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Completed or cancelled change orders cannot be sent for approval.",
      },
      {
        status: 400,
      },
    );
  }

  const newApprovalToken =
    randomUUID();

  const { data, error } =
    await supabase
      .from("project_change_orders")
      .update({
        status: "pending_customer",
        approval_token:
          newApprovalToken,
        approval_sent_at:
          new Date().toISOString(),
        approval_opened_at: null,
        approval_expires_at:
          expiresAt.toISOString(),
        approved_by_name: null,
        approved_at: null,
        declined_at: null,
        customer_response_notes:
          null,
        customer_response_ip: null,
        customer_response_user_agent:
          null,
        customer_acknowledged_terms:
          false,
        customer_agreement_text:
          null,
        response_reviewed_at:
          null,
        response_reviewed_by:
          null,
        approval_reminder_sent_at:
          null,
        approval_reminder_count:
          0,
      })
      .eq("id", changeOrderId)
      .eq("project_id", projectId)
      .select(
        `
          id,
          project_id,
          change_order_number,
          title,
          status,
          approval_token,
          approval_sent_at,
          approval_opened_at,
          approval_expires_at
        `,
      )
      .single();

  if (error || !data) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ??
          "Could not create the approval link.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    changeOrder: {
      id: data.id,
      projectId:
        data.project_id,
      changeOrderNumber:
        data.change_order_number,
      title: data.title,
      status: data.status,
      approvalToken:
        data.approval_token,
      approvalSentAt:
        data.approval_sent_at,
      approvalOpenedAt:
        data.approval_opened_at,
      approvalExpiresAt:
        data.approval_expires_at,
    },
  });
}
