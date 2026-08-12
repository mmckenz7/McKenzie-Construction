import { createHash } from "node:crypto";

export const LOWES_EAST_KNOXVILLE_PILOT_VERSION =
  "lowes-east-knoxville-public-retail-v1";
export const LOWES_EAST_KNOXVILLE_OBSERVED_AT =
  "2026-08-11T20:52:58.340Z";
export const LOWES_EAST_KNOXVILLE_RAIL_OBSERVED_AT =
  "2026-08-11T21:50:36.621Z";

export const LOWES_EAST_KNOXVILLE_STORE = Object.freeze({
  supplierName: "Lowe's",
  supplierSlug: "lowes",
  storeNumber: "1544",
  name: "E. Knoxville Lowe's",
  addressLine1: "3100 S Mall Rd NE",
  city: "Knoxville",
  state: "TN",
  postalCode: "37924",
});

export type LowesPilotItem = Readonly<{
  itemNumber: string;
  modelNumber: string;
  brand: string;
  canonicalName: string;
  categoryCode: string;
  categoryName: string;
  tradeCode: string;
  legacyCategory: string;
  priceAmount: string;
  sellUnitCode: "EA" | "PACK";
  priceUnitCode: "EA" | "PACK";
  packageQuantity: string | null;
  observedAt: string;
  canonicalPath: string;
  priceSourcePath: string;
}>;

export const LOWES_EAST_KNOXVILLE_PILOT_ITEMS = Object.freeze([
  Object.freeze({
    itemNumber: "202922",
    modelNumber: "635548",
    brand: "Severe Weather",
    canonicalName:
      "Severe Weather 5/8-in x 5-1/2-in x 6-ft pressure-treated Southern yellow pine dog-ear fence picket",
    categoryCode: "fence_pickets",
    categoryName: "Fence pickets",
    tradeCode: "fencing",
    legacyCategory: "Fencing",
    priceAmount: "2.28",
    sellUnitCode: "EA",
    priceUnitCode: "EA",
    packageQuantity: null,
    observedAt: LOWES_EAST_KNOXVILLE_OBSERVED_AT,
    canonicalPath:
      "/pd/Severe-Weather-5-8-in-x-5-1-2-in-x-6-ft-Pressure-Treated-Southern-Yellow-Pine-Dog-Ear-Fence-Picket/5013086547",
    priceSourcePath: "/search?searchTerm=202922",
  }),
  Object.freeze({
    itemNumber: "10385",
    modelNumber: "110180",
    brand: "QUIKRETE",
    canonicalName: "QUIKRETE 80-lb high-strength concrete mix bag",
    categoryCode: "concrete_mix",
    categoryName: "Concrete mix",
    tradeCode: "concrete",
    legacyCategory: "Concrete",
    priceAmount: "6.98",
    sellUnitCode: "EA",
    priceUnitCode: "EA",
    packageQuantity: null,
    observedAt: LOWES_EAST_KNOXVILLE_OBSERVED_AT,
    canonicalPath: "/pd/QUIKRETE-80-lb-High-Strength-Concrete-Mix/3006075",
    priceSourcePath: "/search?searchTerm=QUIKRETE%2080-lb%20concrete%20mix",
  }),
  Object.freeze({
    itemNumber: "894294",
    modelNumber: "48419",
    brand: "Deck Plus",
    canonicalName: "Deck Plus #10 x 3-in ceramic deck screws, 310-count box",
    categoryCode: "deck_screws",
    categoryName: "Deck screws",
    tradeCode: "fasteners",
    legacyCategory: "Fasteners",
    priceAmount: "29.98",
    sellUnitCode: "PACK",
    priceUnitCode: "PACK",
    packageQuantity: "310",
    observedAt: LOWES_EAST_KNOXVILLE_OBSERVED_AT,
    canonicalPath: "/pd/Deck-Plus-10-x-3-in-Ceramic-Deck-Screws-5-lb/1000318525",
    priceSourcePath: "/search?searchTerm=Deck%20Plus%205-lb%203-in%20deck%20screws",
  }),
  Object.freeze({
    itemNumber: "312282",
    modelNumber: "OG220408-AG",
    brand: "Severe Weather",
    canonicalName:
      "Severe Weather 2-in x 4-in x 8-ft pressure-treated dimensional lumber",
    categoryCode: "dimensional_lumber",
    categoryName: "Dimensional lumber",
    tradeCode: "framing",
    legacyCategory: "Lumber",
    priceAmount: "4.68",
    sellUnitCode: "EA",
    priceUnitCode: "EA",
    packageQuantity: null,
    observedAt: LOWES_EAST_KNOXVILLE_RAIL_OBSERVED_AT,
    canonicalPath:
      "/pd/Severe-Weather-Common-2-in-x-4-in-x-8-ft-Actual-1-5-in-x-3-5-in-x-8-ft-2-Treated-Lumber/4564778",
    priceSourcePath:
      "/search?searchTerm=Severe%20Weather%202-in%20x%204-in%20x%208-ft%20pressure%20treated",
  }),
] satisfies readonly LowesPilotItem[]);

export function canonicalLowesUrl(path: string) {
  if (!/^\/pd\/[A-Za-z0-9-]+\/[0-9]+$/.test(path)) {
    throw new Error("The Lowe's pilot accepts canonical public product paths only.");
  }
  return `https://www.lowes.com${path}`;
}

export function canonicalLowesPriceSearchUrl(path: string) {
  const approvedPaths = new Set<string>(LOWES_EAST_KNOXVILLE_PILOT_ITEMS.map(
    (item) => item.priceSourcePath,
  ));
  if (!approvedPaths.has(path)) {
    throw new Error("The Lowe's pilot accepts its fixed public search paths only.");
  }
  return `https://www.lowes.com${path}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

export function sha256CanonicalJson(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function buildLowesPilotEvidence(item: LowesPilotItem) {
  if (!/^\d+(?:\.\d{1,4})?$/.test(item.priceAmount)) {
    throw new Error(`Invalid exact retail price for Lowe's item ${item.itemNumber}.`);
  }
  const evidence = Object.freeze({
    adapterVersion: LOWES_EAST_KNOXVILLE_PILOT_VERSION,
    availabilityStatus: "unknown" as const,
    brand: item.brand,
    canonicalName: item.canonicalName,
    categoryCode: item.categoryCode,
    categoryName: item.categoryName,
    identitySourceReference: canonicalLowesUrl(item.canonicalPath),
    currencyCode: "USD" as const,
    itemNumber: item.itemNumber,
    legacyCategory: item.legacyCategory,
    modelNumber: item.modelNumber,
    observedAt: item.observedAt,
    packageQuantity: item.packageQuantity,
    priceAmount: item.priceAmount,
    priceEvidenceSurface: "localized_search_results" as const,
    priceSourceReference: canonicalLowesPriceSearchUrl(item.priceSourcePath),
    priceType: "retail" as const,
    priceUnitCode: item.priceUnitCode,
    sellUnitCode: item.sellUnitCode,
    sourceRecordId:
      `lowes:item:${item.itemNumber}:store:${LOWES_EAST_KNOXVILLE_STORE.storeNumber}`,
    storeNumber: LOWES_EAST_KNOXVILLE_STORE.storeNumber,
    taxIncluded: null,
    tradeCode: item.tradeCode,
  });
  return Object.freeze({
    ...evidence,
    canonicalUrl: evidence.identitySourceReference,
    rawRecordSha256: sha256CanonicalJson(evidence),
  });
}

export function buildLowesPilotManifest() {
  const rows = LOWES_EAST_KNOXVILLE_PILOT_ITEMS.map((item, index) =>
    Object.freeze({
      sourceRowNumber: index + 1,
      item,
      evidence: buildLowesPilotEvidence(item),
    }));
  const manifest = Object.freeze({
    version: LOWES_EAST_KNOXVILLE_PILOT_VERSION,
    sourceType: "web_lookup" as const,
    store: LOWES_EAST_KNOXVILLE_STORE,
    rows,
  });
  return Object.freeze({ manifest, manifestSha256: sha256CanonicalJson(manifest) });
}
