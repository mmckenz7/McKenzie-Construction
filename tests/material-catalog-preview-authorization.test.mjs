import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accessPath = "src/lib/material-catalog-access.ts";
const access = readFileSync(accessPath, "utf8");

function position(fragment) {
  const index = access.indexOf(fragment);
  assert.notEqual(index, -1, `missing authorization step: ${fragment}`);
  return index;
}

test("supplier-pricing preview authorization is ordered and fails closed", () => {
  const authenticate = position("await getAuthenticatedAccess()");
  const effectiveAccess = position('supabase.rpc("get_effective_user_access"');
  const validateAppUser = position("!isUuid(effectiveAccess.user_id)");
  const validateCompany = position("!isUuid(effectiveAccess.company_id)");
  const validateAuthUser = position(
    "effectiveAccess.auth_user_id !== authenticated.user.id",
  );
  const featureMap = position("await getServerFeatureMap({");
  const featureEnabled = position("!capabilities.featureEnabled");
  const productAccess = position("!capabilities.canSearchProducts");
  const costRequirement = position(
    'requiredCapability === "view_supplier_comparisons"',
  );
  const costAccess = position("!capabilities.canViewSupplierComparisons");
  const singleton = position('.from("company_settings")');
  const authorized = position('return {\n    state: "authorized"');

  assert.ok(authenticate < effectiveAccess);
  assert.ok(effectiveAccess < validateAppUser);
  assert.ok(validateAppUser < validateCompany);
  assert.ok(validateCompany < validateAuthUser);
  assert.ok(validateAuthUser < featureMap);
  assert.ok(featureMap < featureEnabled);
  assert.ok(featureEnabled < productAccess);
  assert.ok(productAccess < costRequirement);
  assert.ok(costRequirement < costAccess);
  assert.ok(costAccess < singleton);
  assert.ok(singleton < authorized);
});

test("generic request authorization preserves search access while preview opts into costs", () => {
  assert.match(
    access,
    /getMaterialCatalogAuthorizationDecision\(\n  requiredCapability: MaterialCatalogReadCapability = "search_products"/,
  );
  assert.match(
    access,
    /requiredCapability === "view_supplier_comparisons" &&\n    !capabilities\.canViewSupplierComparisons/,
  );
  assert.match(
    access,
    /export async function authorizeMaterialCatalogRequest[\s\S]*?getMaterialCatalogAuthorizationDecision\(\)/,
  );
  assert.match(
    access,
    /error: "Internal workspace access is required\."/,
  );
});

test("feature and tenant scope cannot be selected by the browser", () => {
  assert.match(
    access,
    /getServerFeatureMap\(\{[\s\S]*?scopeType: "global",[\s\S]*?scopeId: "default"/,
  );
  assert.doesNotMatch(
    access,
    /getFeatureScopeFromRequest|x-feature-scope|searchParams|get\("companyId"\)|get\("company_id"\)|request.*requiredCapability/,
  );
  assert.match(access, /companyRows\.length !== 1/);
  assert.match(
    access,
    /companyRows\[0\]\.id !== effectiveAccess\.company_id/,
  );
});

test("the shared decision performs authorization SELECTs only and no catalog business query", () => {
  assert.match(access, /^import "server-only";/);
  assert.match(
    access,
    /export async function getMaterialCatalogAuthorizationDecision/,
  );
  assert.doesNotMatch(
    access,
    /from\("(?:material_catalog|material_supplier_prices|supplier_product_offers|supplier_offer_observations|supplier_offer_observation_prices)"\)/,
  );
  assert.doesNotMatch(
    access,
    /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.storage\b/,
  );
});

test("every denial state is generic and the request wrapper remains no-store compatible", () => {
  for (const state of [
    "unauthorized",
    "access_unavailable",
    "feature_unavailable",
    "feature_disabled",
    "forbidden",
    "tenant_scope_unavailable",
  ]) {
    assert.match(access, new RegExp(`state: "${state}"`));
    assert.match(access, new RegExp(`case "${state}"`));
  }

  assert.match(
    access,
    /export async function authorizeMaterialCatalogRequest/,
  );
  assert.match(access, /response\.headers\.set\("Cache-Control", "no-store"\)/);
  assert.doesNotMatch(access, /error\.message|String\(error\)|details:|stack:/);
});
