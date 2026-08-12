import { randomUUID } from "node:crypto";

import type { MutationState, CanonicalEstimateItem } from "./estimate-mutations";
import { buildFenceEstimateApplicationPlan, FENCE_ESTIMATE_APPLICATION_VERSION } from "./fence-estimate-application";
import { buildFenceEmblemLowesEvidenceManifest } from "./fence-emblem-lowes-evidence";
import { projectFenceEmblemRetailPreview } from "./fence-emblem-priced-preview";
import { projectEmblemManufacturerTakeoff } from "./fence-emblem-takeoff";

export const FENCE_MATERIAL_APPLICATION_FIELDS = new Set([
  "applicationId",
  "idempotencyKey",
  "expectedFenceRevision",
  "expectedCalculationRevision",
  "applicationVersion",
  "previewBinding",
]);

type StoredFenceDraft = Readonly<{
  revision: number;
  runLengthsInches: readonly number[];
  needsGate: boolean;
  contextAnswers: Readonly<Record<string, unknown>>;
}>;

function requiredAnswer(value: unknown, name: string) {
  if (typeof value !== "string" || !value) throw new TypeError(`The saved Fence ${name} answer is incomplete.`);
  return value;
}

export function buildReviewedFenceMaterialMutation(input: Readonly<{
  draft: StoredFenceDraft;
  state: MutationState;
  expectedFenceRevision: number;
  previewBinding: string;
  uuid?: () => string;
}>) {
  if (input.draft.revision !== input.expectedFenceRevision) {
    throw new TypeError("The saved Fence revision no longer matches the reviewed preview.");
  }
  const takeoff = projectEmblemManufacturerTakeoff({
    runLengthsInches: input.draft.runLengthsInches.map(String),
    needsGate: input.draft.needsGate,
    answers: {
      system: requiredAnswer(input.draft.contextAnswers.system, "system") as "emblem_6x8_white" | "different_or_unsure",
      measurementBasis: requiredAnswer(input.draft.contextAnswers.measurementBasis, "measurement basis") as "post_centers" | "different_or_unsure",
      terrain: requiredAnswer(input.draft.contextAnswers.terrain, "terrain") as "level" | "sloped_or_unsure",
      ...(input.draft.runLengthsInches.length > 1
        ? { corners: requiredAnswer(input.draft.contextAnswers.corners, "corners") as "exact_90" | "different_or_unsure" }
        : {}),
      frostDepthInches: String(input.draft.contextAnswers.frostDepthInches ?? ""),
      conditions: requiredAnswer(input.draft.contextAnswers.conditions, "conditions") as "none" | "single_gate_4ft" | "single_gate_5ft" | "pool" | "other_unsupported",
    },
  });
  if (takeoff.status !== "ready" || !takeoff.manufacturerTakeoff) {
    throw new TypeError("The saved Fence draft requires manual takeoff review.");
  }
  const pricedPreview = projectFenceEmblemRetailPreview({
    takeoff,
    evidence: buildFenceEmblemLowesEvidenceManifest(),
  });
  if (pricedPreview.status !== "ready") throw new TypeError("The reviewed Lowe's evidence is not ready.");
  const plan = buildFenceEstimateApplicationPlan({
    fenceRevision: input.draft.revision,
    takeoff: takeoff.manufacturerTakeoff,
    pricedPreview,
  });
  if (plan.previewBinding !== input.previewBinding) {
    throw new TypeError("The reviewed Fence preview is stale or has been changed.");
  }

  const uuid = input.uuid ?? randomUUID;
  const sectionId = uuid();
  const firstSortOrder = input.state.items.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
  const newItems: CanonicalEstimateItem[] = plan.lines.map((line, index) => ({
    id: uuid(),
    sectionId,
    itemType: "standard",
    quantity: line.quantity,
    unit: line.unit,
    customerDescription: line.customerDescription,
    internalDescription: line.internalDescription,
    materialUnitCost: line.materialUnitCost,
    laborUnitCost: line.laborUnitCost,
    subcontractorUnitCost: line.subcontractorUnitCost,
    equipmentUnitCost: line.equipmentUnitCost,
    otherDirectUnitCost: line.otherDirectUnitCost,
    materialWastePercent: line.materialWastePercent,
    itemMarkupPercent: line.itemMarkupPercent,
    taxable: line.taxable,
    included: line.included,
    fixedCustomerPrice: line.fixedCustomerPrice,
    sortOrder: firstSortOrder + index,
  }));
  const evidenceSnapshot = Object.freeze({
    version: FENCE_ESTIMATE_APPLICATION_VERSION,
    fenceRevision: plan.fenceRevision,
    previewBinding: plan.previewBinding,
    takeoffAuthority: plan.takeoffAuthority,
    takeoffSystemKey: plan.takeoffSystemKey,
    priceAuthority: plan.priceAuthority,
    evidenceVersion: plan.evidenceVersion,
    evidenceManifestSha256: plan.evidenceManifestSha256,
    supplierName: plan.supplierName,
    storeNumber: plan.storeNumber,
    storeName: plan.storeName,
    storeSourceReference: plan.storeSourceReference,
    observedAt: plan.observedAt,
    materialTotalAmount: plan.materialTotalAmount,
    taxIncluded: plan.taxIncluded,
    disclosures: plan.disclosures,
    lines: Object.freeze(plan.lines.map((line, index) => Object.freeze({
      estimateLineItemId: newItems[index].id,
      demandKey: line.demandKey,
      customerDescription: line.customerDescription,
      internalDescription: line.internalDescription,
      quantity: line.quantity,
      materialUnitCost: line.materialUnitCost,
      itemNumber: line.itemNumber,
      modelNumber: line.modelNumber,
      identitySourceReference: line.identitySourceReference,
      priceSourceReference: line.priceSourceReference,
      availabilityStatus: line.availabilityStatus,
    }))),
  });
  return Object.freeze({ plan, sectionId, newItems: Object.freeze(newItems), evidenceSnapshot });
}
