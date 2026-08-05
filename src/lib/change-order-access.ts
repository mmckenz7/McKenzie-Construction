import {
  NextResponse,
} from "next/server";

import type {
  AuthenticatedAccess,
} from "@/lib/api-auth";
import { getServerFeatureMap } from "@/lib/features/server";
import {
  canAccessChangeOrderProject,
  changeOrderBelongsToProject,
  hasChangeOrderPermission,
} from "@/lib/change-order-access-policy";
import { INSPECTION_PROJECT_FORBIDDEN_BODY } from "@/lib/inspection-task-dependencies";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export const CHANGE_ORDER_PROJECT_FORBIDDEN_BODY =
  INSPECTION_PROJECT_FORBIDDEN_BODY;

export const CHANGE_ORDER_NOT_FOUND_BODY = {
  success: false as const,
  error: "Change order not found.",
};

export const CHANGE_ORDERS_DISABLED_BODY = {
  success: false as const,
  error:
    "This feature is disabled for the current account.",
  featureKey: "change_orders" as const,
};

export const CHANGE_ORDER_APPROVAL_FORBIDDEN_BODY = {
  success: false as const,
  error:
    "You do not have permission to approve change orders.",
};

type AuthorizeChangeOrderProjectOptions = {
  access: AuthenticatedAccess;
  projectId: string;
  changeOrderId?: string;
};

export async function authorizeChangeOrderProjectRequest(
  options: AuthorizeChangeOrderProjectOptions,
) {
  const supabase =
    createAdminServerClient();

  const {
    data: effectiveAccessData,
    error: effectiveAccessError,
  } = await supabase.rpc(
    "get_effective_user_access",
    {
      requested_auth_user_id:
        options.access.user.id,
    },
  );

  if (effectiveAccessError) {
    return {
      authorization: null,
      response: NextResponse.json(
        {
          success: false,
          error:
            "User access could not be verified.",
        },
        { status: 500 },
      ),
    };
  }

  const effectiveAccess =
    effectiveAccessData as EffectiveWorkspaceAccess | null;

  if (
    !effectiveAccess ||
    effectiveAccess.portal_access
      ?.operations !== true
  ) {
    return {
      authorization: null,
      response: NextResponse.json(
        CHANGE_ORDER_PROJECT_FORBIDDEN_BODY,
        { status: 403 },
      ),
    };
  }

  let features;

  try {
    features = await getServerFeatureMap({
      scopeType: "global",
      scopeId: "default",
    });
  } catch {
    return {
      authorization: null,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Feature access could not be verified.",
        },
        { status: 500 },
      ),
    };
  }

  if (!features.change_orders) {
    return {
      authorization: null,
      response: NextResponse.json(
        CHANGE_ORDERS_DISABLED_BODY,
        { status: 403 },
      ),
    };
  }

  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select("id, project_manager_id")
    .eq("id", options.projectId)
    .maybeSingle();

  if (projectError) {
    return {
      authorization: null,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Project access could not be verified.",
        },
        { status: 500 },
      ),
    };
  }

  if (
    !canAccessChangeOrderProject(
      {
        teamMemberId:
          options.access.teamMember.id,
        roles:
          options.access.teamMember.roles,
      },
      project,
    )
  ) {
    return {
      authorization: null,
      response: NextResponse.json(
        CHANGE_ORDER_PROJECT_FORBIDDEN_BODY,
        { status: 403 },
      ),
    };
  }

  if (options.changeOrderId) {
    const {
      data: changeOrder,
      error: changeOrderError,
    } = await supabase
      .from("project_change_orders")
      .select("id, project_id")
      .eq("id", options.changeOrderId)
      .eq("project_id", options.projectId)
      .maybeSingle();

    if (changeOrderError) {
      return {
        authorization: null,
        response: NextResponse.json(
          {
            success: false,
            error:
              "Change-order access could not be verified.",
          },
          { status: 500 },
        ),
      };
    }

    if (
      !changeOrderBelongsToProject(
        changeOrder,
        options.projectId,
      )
    ) {
      return {
        authorization: null,
        response: NextResponse.json(
          CHANGE_ORDER_NOT_FOUND_BODY,
          { status: 404 },
        ),
      };
    }
  }

  const canViewCosts =
    hasChangeOrderPermission(
      effectiveAccess,
      "view_costs",
    );
  const canApproveChangeOrders =
    hasChangeOrderPermission(
      effectiveAccess,
      "approve_change_orders",
    );

  return {
    authorization: {
      authUserId:
        options.access.user.id,
      features,
      canViewCosts,
      canApproveChangeOrders,
    },
    response: null,
  };
}
