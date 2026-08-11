import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import {
  deriveCatalogCapabilities,
  type CatalogCapabilities,
} from "@/lib/material-catalog-access-policy";
import { getServerFeatureMap } from "@/lib/features/server";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export const MATERIAL_CATALOG_DISABLED_BODY = {
  success: false as const,
  error: "This feature is disabled for the current account.",
  featureKey: "material_catalog" as const,
};

export const MATERIAL_CATALOG_FORBIDDEN_BODY = {
  success: false as const,
  error: "Internal workspace access is required.",
};

export type MaterialCatalogAuthorization = Readonly<{
  authUserId: string;
  appUserId: string;
  companyId: string;
  capabilities: CatalogCapabilities;
}>;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function authorizeMaterialCatalogRequest(
  request: NextRequest | Request,
) {
  const authenticated = await getAuthenticatedAccess();
  if (!authenticated) {
    return {
      authorization: null,
      response: noStore(createUnauthorizedApiResponse(request)),
    };
  }

  const supabase = createAdminServerClient();
  const { data, error } = await supabase.rpc("get_effective_user_access", {
    requested_auth_user_id: authenticated.user.id,
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
  if (!effectiveAccess || !isUuid(effectiveAccess.company_id)) {
    return {
      authorization: null,
      response: noStore(NextResponse.json(
        { success: false, error: "Company access could not be verified." },
        { status: 500 },
      )),
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
      response: noStore(NextResponse.json(
        { success: false, error: "Feature access could not be verified." },
        { status: 500 },
      )),
    };
  }

  const capabilities = deriveCatalogCapabilities(effectiveAccess, {
    catalogFeatureEnabled: features.material_catalog,
    pricePublicationEnabled: features.material_catalog_price_publication,
    estimatePriceApplicationEnabled: features.material_catalog_estimate_pricing,
  });

  if (!capabilities.featureEnabled) {
    return {
      authorization: null,
      response: noStore(
        NextResponse.json(MATERIAL_CATALOG_DISABLED_BODY, { status: 403 }),
      ),
    };
  }

  if (!capabilities.canSearchProducts) {
    return {
      authorization: null,
      response: noStore(
        NextResponse.json(MATERIAL_CATALOG_FORBIDDEN_BODY, { status: 403 }),
      ),
    };
  }

  return {
    authorization: Object.freeze({
      authUserId: authenticated.user.id,
      appUserId: String(effectiveAccess.user_id),
      companyId: effectiveAccess.company_id,
      capabilities,
    }),
    response: null,
  };
}
