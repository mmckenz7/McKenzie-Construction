import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import { getServerFeatureMap } from "@/lib/features/server";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export const ESTIMATE_FORBIDDEN_BODY = {
  success: false as const,
  error: "Sales workspace access is required.",
};

export const ESTIMATE_NOT_FOUND_BODY = {
  success: false as const,
  error: "Estimate not found.",
};

export const ESTIMATES_DISABLED_BODY = {
  success: false as const,
  error: "This feature is disabled for the current account.",
  featureKey: "estimates" as const,
};

export type EstimateAuthorization = {
  authUserId: string;
  appUserId: string;
  canEditPrices: boolean;
  canViewCosts: boolean;
  canViewProfit: boolean;
  canSendProposals: boolean;
};

export function hasEstimatePermission(
  access: Pick<EffectiveWorkspaceAccess, "permissions"> | null,
  permission: string,
) {
  return access?.permissions?.[permission] === true;
}

export async function authorizeEstimateRequest(
  request: NextRequest | Request,
  estimateId?: string,
) {
  const access = await getAuthenticatedAccess();
  if (!access) {
    return {
      authorization: null,
      estimate: null,
      response: createUnauthorizedApiResponse(request),
    };
  }

  const supabase = createAdminServerClient();
  const { data, error } = await supabase.rpc("get_effective_user_access", {
    requested_auth_user_id: access.user.id,
  });
  if (error) {
    return {
      authorization: null,
      estimate: null,
      response: NextResponse.json({ success: false, error: "User access could not be verified." }, { status: 500 }),
    };
  }

  const effectiveAccess = data as EffectiveWorkspaceAccess | null;
  if (!effectiveAccess || effectiveAccess.portal_access?.sales !== true) {
    return {
      authorization: null,
      estimate: null,
      response: NextResponse.json(ESTIMATE_FORBIDDEN_BODY, { status: 403 }),
    };
  }

  let features;
  try {
    features = await getServerFeatureMap({ scopeType: "global", scopeId: "default" });
  } catch {
    return {
      authorization: null,
      estimate: null,
      response: NextResponse.json({ success: false, error: "Feature access could not be verified." }, { status: 500 }),
    };
  }
  if (!features.estimates) {
    return {
      authorization: null,
      estimate: null,
      response: NextResponse.json(ESTIMATES_DISABLED_BODY, { status: 403 }),
    };
  }

  let estimate: Record<string, unknown> | null = null;
  if (estimateId) {
    const result = await supabase
      .from("estimates")
      .select("*")
      .eq("id", estimateId)
      .maybeSingle();
    if (result.error) {
      return {
        authorization: null,
        estimate: null,
        response: NextResponse.json({ success: false, error: "Estimate access could not be verified." }, { status: 500 }),
      };
    }
    if (!result.data) {
      return {
        authorization: null,
        estimate: null,
        response: NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 }),
      };
    }
    estimate = result.data as Record<string, unknown>;
  }

  return {
    authorization: {
      authUserId: access.user.id,
      appUserId: String(effectiveAccess.user_id),
      companyId: String(effectiveAccess.company_id),
      canEditPrices: hasEstimatePermission(effectiveAccess, "edit_prices"),
      canViewCosts: hasEstimatePermission(effectiveAccess, "view_costs"),
      canViewProfit: hasEstimatePermission(effectiveAccess, "view_profit"),
      canSendProposals: hasEstimatePermission(effectiveAccess, "send_proposals"),
    },
    estimate,
    response: null,
  };
}
