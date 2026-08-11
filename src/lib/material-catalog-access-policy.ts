import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export type CatalogAuthorizationControls = Readonly<{
  catalogFeatureEnabled: boolean;
  pricePublicationEnabled: boolean;
  estimatePriceApplicationEnabled: boolean;
}>;

export type CatalogCapability =
  | "search_products"
  | "view_supplier_comparisons"
  | "edit_catalog"
  | "manage_suppliers"
  | "upload_supplier_imports"
  | "review_product_mappings"
  | "preview_price_changes"
  | "publish_supplier_prices"
  | "apply_price_to_draft_estimate";

export type CatalogCapabilities = Readonly<{
  featureEnabled: boolean;
  canSearchProducts: boolean;
  canViewSupplierComparisons: boolean;
  canEditCatalog: boolean;
  canManageSuppliers: boolean;
  canUploadSupplierImports: boolean;
  canReviewProductMappings: boolean;
  canPreviewPriceChanges: boolean;
  canPublishSupplierPrices: boolean;
  canApplyPriceToDraftEstimate: boolean;
}>;

type CatalogAccessFacts = Pick<
  EffectiveWorkspaceAccess,
  "portal_access" | "permissions"
>;

function hasPermission(
  access: CatalogAccessFacts | null,
  permission: "view_costs" | "edit_prices" | "manage_suppliers",
) {
  return access?.permissions?.[permission] === true;
}

function hasInternalWorkspace(access: CatalogAccessFacts | null) {
  return (
    access?.portal_access?.admin === true ||
    access?.portal_access?.operations === true ||
    access?.portal_access?.sales === true
  );
}

export function deriveCatalogCapabilities(
  access: CatalogAccessFacts | null,
  controls: CatalogAuthorizationControls,
): CatalogCapabilities {
  const canUseCatalog =
    controls.catalogFeatureEnabled &&
    hasInternalWorkspace(access);
  const canViewCosts =
    canUseCatalog &&
    hasPermission(access, "view_costs");
  const canEditPrices =
    canUseCatalog &&
    hasPermission(access, "edit_prices");
  const canManageSuppliers =
    canUseCatalog &&
    hasPermission(access, "manage_suppliers");

  // Canonical identity changes and reviewed mappings affect every downstream
  // comparison. V0 therefore requires both price stewardship and supplier
  // management instead of treating either permission as sufficient alone.
  const canStewardCatalog =
    canEditPrices && canManageSuppliers;

  return Object.freeze({
    featureEnabled: controls.catalogFeatureEnabled,
    canSearchProducts: canUseCatalog,
    canViewSupplierComparisons: canViewCosts,
    canEditCatalog: canStewardCatalog,
    canManageSuppliers,
    canUploadSupplierImports: canManageSuppliers,
    canReviewProductMappings: canStewardCatalog,
    canPreviewPriceChanges: canStewardCatalog,
    canPublishSupplierPrices:
      canStewardCatalog &&
      controls.pricePublicationEnabled,
    canApplyPriceToDraftEstimate:
      canViewCosts &&
      canEditPrices &&
      access?.portal_access?.sales === true &&
      controls.estimatePriceApplicationEnabled,
  });
}

export function canPerformCatalogAction(
  capabilities: CatalogCapabilities,
  action: CatalogCapability,
) {
  switch (action) {
    case "search_products":
      return capabilities.canSearchProducts;
    case "view_supplier_comparisons":
      return capabilities.canViewSupplierComparisons;
    case "edit_catalog":
      return capabilities.canEditCatalog;
    case "manage_suppliers":
      return capabilities.canManageSuppliers;
    case "upload_supplier_imports":
      return capabilities.canUploadSupplierImports;
    case "review_product_mappings":
      return capabilities.canReviewProductMappings;
    case "preview_price_changes":
      return capabilities.canPreviewPriceChanges;
    case "publish_supplier_prices":
      return capabilities.canPublishSupplierPrices;
    case "apply_price_to_draft_estimate":
      return capabilities.canApplyPriceToDraftEstimate;
  }
}
