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

export type MaterialCatalogReadCapability =
  | "search_products"
  | "view_supplier_comparisons";

export type MaterialCatalogAuthorization = Readonly<{
  authUserId: string;
  appUserId: string;
  companyId: string;
  capabilities: CatalogCapabilities;
}>;

export type MaterialCatalogAuthorizationDecision =
  | Readonly<{
      state: "authorized";
      authorization: MaterialCatalogAuthorization;
    }>
  | Readonly<{
      state:
        | "unauthorized"
        | "access_unavailable"
        | "feature_unavailable"
        | "feature_disabled"
        | "forbidden"
        | "tenant_scope_unavailable";
      authorization: null;
    }>;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getMaterialCatalogAuthorizationDecision(
  requiredCapability: MaterialCatalogReadCapability = "search_products",
): Promise<MaterialCatalogAuthorizationDecision> {
  const authenticated = await getAuthenticatedAccess();
  if (!authenticated) {
    return {
      authorization: null,
      state: "unauthorized",
    };
  }

  const supabase = createAdminServerClient();
  const { data, error } = await supabase.rpc("get_effective_user_access", {
    requested_auth_user_id: authenticated.user.id,
  });
  if (error) {
    return {
      authorization: null,
      state: "access_unavailable",
    };
  }

  const effectiveAccess = data as EffectiveWorkspaceAccess | null;
  if (
    !effectiveAccess ||
    !isUuid(effectiveAccess.user_id) ||
    !isUuid(effectiveAccess.company_id) ||
    !isUuid(effectiveAccess.auth_user_id) ||
    effectiveAccess.auth_user_id !== authenticated.user.id
  ) {
    return {
      authorization: null,
      state: "access_unavailable",
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
      state: "feature_unavailable",
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
      state: "feature_disabled",
    };
  }

  if (!capabilities.canSearchProducts) {
    return {
      authorization: null,
      state: "forbidden",
    };
  }

  if (
    requiredCapability === "view_supplier_comparisons" &&
    !capabilities.canViewSupplierComparisons
  ) {
    return {
      authorization: null,
      state: "forbidden",
    };
  }

  const companyResult = await supabase
    .from("company_settings")
    .select("id")
    .limit(2);
  const companyRows = companyResult.data ?? [];

  if (
    companyResult.error ||
    companyRows.length !== 1 ||
    !isUuid(companyRows[0]?.id) ||
    companyRows[0].id !== effectiveAccess.company_id
  ) {
    return {
      authorization: null,
      state: "tenant_scope_unavailable",
    };
  }

  return {
    state: "authorized",
    authorization: Object.freeze({
      authUserId: authenticated.user.id,
      appUserId: effectiveAccess.user_id,
      companyId: effectiveAccess.company_id,
      capabilities,
    }),
  };
}

export async function authorizeMaterialCatalogRequest(
  request: NextRequest | Request,
) {
  const decision = await getMaterialCatalogAuthorizationDecision();

  switch (decision.state) {
    case "authorized":
      return {
        authorization: decision.authorization,
        response: null,
      };
    case "unauthorized":
      return {
        authorization: null,
        response: noStore(createUnauthorizedApiResponse(request)),
      };
    case "access_unavailable":
      return {
        authorization: null,
        response: noStore(NextResponse.json(
          { success: false, error: "User access could not be verified." },
          { status: 500 },
        )),
      };
    case "feature_unavailable":
      return {
        authorization: null,
        response: noStore(NextResponse.json(
          { success: false, error: "Feature access could not be verified." },
          { status: 500 },
        )),
      };
    case "feature_disabled":
      return {
        authorization: null,
        response: noStore(
          NextResponse.json(MATERIAL_CATALOG_DISABLED_BODY, { status: 403 }),
        ),
      };
    case "forbidden":
      return {
        authorization: null,
        response: noStore(
          NextResponse.json(MATERIAL_CATALOG_FORBIDDEN_BODY, { status: 403 }),
        ),
      };
    case "tenant_scope_unavailable":
      return {
        authorization: null,
        response: noStore(NextResponse.json(
          { success: false, error: "Catalog company scope could not be verified." },
          { status: 503 },
        )),
      };
  }
}
