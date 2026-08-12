import type { FenceEmblemPricedPreview } from "./fence-emblem-priced-preview";
import type { EmblemManufacturerTakeoff } from "./fence-emblem-takeoff";

export const FENCE_ESTIMATE_APPLICATION_VERSION = "fence-reviewed-material-application-v1";

export type FenceEstimateApplicationLine = Readonly<{
  demandKey: FenceEmblemPricedPreview["lines"][number]["demandKey"];
  itemType: "standard";
  customerDescription: string;
  quantity: string;
  unit: "ea";
  materialUnitCost: string;
  laborUnitCost: "0";
  subcontractorUnitCost: "0";
  equipmentUnitCost: "0";
  otherDirectUnitCost: "0";
  materialWastePercent: "0";
  itemMarkupPercent: "0";
  taxable: false;
  included: true;
  fixedCustomerPrice: null;
  internalDescription: string;
  itemNumber: string;
  modelNumber: string;
  identitySourceReference: string;
  priceSourceReference: string;
  availabilityStatus: "unknown";
}>;

export type FenceEstimateApplicationPlan = Readonly<{
  version: typeof FENCE_ESTIMATE_APPLICATION_VERSION;
  fenceRevision: number;
  previewBinding: string;
  takeoffAuthority: EmblemManufacturerTakeoff["authority"];
  takeoffSystemKey: EmblemManufacturerTakeoff["systemKey"];
  priceAuthority: FenceEmblemPricedPreview["authority"];
  evidenceVersion: string;
  evidenceManifestSha256: string;
  supplierName: string;
  storeNumber: string;
  storeName: string;
  storeSourceReference: string;
  observedAt: string;
  materialTotalAmount: string;
  taxIncluded: null;
  previewOnly: true;
  disclosures: readonly string[];
  lineCount: number;
  lines: readonly FenceEstimateApplicationLine[];
}>;

function encode(value: string | number) {
  return encodeURIComponent(String(value));
}

export function buildFenceEstimateApplicationPlan(input: Readonly<{
  fenceRevision: number;
  takeoff: EmblemManufacturerTakeoff;
  pricedPreview: FenceEmblemPricedPreview;
}>): FenceEstimateApplicationPlan {
  if (!Number.isSafeInteger(input.fenceRevision) || input.fenceRevision < 1) {
    throw new TypeError("A saved positive Fence revision is required before applying materials.");
  }
  if (input.takeoff.systemKey !== input.pricedPreview.takeoffSystemKey) {
    throw new TypeError("The reviewed takeoff and price preview do not describe the same Fence system.");
  }

  const lineFacts = input.pricedPreview.lines.map((line) => [
    line.demandKey,
    line.quantity,
    line.itemNumber,
    line.modelNumber,
    line.unitPriceAmount,
    line.subtotalAmount,
    line.priceSourceReference,
  ].map(encode).join("~"));
  const previewBinding = [
    FENCE_ESTIMATE_APPLICATION_VERSION,
    `fenceRevision=${input.fenceRevision}`,
    `takeoffAuthority=${encode(input.takeoff.authority)}`,
    `system=${encode(input.takeoff.systemKey)}`,
    `evidence=${encode(input.pricedPreview.evidenceVersion)}`,
    `manifest=${encode(input.pricedPreview.evidenceManifestSha256)}`,
    `store=${encode(input.pricedPreview.storeNumber)}`,
    `observedAt=${encode(input.pricedPreview.observedAt)}`,
    `materialTotal=${encode(input.pricedPreview.materialTotalAmount)}`,
    `lines=${lineFacts.join("|")}`,
  ].join(";");

  const lines = input.pricedPreview.lines.map((line) => Object.freeze({
    demandKey: line.demandKey,
    itemType: "standard" as const,
    customerDescription: line.description,
    quantity: String(line.quantity),
    unit: "ea" as const,
    materialUnitCost: line.unitPriceAmount,
    laborUnitCost: "0" as const,
    subcontractorUnitCost: "0" as const,
    equipmentUnitCost: "0" as const,
    otherDirectUnitCost: "0" as const,
    materialWastePercent: "0" as const,
    itemMarkupPercent: "0" as const,
    taxable: false as const,
    included: true as const,
    fixedCustomerPrice: null,
    internalDescription: `Lowe's item ${line.itemNumber} · model ${line.modelNumber}`,
    itemNumber: line.itemNumber,
    modelNumber: line.modelNumber,
    identitySourceReference: line.identitySourceReference,
    priceSourceReference: line.priceSourceReference,
    availabilityStatus: line.availabilityStatus,
  }));

  return Object.freeze({
    version: FENCE_ESTIMATE_APPLICATION_VERSION,
    fenceRevision: input.fenceRevision,
    previewBinding,
    takeoffAuthority: input.takeoff.authority,
    takeoffSystemKey: input.takeoff.systemKey,
    priceAuthority: input.pricedPreview.authority,
    evidenceVersion: input.pricedPreview.evidenceVersion,
    evidenceManifestSha256: input.pricedPreview.evidenceManifestSha256,
    supplierName: input.pricedPreview.supplierName,
    storeNumber: input.pricedPreview.storeNumber,
    storeName: input.pricedPreview.storeName,
    storeSourceReference: input.pricedPreview.storeSourceReference,
    observedAt: input.pricedPreview.observedAt,
    materialTotalAmount: input.pricedPreview.materialTotalAmount,
    taxIncluded: null,
    previewOnly: true,
    disclosures: input.pricedPreview.disclosures,
    lineCount: lines.length,
    lines: Object.freeze(lines),
  });
}
