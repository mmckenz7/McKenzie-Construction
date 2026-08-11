import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import { getServerFeatureMap } from "@/lib/features/server";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export const AI_ESTIMATOR_DISABLED_BODY = {
  success: false as const,
  error: "This feature is disabled for the current account.",
  featureKey: "ai_estimator" as const,
};

export const AI_ESTIMATOR_FORBIDDEN_BODY = {
  success: false as const,
  error: "Sales workspace access is required.",
};

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function authorizeAiEstimatorRequest(
  request: NextRequest | Request,
) {
  const access = await getAuthenticatedAccess();
  if (!access) {
    return {
      authorization: null,
      response: noStore(createUnauthorizedApiResponse(request)),
    };
  }

  const supabase = createAdminServerClient();
  const { data, error } = await supabase.rpc("get_effective_user_access", {
    requested_auth_user_id: access.user.id,
  });
  if (error) {
    return {
      authorization: null,
      response: noStore(NextResponse.json(
        { success: false, error: "User access could not be verified." },
        { status: 500 },
      )),
    };
  }

  const effectiveAccess = data as EffectiveWorkspaceAccess | null;
  if (!effectiveAccess || effectiveAccess.portal_access?.sales !== true) {
    return {
      authorization: null,
      response: noStore(
        NextResponse.json(AI_ESTIMATOR_FORBIDDEN_BODY, { status: 403 }),
      ),
    };
  }

  try {
    const features = await getServerFeatureMap({
      scopeType: "global",
      scopeId: "default",
    });
    if (!features.ai_estimator) {
      return {
        authorization: null,
        response: noStore(
          NextResponse.json(AI_ESTIMATOR_DISABLED_BODY, { status: 403 }),
        ),
      };
    }
  } catch {
    return {
      authorization: null,
      response: noStore(NextResponse.json(
        { success: false, error: "Feature access could not be verified." },
        { status: 500 },
      )),
    };
  }

  return {
    authorization: {
      authUserId: access.user.id,
      appUserId: String(effectiveAccess.user_id),
    },
    response: null,
  };
}

export async function loadSingletonCompanyId() {
  const supabase = createAdminServerClient();
  const result = await supabase
    .from("company_settings")
    .select("id")
    .limit(2);

  if (result.error || !result.data || result.data.length !== 1) {
    throw new Error("AI Estimator company context could not be verified.");
  }

  return String(result.data[0].id);
}
