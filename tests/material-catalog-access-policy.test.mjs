import assert from "node:assert/strict";
import test from "node:test";

import {
  canPerformCatalogAction,
  deriveCatalogCapabilities,
} from "../src/lib/material-catalog-access-policy.ts";

const disabledControls = Object.freeze({
  catalogFeatureEnabled: false,
  pricePublicationEnabled: false,
  estimatePriceApplicationEnabled: false,
});

const safeV0Controls = Object.freeze({
  catalogFeatureEnabled: true,
  pricePublicationEnabled: false,
  estimatePriceApplicationEnabled: false,
});

function access(overrides = {}) {
  return {
    portal_access: {
      admin: false,
      operations: true,
      sales: false,
      subcontractor: false,
      ...(overrides.portal_access ?? {}),
    },
    permissions: {
      view_costs: false,
      edit_prices: false,
      manage_suppliers: false,
      ...(overrides.permissions ?? {}),
    },
  };
}

test("catalog capabilities fail closed without effective access", () => {
  assert.deepEqual(
    deriveCatalogCapabilities(null, safeV0Controls),
    {
      featureEnabled: true,
      canSearchProducts: false,
      canViewSupplierComparisons: false,
      canEditCatalog: false,
      canManageSuppliers: false,
      canUploadSupplierImports: false,
      canReviewProductMappings: false,
      canPreviewPriceChanges: false,
      canPublishSupplierPrices: false,
      canApplyPriceToDraftEstimate: false,
    },
  );
});

test("the feature control denies every action even when permissions are present", () => {
  const capabilities = deriveCatalogCapabilities(
    access({
      permissions: {
        view_costs: true,
        edit_prices: true,
        manage_suppliers: true,
      },
    }),
    disabledControls,
  );

  assert.equal(capabilities.featureEnabled, false);
  for (const value of Object.entries(capabilities)) {
    if (value[0] !== "featureEnabled") assert.equal(value[1], false, value[0]);
  }
});

test("catalog identity search is available to internal workspaces without exposing costs", () => {
  for (const workspace of ["admin", "operations", "sales"]) {
    const capabilities = deriveCatalogCapabilities(
      access({
        portal_access: {
          admin: false,
          operations: false,
          sales: false,
          [workspace]: true,
        },
      }),
      safeV0Controls,
    );
    assert.equal(capabilities.canSearchProducts, true, workspace);
    assert.equal(capabilities.canViewSupplierComparisons, false, workspace);
  }

  const subcontractor = deriveCatalogCapabilities(
    access({
      portal_access: {
        admin: false,
        operations: false,
        sales: false,
        subcontractor: true,
      },
    }),
    safeV0Controls,
  );
  assert.equal(subcontractor.canSearchProducts, false);
});

test("supplier comparisons require the explicit view-costs permission", () => {
  assert.equal(
    deriveCatalogCapabilities(
      access({ permissions: { view_costs: true } }),
      safeV0Controls,
    ).canViewSupplierComparisons,
    true,
  );
  assert.equal(
    deriveCatalogCapabilities(
      access({ permissions: { view_costs: false } }),
      safeV0Controls,
    ).canViewSupplierComparisons,
    false,
  );
});

test("supplier administration does not imply canonical catalog stewardship", () => {
  const supplierManager = deriveCatalogCapabilities(
    access({ permissions: { manage_suppliers: true } }),
    safeV0Controls,
  );
  assert.equal(supplierManager.canManageSuppliers, true);
  assert.equal(supplierManager.canUploadSupplierImports, true);
  assert.equal(supplierManager.canEditCatalog, false);
  assert.equal(supplierManager.canReviewProductMappings, false);
  assert.equal(supplierManager.canPreviewPriceChanges, false);

  const priceEditor = deriveCatalogCapabilities(
    access({ permissions: { edit_prices: true } }),
    safeV0Controls,
  );
  assert.equal(priceEditor.canManageSuppliers, false);
  assert.equal(priceEditor.canEditCatalog, false);
});

test("catalog stewardship requires price and supplier permissions together", () => {
  const capabilities = deriveCatalogCapabilities(
    access({
      permissions: {
        view_costs: true,
        edit_prices: true,
        manage_suppliers: true,
      },
    }),
    safeV0Controls,
  );
  assert.equal(capabilities.canEditCatalog, true);
  assert.equal(capabilities.canReviewProductMappings, true);
  assert.equal(capabilities.canPreviewPriceChanges, true);
  assert.equal(capabilities.canPublishSupplierPrices, false);
});

test("publication remains separately disabled after review and preview are allowed", () => {
  const steward = access({
    permissions: {
      view_costs: true,
      edit_prices: true,
      manage_suppliers: true,
    },
  });
  assert.equal(
    deriveCatalogCapabilities(steward, safeV0Controls).canPublishSupplierPrices,
    false,
  );
  assert.equal(
    deriveCatalogCapabilities(steward, {
      ...safeV0Controls,
      pricePublicationEnabled: true,
    }).canPublishSupplierPrices,
    true,
  );
});

test("estimate price application has an independent Sales-only control", () => {
  const estimator = access({
    portal_access: { sales: true },
    permissions: {
      view_costs: true,
      edit_prices: true,
      manage_suppliers: false,
    },
  });
  assert.equal(
    deriveCatalogCapabilities(estimator, safeV0Controls).canApplyPriceToDraftEstimate,
    false,
  );
  assert.equal(
    deriveCatalogCapabilities(estimator, {
      ...safeV0Controls,
      estimatePriceApplicationEnabled: true,
    }).canApplyPriceToDraftEstimate,
    true,
  );

  const operationsOnly = access({
    permissions: { view_costs: true, edit_prices: true },
  });
  assert.equal(
    deriveCatalogCapabilities(operationsOnly, {
      ...safeV0Controls,
      estimatePriceApplicationEnabled: true,
    }).canApplyPriceToDraftEstimate,
    false,
  );
});

test("action checks map every capability without granting implicit defaults", () => {
  const capabilities = deriveCatalogCapabilities(
    access({
      permissions: {
        view_costs: true,
        edit_prices: true,
        manage_suppliers: true,
      },
    }),
    safeV0Controls,
  );
  const expectations = {
    search_products: true,
    view_supplier_comparisons: true,
    edit_catalog: true,
    manage_suppliers: true,
    upload_supplier_imports: true,
    review_product_mappings: true,
    preview_price_changes: true,
    publish_supplier_prices: false,
    apply_price_to_draft_estimate: false,
  };
  for (const [action, allowed] of Object.entries(expectations)) {
    assert.equal(canPerformCatalogAction(capabilities, action), allowed, action);
  }
});

test("capability derivation is immutable and does not mutate access facts", () => {
  const facts = access({ permissions: { view_costs: true } });
  const before = structuredClone(facts);
  const capabilities = deriveCatalogCapabilities(facts, safeV0Controls);
  assert.deepEqual(facts, before);
  assert.equal(Object.isFrozen(capabilities), true);
});
