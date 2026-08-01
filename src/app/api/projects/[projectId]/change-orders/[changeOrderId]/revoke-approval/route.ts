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

  const supabase =
    createAdminServerClient();

  const {
    data: changeOrder,
    error: lookupError,
  } = await supabase
    .from("project_change_orders")
    .select(
      "id, project_id, status, approval_token, superseded_by_change_order_id",
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
          "This change order does not have an active customer approval link.",
      },
      {
        status: 400,
      },
    );
  }

  const { data, error } =
    await supabase.rpc(
      "revoke_change_order_approval",
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
