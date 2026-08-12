export const FENCE_EMBLEM_LOWES_EVIDENCE_VERSION =
  "lowes-south-knoxville-emblem-public-retail-v0";
export const FENCE_EMBLEM_LOWES_MANIFEST_SHA256 =
  "da75d9faf8314eb810e2e33479ccfa271efd1e31b96a6340e07665ac139d0a33";

export const FENCE_EMBLEM_LOWES_OBSERVED_AT = "2026-08-12T17:53:29Z";

export const FENCE_EMBLEM_LOWES_STORE = Object.freeze({
  supplierName: "Lowe's",
  supplierSlug: "lowes",
  storeNumber: "2239",
  name: "S. Knoxville Lowe's",
  addressLine1: "7520 Mountain Grove Drive",
  city: "Knoxville",
  state: "TN",
  postalCode: "37920",
  sourceReference: "https://www.lowes.com/store/TN-Knoxville/2239",
});

export type FenceEmblemDemandKey =
  | "emblem_panel_6x8_white"
  | "emblem_post_line_5x5x108_white"
  | "emblem_post_corner_5x5x108_white"
  | "emblem_post_end_5x5x108_white"
  | "vinyl_post_cap_5x5_white_pyramid";

export type FenceEmblemLowesEvidenceItem = Readonly<{
  demandKey: FenceEmblemDemandKey;
  itemNumber: string;
  modelNumber: string;
  brand: "CATALYST" | "Freedom";
  canonicalName: string;
  priceAmount: string;
  sellUnitCode: "EA";
  availabilityDisplayText: "5,000+ Available" | null;
  identitySourceReference: string;
  priceSourceReference: string;
}>;

const LOWES_PRODUCT_OR_COLLECTION_URL =
  /^https:\/\/www\.lowes\.com\/(?:pd\/[A-Za-z0-9-]+\/[0-9]+|collections\/[A-Za-z0-9-]+\/[A-Za-z0-9_]+)$/;

const ACCEPTED_RAW_SHA256_BY_ITEM = Object.freeze({
  "667016": "6298b46f91ec75f94479454fb4f79a34854c98089b47e1f1e8f883ef9c904fb1",
  "1944652": "f880b8aef7e6cbfc84b963bdcca9ee54103e49b06d45357dbf5b77199d9021e6",
  "1944653": "92d3aba805168d7a47c01426f6f3595cc4a0db6c75279fa8b1ea982ce6be5b67",
  "1944654": "c35cc7bef03696d927625f4ac2b8a7fbc520232ff5a031e6e6cc6f5666e55815",
  "385320": "035dd34f08f0da0683a92a0fb57dabd7c456528c74c068419bb47bbd0f5233ae",
} as const);

export const FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS = Object.freeze([
  Object.freeze({
    demandKey: "emblem_panel_6x8_white",
    itemNumber: "667016",
    modelNumber: "73014714",
    brand: "CATALYST",
    canonicalName: "Emblem 6-ft H x 8-ft W white vinyl flat-top privacy fence panel",
    priceAmount: "149.79",
    sellUnitCode: "EA",
    availabilityDisplayText: "5,000+ Available",
    identitySourceReference:
      "https://www.lowes.com/pd/Freedom-Actual-6-ft-x-7-82-ft-Ready-to-Assemble-Emblem-White-Vinyl-Flat-Top-Vinyl-Fence-Panel/50374104",
    priceSourceReference:
      "https://www.lowes.com/pd/Freedom-Actual-6-ft-x-7-82-ft-Ready-to-Assemble-Emblem-White-Vinyl-Flat-Top-Vinyl-Fence-Panel/50374104",
  }),
  Object.freeze({
    demandKey: "emblem_post_line_5x5x108_white",
    itemNumber: "1944652",
    modelNumber: "73045783",
    brand: "CATALYST",
    canonicalName: "Emblem 9-ft H x 5-in W white vinyl line fence post",
    priceAmount: "41.54",
    sellUnitCode: "EA",
    availabilityDisplayText: "5,000+ Available",
    identitySourceReference:
      "https://www.lowes.com/pd/Freedom-5-in-x-5-in-x-108-in-LINE-POST-WHITE/1002750242",
    priceSourceReference:
      "https://www.lowes.com/pd/Freedom-5-in-x-5-in-x-108-in-LINE-POST-WHITE/1002750242",
  }),
  Object.freeze({
    demandKey: "emblem_post_corner_5x5x108_white",
    itemNumber: "1944653",
    modelNumber: "73045784",
    brand: "CATALYST",
    canonicalName: "Emblem 9-ft H x 5-in W white vinyl corner fence post",
    priceAmount: "41.54",
    sellUnitCode: "EA",
    availabilityDisplayText: "5,000+ Available",
    identitySourceReference:
      "https://www.lowes.com/pd/Freedom-5-in-x-5-in-x-108-in-CORNER-POST-WHITE/1002750254",
    priceSourceReference:
      "https://www.lowes.com/pd/Freedom-5-in-x-5-in-x-108-in-CORNER-POST-WHITE/1002750254",
  }),
  Object.freeze({
    demandKey: "emblem_post_end_5x5x108_white",
    itemNumber: "1944654",
    modelNumber: "73045785",
    brand: "CATALYST",
    canonicalName: "Emblem 9-ft H x 5-in W white vinyl end fence post",
    priceAmount: "41.54",
    sellUnitCode: "EA",
    availabilityDisplayText: "5,000+ Available",
    identitySourceReference:
      "https://www.lowes.com/pd/Freedom-Emblem-9-ft-H-x-5-in-W-White-Vinyl-End-Fence-Post-Cap/1002750264",
    priceSourceReference:
      "https://www.lowes.com/pd/Freedom-Emblem-9-ft-H-x-5-in-W-White-Vinyl-End-Fence-Post-Cap/1002750264",
  }),
  Object.freeze({
    demandKey: "vinyl_post_cap_5x5_white_pyramid",
    itemNumber: "385320",
    modelNumber: "73003093",
    brand: "Freedom",
    canonicalName: "5-in x 5-in white vinyl pyramid fence post cap",
    priceAmount: "4.37",
    sellUnitCode: "EA",
    availabilityDisplayText: null,
    identitySourceReference:
      "https://www.lowes.com/pd/Freedom-5-0-Inches-W-x-5-0-Inches-L-White-Vinyl-fence-Post-cap-Fits-Common-Post-Measurement-5-in-x-5-in/3601816",
    priceSourceReference:
      "https://www.lowes.com/pd/Freedom-5-0-Inches-W-x-5-0-Inches-L-White-Vinyl-fence-Post-cap-Fits-Common-Post-Measurement-5-in-x-5-in/3601816",
  }),
] satisfies readonly FenceEmblemLowesEvidenceItem[]);

export function buildFenceEmblemLowesEvidence(
  item: FenceEmblemLowesEvidenceItem,
) {
  if (!/^\d+\.\d{2}$/.test(item.priceAmount)) {
    throw new Error(`Invalid exact retail price for Lowe's item ${item.itemNumber}.`);
  }
  if (!LOWES_PRODUCT_OR_COLLECTION_URL.test(item.identitySourceReference)
    || !LOWES_PRODUCT_OR_COLLECTION_URL.test(item.priceSourceReference)) {
    throw new Error(`Invalid Lowe's evidence URL for item ${item.itemNumber}.`);
  }
  const accepted = FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS.find(
    (candidate) => candidate.itemNumber === item.itemNumber,
  );
  if (!accepted || Object.keys(accepted).some((key) =>
    accepted[key as keyof FenceEmblemLowesEvidenceItem]
      !== item[key as keyof FenceEmblemLowesEvidenceItem])) {
    throw new Error(`Lowe's evidence differs from the accepted item ${item.itemNumber}.`);
  }

  const evidence = Object.freeze({
    adapterVersion: FENCE_EMBLEM_LOWES_EVIDENCE_VERSION,
    availabilityDisplayText: item.availabilityDisplayText,
    availabilityDisplayInterpretation:
      item.availabilityDisplayText === null ? "not_captured" as const : "display_only_not_inventory_quantity" as const,
    availabilityStatus: "unknown" as const,
    currencyCode: "USD" as const,
    demandKey: item.demandKey,
    identitySourceReference: item.identitySourceReference,
    itemNumber: item.itemNumber,
    manufacturerName: item.brand,
    manufacturerPartNumber: item.modelNumber,
    observedAt: FENCE_EMBLEM_LOWES_OBSERVED_AT,
    packageQuantity: "1",
    priceAmount: item.priceAmount,
    priceEvidenceSurface: "localized_public_product_page" as const,
    priceSourceReference: item.priceSourceReference,
    priceType: "retail" as const,
    priceUnitCode: item.sellUnitCode,
    sellUnitCode: item.sellUnitCode,
    sourceRecordId:
      `lowes:item:${item.itemNumber}:store:${FENCE_EMBLEM_LOWES_STORE.storeNumber}:observed:${FENCE_EMBLEM_LOWES_OBSERVED_AT}`,
    storeNumber: FENCE_EMBLEM_LOWES_STORE.storeNumber,
    supplierDescription: item.canonicalName,
    taxIncluded: null,
  });

  return Object.freeze({
    ...evidence,
    rawRecordSha256:
      ACCEPTED_RAW_SHA256_BY_ITEM[item.itemNumber as keyof typeof ACCEPTED_RAW_SHA256_BY_ITEM],
  });
}

export function buildFenceEmblemLowesEvidenceManifest() {
  const rows = FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS.map((item, index) =>
    Object.freeze({
      sourceRowNumber: index + 1,
      evidence: buildFenceEmblemLowesEvidence(item),
    }));
  const manifest = Object.freeze({
    version: FENCE_EMBLEM_LOWES_EVIDENCE_VERSION,
    sourceType: "web_lookup" as const,
    scope: "evidence_only_not_approved_for_publication" as const,
    store: FENCE_EMBLEM_LOWES_STORE,
    rows: Object.freeze(rows),
  });
  return Object.freeze({
    manifest,
    manifestSha256: FENCE_EMBLEM_LOWES_MANIFEST_SHA256,
  });
}
