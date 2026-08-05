import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import { authorizeChangeOrderProjectRequest } from "@/lib/change-order-access";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
    changeOrderId: string;
    requestId: string;
    responseId: string;
  }>;
};

type AcceptanceResult = {
  success?: boolean;
  code?: string;
  acceptance_id?: string;
  project_id?: string;
  change_order_id?: string;
  request_id?: string;
  response_id?: string;
  accepted_by?: string;
  accepted_at?: string;
  already_accepted?: boolean;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function conflictResponse(
  code: string,
  error: string,
) {
  return NextResponse.json(
    {
      success: false,
      code,
      error,
    },
    { status: 409 },
  );
}

export async function POST(
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
    requestId,
    responseId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId) ||
    !isUuid(requestId) ||
    !isUuid(responseId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project, change-order, request, or response ID.",
      },
      { status: 400 },
    );
  }

  const boundary =
    await authorizeChangeOrderProjectRequest({
      access,
      projectId,
      changeOrderId,
    });

  if (
    boundary.response ||
    !boundary.authorization
  ) {
    return boundary.response;
  }

  const authorization =
    boundary.authorization;

  if (
    !authorization.features
      .change_order_vendor_requests
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Subcontractor and supplier requests are disabled for this account.",
        featureKey:
          "change_order_vendor_requests",
      },
      { status: 403 },
    );
  }

  if (!authorization.canViewCosts) {
    return NextResponse.json(
      {
        success: false,
        error:
          "You do not have permission to view costs.",
      },
      { status: 403 },
    );
  }

  if (
    !authorization
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

  const supabase =
    createAdminServerClient();

  const {
    data,
    error,
  } = await supabase.rpc(
    "accept_change_order_vendor_response",
    {
      requested_project_id:
        projectId,
      requested_change_order_id:
        changeOrderId,
      requested_request_id:
        requestId,
      requested_response_id:
        responseId,
      requested_auth_user_id:
        authorization.authUserId,
    },
  );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Vendor response acceptance could not be recorded.",
      },
      { status: 500 },
    );
  }

  const result =
    data as AcceptanceResult | null;

  if (!result?.code) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Vendor response acceptance returned an invalid result.",
      },
      { status: 500 },
    );
  }

  if (
    result.code === "accepted" ||
    result.code === "already_accepted"
  ) {
    return NextResponse.json({
      success: true,
      code: result.code,
      acceptance: {
        id: result.acceptance_id,
        projectId:
          result.project_id,
        changeOrderId:
          result.change_order_id,
        requestId:
          result.request_id,
        responseId:
          result.response_id,
        acceptedAt:
          result.accepted_at,
        alreadyAccepted:
          result.already_accepted ===
          true,
      },
    });
  }

  if (result.code === "not_found") {
    return NextResponse.json(
      {
        success: false,
        code: "not_found",
        error:
          "Vendor response not found.",
      },
      { status: 404 },
    );
  }

  if (
    result.code ===
    "revision_required"
  ) {
    return NextResponse.json(
      {
        success: false,
        code:
          "revision_required",
        error:
          "A draft revision is required before accepting this vendor response.",
        revisionRequired: true,
      },
      { status: 409 },
    );
  }

  if (
    result.code === "inactive_actor"
  ) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const conflictMessages: Record<
    string,
    string
  > = {
    request_unavailable:
      "This vendor request is no longer available for acceptance.",
    request_expired:
      "This vendor request has expired.",
    response_unavailable:
      "This vendor response is not available for acceptance.",
    quote_expired:
      "This vendor quote has expired.",
    acceptance_conflict:
      "A different vendor response has already been accepted.",
  };

  const conflictMessage =
    conflictMessages[result.code];

  if (conflictMessage) {
    return conflictResponse(
      result.code,
      conflictMessage,
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Vendor response acceptance returned an unsupported result.",
    },
    { status: 500 },
  );
}
