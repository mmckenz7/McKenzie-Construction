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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_revisions",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_revisions",
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
      `
        id,
        project_id,
        status,
        change_order_number,
        title,
        superseded_by_change_order_id
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
    changeOrder.status === "draft"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Draft change orders can be edited directly.",
      },
      {
        status: 400,
      },
    );
  }

  const { data, error } =
    await supabase.rpc(
      "create_change_order_revision",
      {
        requested_source_change_order_id:
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

  const result =
    data as {
      revision_change_order_id?: string;
      revision_change_order_number?: number;
      revision_number?: number;
      copied_line_item_count?: number;
    } | null;

  if (
    !result
      ?.revision_change_order_id
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The revision was created, but its ID was not returned.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,

    revision: {
      id:
        result.revision_change_order_id,

      changeOrderNumber:
        result.revision_change_order_number ??
        0,

      revisionNumber:
        result.revision_number ?? 0,

      copiedLineItemCount:
        result.copied_line_item_count ??
        0,
    },
  });
}
