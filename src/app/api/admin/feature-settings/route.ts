import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type FeatureSettingRow = {
  feature_key: string;
  display_name: string;
  description: string;
  category: string;
  sort_order: number | string | null;
  is_enabled: boolean;
  is_overridden: boolean;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function validScopeType(
  value: string,
) {
  return [
    "global",
    "company",
    "workspace",
  ].includes(value);
}

export async function GET(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const scopeType =
    cleanText(
      request.nextUrl.searchParams.get(
        "scopeType",
      ),
    ) || "global";

  const scopeId =
    cleanText(
      request.nextUrl.searchParams.get(
        "scopeId",
      ),
    ) || "default";

  if (!validScopeType(scopeType)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid feature-setting scope.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "get_feature_settings",
      {
        requested_scope_type:
          scopeType,

        requested_scope_id:
          scopeId,
      },
    );

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

    scopeType,
    scopeId,

    features: (
      (data ?? []) as FeatureSettingRow[]
    ).map((feature) => ({
      featureKey:
        feature.feature_key,

      displayName:
        feature.display_name,

      description:
        feature.description,

      category:
        feature.category,

      sortOrder:
        Number(
          feature.sort_order ?? 0,
        ),

      isEnabled:
        Boolean(
          feature.is_enabled,
        ),

      isOverridden:
        Boolean(
          feature.is_overridden,
        ),
    })),
  });
}

export async function PATCH(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const body =
    (await request.json()) as {
      scopeType?: unknown;
      scopeId?: unknown;
      featureKey?: unknown;
      isEnabled?: unknown;
    };

  const scopeType =
    cleanText(body.scopeType);

  const scopeId =
    cleanText(body.scopeId);

  const featureKey =
    cleanText(body.featureKey);

  if (
    !validScopeType(scopeType) ||
    !scopeId ||
    !featureKey ||
    typeof body.isEnabled !==
      "boolean"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Scope, feature key, and enabled state are required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "set_feature_setting",
      {
        requested_scope_type:
          scopeType,

        requested_scope_id:
          scopeId,

        requested_feature_key:
          featureKey,

        requested_is_enabled:
          body.isEnabled,

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
    setting: data,
  });
}
