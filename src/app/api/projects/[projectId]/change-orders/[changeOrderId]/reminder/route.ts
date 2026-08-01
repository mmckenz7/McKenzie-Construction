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
    changeOrderId: string;
  }>;
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

  const supabase =
    createAdminServerClient();

  const {
    data: changeOrder,
    error: lookupError,
  } = await supabase
    .from("project_change_orders")
    .select(
      `
        id,
        project_id,
        status,
        approval_token
      `,
    )
    .eq("id", changeOrderId)
    .eq("project_id", projectId)
    .single();

  if (
    lookupError ||
    !changeOrder
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          lookupError?.message ??
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    changeOrder.status !==
      "pending_customer" ||
    !changeOrder.approval_token
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Only change orders waiting on the customer can receive reminders.",
      },
      {
        status: 400,
      },
    );
  }

  const { data, error } =
    await supabase.rpc(
      "record_change_order_approval_reminder",
      {
        requested_change_order_id:
          changeOrderId,
        requested_auth_user_id:
          authUser.id,
      },
    );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
    result: data,
  });
}
