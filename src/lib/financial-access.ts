import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export const FINANCIALS_FORBIDDEN_BODY = {
  success: false as const,
  error: "Financial reporting access is required.",
};

export async function authorizeFinancialsRequest(
  request: NextRequest | Request,
) {
  const authenticated = await getAuthenticatedAccess();

  if (!authenticated) {
    return {
      access: null,
      response: createUnauthorizedApiResponse(request),
    };
  }

  const supabase = createAdminServerClient();
  const { data, error } = await supabase.rpc(
    "get_effective_user_access",
    {
      requested_auth_user_id: authenticated.user.id,
    },
  );

  if (error) {
    return {
      access: null,
      response: NextResponse.json(
        {
          success: false,
          error: "Financial access could not be verified.",
        },
        { status: 500 },
      ),
    };
  }

  const access = data as EffectiveWorkspaceAccess | null;
  const canViewFinancials =
    access?.portal_access?.admin === true &&
    access.permissions?.view_profit === true;

  if (!canViewFinancials) {
    return {
      access: null,
      response: NextResponse.json(
        FINANCIALS_FORBIDDEN_BODY,
        { status: 403 },
      ),
    };
  }

  return {
    access,
    response: null,
  };
}
