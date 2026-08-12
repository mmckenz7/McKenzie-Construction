import type {
  EmblemManufacturerTakeoff,
  EmblemTakeoffProjection,
} from "./fence-emblem-takeoff";
import type { FenceEmblemDemandKey } from "./fence-emblem-lowes-evidence";

const CURRENT_EVIDENCE_VERSION = "lowes-south-knoxville-emblem-public-retail-v0";
const CURRENT_EVIDENCE_MANIFEST_SHA256 =
  "da75d9faf8314eb810e2e33479ccfa271efd1e31b96a6340e07665ac139d0a33";
const CURRENT_TAKEOFF_SYSTEM = "lowes_emblem_white_privacy_6x8_working_v0";
const CURRENT_TAKEOFF_AUTHORITY = "source_derived_working_test_rule";
const MAX_SUPPORTED_QUANTITY = 10_000;

const EXPECTED_IDENTITIES = Object.freeze({
  emblem_panel_6x8_white: Object.freeze({
    itemNumber: "667016", modelNumber: "73014714", priceAmount: "149.79",
    rawRecordSha256: "6298b46f91ec75f94479454fb4f79a34854c98089b47e1f1e8f883ef9c904fb1",
  }),
  emblem_post_line_5x5x108_white: Object.freeze({
    itemNumber: "1944652", modelNumber: "73045783", priceAmount: "41.54",
    rawRecordSha256: "f880b8aef7e6cbfc84b963bdcca9ee54103e49b06d45357dbf5b77199d9021e6",
  }),
  emblem_post_corner_5x5x108_white: Object.freeze({
    itemNumber: "1944653", modelNumber: "73045784", priceAmount: "41.54",
    rawRecordSha256: "92d3aba805168d7a47c01426f6f3595cc4a0db6c75279fa8b1ea982ce6be5b67",
  }),
  emblem_post_end_5x5x108_white: Object.freeze({
    itemNumber: "1944654", modelNumber: "73045785", priceAmount: "41.54",
    rawRecordSha256: "c35cc7bef03696d927625f4ac2b8a7fbc520232ff5a031e6e6cc6f5666e55815",
  }),
  vinyl_post_cap_5x5_white_pyramid: Object.freeze({
    itemNumber: "385320", modelNumber: "73003093", priceAmount: "4.37",
    rawRecordSha256: "035dd34f08f0da0683a92a0fb57dabd7c456528c74c068419bb47bbd0f5233ae",
  }),
} satisfies Readonly<Record<FenceEmblemDemandKey, Readonly<{
  itemNumber: string;
  modelNumber: string;
  priceAmount: string;
  rawRecordSha256: string;
}>>>);

type EvidenceRow = Readonly<{
  sourceRowNumber: number;
  evidence: Readonly<{
    adapterVersion: string;
    availabilityDisplayText: string | null;
    availabilityDisplayInterpretation: string;
    availabilityStatus: string;
    currencyCode: string;
    demandKey: FenceEmblemDemandKey;
    identitySourceReference: string;
    itemNumber: string;
    manufacturerName: string;
    manufacturerPartNumber: string;
    observedAt: string;
    packageQuantity: string;
    priceAmount: string;
    priceEvidenceSurface: string;
    priceSourceReference: string;
    priceType: string;
    priceUnitCode: string;
    rawRecordSha256: string;
    sellUnitCode: string;
    sourceRecordId: string;
    storeNumber: string;
    supplierDescription: string;
    taxIncluded: null;
  }>;
}>;

export type FenceEmblemEvidenceManifestEnvelope = Readonly<{
  manifest: Readonly<{
    version: string;
    sourceType: string;
    scope: string;
    store: Readonly<{
      supplierName: string;
      supplierSlug: string;
      storeNumber: string;
      name: string;
      addressLine1: string;
      city: string;
      state: string;
      postalCode: string;
      sourceReference: string;
    }>;
    rows: readonly EvidenceRow[];
  }>;
  manifestSha256: string;
}>;

export type FenceEmblemPricedPreviewIssueCode =
  | "TAKEOFF_NOT_READY"
  | "UNSUPPORTED_TAKEOFF_SCHEMA"
  | "EVIDENCE_SCHEMA_NOT_CURRENT"
  | "EVIDENCE_INTEGRITY_ERROR"
  | "UNSUPPORTED_QUANTITY";

export type FenceEmblemPricedPreviewLine = Readonly<{
  demandKey: FenceEmblemDemandKey;
  quantity: number;
  itemNumber: string;
  modelNumber: string;
  description: string;
  unitPriceCents: string;
  unitPriceAmount: string;
  subtotalCents: string;
  subtotalAmount: string;
  currencyCode: "USD";
  priceType: "retail";
  priceSourceReference: string;
  identitySourceReference: string;
  availabilityStatus: "unknown";
  availabilityDisplayText: string | null;
}>;

export type FenceEmblemPricedPreview = Readonly<{
  status: "ready";
  authority: "retail_evidence_preview";
  takeoffSystemKey: typeof CURRENT_TAKEOFF_SYSTEM;
  evidenceVersion: typeof CURRENT_EVIDENCE_VERSION;
  evidenceManifestSha256: string;
  supplierName: "Lowe's";
  storeNumber: "2239";
  storeName: "S. Knoxville Lowe's";
  storePostalCode: "37920";
  storeSourceReference: string;
  observedAt: string;
  currencyCode: "USD";
  lines: readonly FenceEmblemPricedPreviewLine[];
  materialTotalCents: string;
  materialTotalAmount: string;
  taxIncluded: null;
  disclosures: readonly string[];
}>;

export type FenceEmblemPricedPreviewProjection =
  | FenceEmblemPricedPreview
  | Readonly<{
    status: "manual_review";
    issueCode: FenceEmblemPricedPreviewIssueCode;
    issue: string;
  }>;

function blocked(
  issueCode: FenceEmblemPricedPreviewIssueCode,
  issue: string,
): FenceEmblemPricedPreviewProjection {
  return Object.freeze({ status: "manual_review", issueCode, issue });
}

function parseCents(amount: string): bigint | null {
  const match = /^(\d+)\.(\d{2})$/.exec(amount);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt(match[2]);
}

function formatCents(cents: bigint) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function quantitiesFor(takeoff: EmblemManufacturerTakeoff) {
  return new Map<FenceEmblemDemandKey, number>([
    ["emblem_panel_6x8_white", takeoff.panelCount],
    ["emblem_post_line_5x5x108_white", takeoff.linePostCount],
    ["emblem_post_corner_5x5x108_white", takeoff.cornerPostCount],
    ["emblem_post_end_5x5x108_white", takeoff.endPostCount],
    ["vinyl_post_cap_5x5_white_pyramid", takeoff.capCount],
  ]);
}

function validateEvidence(
  envelope: FenceEmblemEvidenceManifestEnvelope,
): ReadonlyMap<FenceEmblemDemandKey, EvidenceRow["evidence"]> | null {
  const { manifest } = envelope;
  if (manifest.version !== CURRENT_EVIDENCE_VERSION
    || manifest.sourceType !== "web_lookup"
    || manifest.scope !== "evidence_only_not_approved_for_publication"
    || manifest.rows.length !== 5) return null;
  if (envelope.manifestSha256 !== CURRENT_EVIDENCE_MANIFEST_SHA256) return null;
  if (manifest.store.supplierName !== "Lowe's"
    || manifest.store.supplierSlug !== "lowes"
    || manifest.store.storeNumber !== "2239"
    || manifest.store.name !== "S. Knoxville Lowe's"
    || manifest.store.postalCode !== "37920") return null;

  const evidenceByDemand = new Map<FenceEmblemDemandKey, EvidenceRow["evidence"]>();
  for (const [index, row] of manifest.rows.entries()) {
    const evidence = row.evidence;
    const expected = EXPECTED_IDENTITIES[evidence.demandKey];
    if (row.sourceRowNumber !== index + 1
      || !expected
      || evidenceByDemand.has(evidence.demandKey)
      || evidence.adapterVersion !== CURRENT_EVIDENCE_VERSION
      || evidence.itemNumber !== expected.itemNumber
      || evidence.manufacturerPartNumber !== expected.modelNumber
      || evidence.priceAmount !== expected.priceAmount
      || evidence.rawRecordSha256 !== expected.rawRecordSha256
      || evidence.currencyCode !== "USD"
      || evidence.sellUnitCode !== "EA"
      || evidence.priceUnitCode !== "EA"
      || evidence.packageQuantity !== "1"
      || evidence.priceType !== "retail"
      || evidence.priceEvidenceSurface !== "localized_public_product_page"
      || evidence.storeNumber !== "2239"
      || evidence.availabilityStatus !== "unknown"
      || evidence.taxIncluded !== null
      || parseCents(evidence.priceAmount) === null
      || !/^2026-08-12T17:53:29Z$/.test(evidence.observedAt)
      || !/^https:\/\/www\.lowes\.com\/pd\//.test(evidence.identitySourceReference)
      || evidence.priceSourceReference !== evidence.identitySourceReference) return null;
    evidenceByDemand.set(evidence.demandKey, evidence);
  }
  return evidenceByDemand.size === 5 ? evidenceByDemand : null;
}

export function projectFenceEmblemRetailPreview(input: Readonly<{
  takeoff: EmblemTakeoffProjection;
  evidence: FenceEmblemEvidenceManifestEnvelope;
}>): FenceEmblemPricedPreviewProjection {
  if (input.takeoff.status !== "ready" || input.takeoff.manufacturerTakeoff === null) {
    return blocked("TAKEOFF_NOT_READY", "A manual-review takeoff cannot receive an automatic price preview.");
  }
  const takeoff = input.takeoff.manufacturerTakeoff;
  if (takeoff.systemKey !== CURRENT_TAKEOFF_SYSTEM
    || takeoff.authority !== CURRENT_TAKEOFF_AUTHORITY) {
    return blocked("UNSUPPORTED_TAKEOFF_SCHEMA", "The takeoff does not use the current Emblem working schema.");
  }
  if (input.evidence.manifest.version !== CURRENT_EVIDENCE_VERSION) {
    return blocked("EVIDENCE_SCHEMA_NOT_CURRENT", "The Lowe's evidence does not use the current bounded schema.");
  }
  const evidenceByDemand = validateEvidence(input.evidence);
  if (!evidenceByDemand) {
    return blocked("EVIDENCE_INTEGRITY_ERROR", "The Lowe's evidence is missing, duplicated, or differs from the accepted manifest.");
  }

  const quantities = quantitiesFor(takeoff);
  if ([...quantities.values()].some((quantity) =>
    !Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_SUPPORTED_QUANTITY)) {
    return blocked("UNSUPPORTED_QUANTITY", "At least one takeoff quantity is outside the supported whole-item range.");
  }

  let totalCents = 0n;
  const lines: FenceEmblemPricedPreviewLine[] = [];
  for (const demandKey of Object.keys(EXPECTED_IDENTITIES) as FenceEmblemDemandKey[]) {
    const quantity = quantities.get(demandKey);
    const evidence = evidenceByDemand.get(demandKey);
    if (quantity === undefined || !evidence) {
      return blocked("EVIDENCE_INTEGRITY_ERROR", "A takeoff demand does not have accepted Lowe's evidence.");
    }
    if (quantity === 0) continue;
    const unitPriceCents = parseCents(evidence.priceAmount);
    if (unitPriceCents === null) {
      return blocked("EVIDENCE_INTEGRITY_ERROR", "A Lowe's retail price is not an exact two-decimal amount.");
    }
    const subtotalCents = unitPriceCents * BigInt(quantity);
    totalCents += subtotalCents;
    lines.push(Object.freeze({
      demandKey,
      quantity,
      itemNumber: evidence.itemNumber,
      modelNumber: evidence.manufacturerPartNumber,
      description: evidence.supplierDescription,
      unitPriceCents: unitPriceCents.toString(),
      unitPriceAmount: evidence.priceAmount,
      subtotalCents: subtotalCents.toString(),
      subtotalAmount: formatCents(subtotalCents),
      currencyCode: "USD",
      priceType: "retail",
      priceSourceReference: evidence.priceSourceReference,
      identitySourceReference: evidence.identitySourceReference,
      availabilityStatus: "unknown",
      availabilityDisplayText: evidence.availabilityDisplayText,
    }));
  }

  const observedAt = input.evidence.manifest.rows[0]?.evidence.observedAt;
  if (!observedAt || input.evidence.manifest.rows.some((row) => row.evidence.observedAt !== observedAt)) {
    return blocked("EVIDENCE_INTEGRITY_ERROR", "The evidence observation timestamp is incomplete or inconsistent.");
  }

  return Object.freeze({
    status: "ready",
    authority: "retail_evidence_preview",
    takeoffSystemKey: CURRENT_TAKEOFF_SYSTEM,
    evidenceVersion: CURRENT_EVIDENCE_VERSION,
    evidenceManifestSha256: input.evidence.manifestSha256,
    supplierName: "Lowe's",
    storeNumber: "2239",
    storeName: "S. Knoxville Lowe's",
    storePostalCode: "37920",
    storeSourceReference: input.evidence.manifest.store.sourceReference,
    observedAt,
    currencyCode: "USD",
    lines: Object.freeze(lines),
    materialTotalCents: totalCents.toString(),
    materialTotalAmount: formatCents(totalCents),
    taxIncluded: null,
    disclosures: Object.freeze([
      "Public retail evidence only; this is not a supplier quote or an issued estimate.",
      "Tax is excluded and remains unknown.",
      "Availability is not guaranteed; any captured availability text is display-only evidence, not inventory quantity.",
      "This read-only projection does not mutate the estimate or publish catalog prices.",
    ]),
  });
}
