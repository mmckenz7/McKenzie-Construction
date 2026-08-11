import {
  buildLowesPilotManifest,
  LOWES_EAST_KNOXVILLE_PILOT_VERSION,
  type LowesPilotItem,
  sha256CanonicalJson,
} from "@/lib/material-catalog-lowes-pilot";

export const LOWES_PILOT_POLICY_VERSION = "material-web-review-v1";

export function normalizeLowesIdentifier(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildLowesCanonicalProduct(item: LowesPilotItem) {
  const normalizedBrand = item.brand.trim().toLocaleLowerCase("en-US");
  const normalizedModel = normalizeLowesIdentifier(item.modelNumber);
  return Object.freeze({
    sku: null,
    category: item.legacyCategory,
    description: item.canonicalName,
    brand: item.brand,
    product_line: null,
    unit: item.sellUnitCode === "PACK" ? "box" : "each",
    unit_cost: "0.00",
    supplier_name: null,
    supplier_item_number: null,
    waste_percent: "0.00",
    is_active: true,
    metadata: Object.freeze({ compatibilityPrice: "not_catalog_evidence" }),
    mckenzie_product_code: `MCK-LWS-${item.itemNumber}`,
    manufacturer_part_number_normalized: normalizedModel,
    canonical_name: item.canonicalName,
    lifecycle_status: "active",
    identity_fingerprint: sha256CanonicalJson({
      brand: normalizedBrand,
      category: item.categoryCode,
      modelNumber: normalizedModel,
    }),
    identity_version: LOWES_PILOT_POLICY_VERSION,
  });
}

export function buildLowesPilotStageRows() {
  const { manifest, manifestSha256 } = buildLowesPilotManifest();
  return Object.freeze({
    batch: Object.freeze({
      import_type: "web_lookup" as const,
      original_filename: `${LOWES_EAST_KNOXVILLE_PILOT_VERSION}.json`,
      file_sha256: manifestSha256,
      parser_version: LOWES_EAST_KNOXVILLE_PILOT_VERSION,
      status: "review_required" as const,
      total_rows: manifest.rows.length,
      valid_rows: manifest.rows.length,
      review_rows: manifest.rows.length,
      excluded_rows: 0,
      metadata: Object.freeze({
        sourceScope: "public_retail",
        locationScope: "store",
        availabilityCaptured: false,
      }),
    }),
    rows: Object.freeze(manifest.rows.map(({ sourceRowNumber, item, evidence }) =>
      Object.freeze({
        source_row_number: sourceRowNumber,
        raw_row: evidence,
        raw_row_sha256: evidence.rawRecordSha256,
        normalized_row: Object.freeze({
          adapterVersion: evidence.adapterVersion,
          availabilityStatus: "unknown",
          canonicalName: item.canonicalName,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          currencyCode: "USD",
          itemNumber: item.itemNumber,
          legacyCategory: item.legacyCategory,
          manufacturerName: item.brand,
          manufacturerPartNumber: item.modelNumber,
          observedAt: evidence.observedAt,
          packageQuantity: item.packageQuantity,
          priceAmount: item.priceAmount,
          priceEvidenceSurface: evidence.priceEvidenceSurface,
          priceType: "retail",
          priceUnitCode: item.priceUnitCode,
          sellUnitCode: item.sellUnitCode,
          sourceRecordId: evidence.sourceRecordId,
          identitySourceReference: evidence.identitySourceReference,
          priceSourceReference: evidence.priceSourceReference,
          storeNumber: evidence.storeNumber,
          taxIncluded: null,
          tradeCode: item.tradeCode,
        }),
        validation_errors: Object.freeze([]),
        validation_warnings: Object.freeze([
          "Availability, delivery, and tax were not captured and must remain unknown.",
        ]),
        row_status: "unmatched" as const,
        normalized_supplier_sku: item.itemNumber,
        normalized_manufacturer_name: item.brand.toLocaleLowerCase("en-US"),
        normalized_manufacturer_part_number: normalizeLowesIdentifier(item.modelNumber),
        normalized_description: item.canonicalName.toLocaleLowerCase("en-US"),
        normalized_unit_code: item.sellUnitCode,
        normalized_currency_code: "USD",
      }))),
  });
}

export type LowesReviewedRow = Readonly<{
  importRowId: string;
  materialCatalogId: string;
  rowRevision: number;
  item: LowesPilotItem;
}>;

export function buildLowesPilotPreview(
  reviewedRows: readonly LowesReviewedRow[],
  batchRevision: number,
) {
  if (reviewedRows.length !== 4) {
    throw new Error("The bounded Lowe's pilot requires exactly four reviewed rows.");
  }
  const { manifest } = buildLowesPilotManifest();
  const byItem = new Map(reviewedRows.map((row) => [row.item.itemNumber, row]));
  const items = manifest.rows.map(({ item, evidence }) => {
    const reviewed = byItem.get(item.itemNumber);
    if (!reviewed || reviewed.rowRevision < 0) {
      throw new Error(`Missing reviewed product mapping for Lowe's item ${item.itemNumber}.`);
    }
    return Object.freeze({
      importRowId: reviewed.importRowId,
      changeType: "new_offer" as const,
      afterState: Object.freeze({
        adapterVersion: evidence.adapterVersion,
        availabilityStatus: "unknown" as const,
        confidence: "confirmed" as const,
        currencyCode: "USD" as const,
        effectiveFrom: evidence.observedAt,
        materialCatalogId: reviewed.materialCatalogId,
        observedAt: evidence.observedAt,
        priceAmount: item.priceAmount,
        priceQuantity: "1",
        priceType: "retail" as const,
        priceUnitCode: item.priceUnitCode,
        rawRecordSha256: evidence.rawRecordSha256,
        sellUnitCode: item.sellUnitCode,
        sourceRecordId: evidence.sourceRecordId,
        identitySourceReference: evidence.identitySourceReference,
        priceEvidenceSurface: evidence.priceEvidenceSurface,
        priceSourceReference: evidence.priceSourceReference,
        sourceType: "web_lookup" as const,
        supplierDescription: item.canonicalName,
        supplierManufacturerName: item.brand,
        supplierManufacturerPartNumber: item.modelNumber,
        supplierSku: item.itemNumber,
        taxIncluded: null,
      }),
    });
  });
  const content = Object.freeze({
    batchRevision,
    policyVersion: LOWES_PILOT_POLICY_VERSION,
    items,
  });
  return Object.freeze({
    ...content,
    contentSha256: sha256CanonicalJson(content),
    summary: Object.freeze({
      source: "Lowe's public retail",
      storeNumber: "1544",
      newOffers: 4,
      newObservations: 4,
      excludedRows: 0,
      availability: "unknown",
    }),
  });
}
