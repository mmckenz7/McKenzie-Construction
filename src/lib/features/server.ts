import { NextRequest } from "next/server";

import {
  FeatureKey,
  FeatureMap,
  DEFAULT_FEATURE_MAP,
} from "@/lib/features/types";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export type FeatureScopeType =
  | "global"
  | "company"
  | "workspace";

export type FeatureScope = {
  scopeType: FeatureScopeType;
  scopeId: string;
};

function cleanText(
  value: string | null,
) {
  return value?.trim() ?? "";
}

function validScopeType(
  value: string,
): value is FeatureScopeType {
  return [
    "global",
    "company",
    "workspace",
  ].includes(value);
}

export function getFeatureScopeFromRequest(
  request: NextRequest,
): FeatureScope {
  const requestedScopeType =
    cleanText(
      request.headers.get(
        "x-feature-scope-type",
      ),
    ) ||
    cleanText(
      request.nextUrl.searchParams.get(
        "scopeType",
      ),
    );

  const requestedScopeId =
    cleanText(
      request.headers.get(
        "x-feature-scope-id",
      ),
    ) ||
    cleanText(
      request.nextUrl.searchParams.get(
        "scopeId",
      ),
    );

  if (
    validScopeType(
      requestedScopeType,
    ) &&
    requestedScopeId
  ) {
    return {
      scopeType:
        requestedScopeType,

      scopeId:
        requestedScopeId,
    };
  }

  return {
    scopeType: "global",
    scopeId: "default",
  };
}

function normalizeFeatureMap(
  value: unknown,
): FeatureMap {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return DEFAULT_FEATURE_MAP;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  const materialCatalog =
    record.material_catalog === true;

  return {
    estimates:
      record.estimates !== false,

    ai_estimator:
      record.ai_estimator === true,

    guided_site_visits:
      record.ai_estimator === true &&
      record.guided_site_visits === true,

    guided_site_visit_ai_usability_review:
      record.ai_estimator === true &&
      record.guided_site_visits === true &&
      record.guided_site_visit_ai_usability_review === true,

    material_catalog:
      materialCatalog,

    material_catalog_price_publication:
      materialCatalog &&
      record.material_catalog_price_publication === true,

    material_catalog_estimate_pricing:
      materialCatalog &&
      record.material_catalog_estimate_pricing === true,

    change_orders:
      record.change_orders !== false,

    change_order_line_items:
      record.change_order_line_items !==
      false,

    change_order_customer_approval:
      record
        .change_order_customer_approval !==
      false,

    change_order_revisions:
      record.change_order_revisions !==
      false,

    change_order_vendor_requests:
      record
        .change_order_vendor_requests !==
      false,

    change_order_billing:
      record.change_order_billing !==
      false,

    change_order_financial_details:
      record
        .change_order_financial_details !==
      false,

    change_order_activity_tracking:
      record
        .change_order_activity_tracking !==
      false,

    inspections:
      record.inspections !== false,

    inspection_municipality_research:
      record
        .inspection_municipality_research !==
      false,

    inspection_schedule_dependencies:
      record
        .inspection_schedule_dependencies !==
      false,

    inspection_document_extraction:
      record
        .inspection_document_extraction !==
      false,

    inspection_partial_pass:
      record
        .inspection_partial_pass !==
      false,

    inspection_corrections:
      record.inspection_corrections !==
      false,
  };
}

export async function getServerFeatureMap(
  scope: FeatureScope,
) {
  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "get_effective_feature_map",
      {
        requested_scope_type:
          scope.scopeType,

        requested_scope_id:
          scope.scopeId,
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  return normalizeFeatureMap(data);
}

export async function checkApiFeature(
  request: NextRequest,
  featureKey: FeatureKey,
) {
  const scope =
    getFeatureScopeFromRequest(
      request,
    );

  const features =
    await getServerFeatureMap(
      scope,
    );

  return {
    enabled:
      Boolean(
        features[featureKey],
      ),

    features,
    scope,
  };
}
