import {
  buildCustomerPresentation,
  snapshotEstimatePresentation,
  type CustomerPresentation,
  type EstimatePresentationDetail,
  type OhpPresentationMode,
} from "./estimate-presentation";
import type { CanonicalEstimateItem, MutationState } from "./estimate-mutations";
import type { InternalEstimateCalculation } from "./estimate-types";

export type EstimateCustomerDocument = Readonly<{
  estimateId: string;
  title: string;
  description: string | null;
  propertyAddress: string | null;
  validUntil: string | null;
  scopeNotes: string | null;
  exclusions: string | null;
  customerNotes: string | null;
  presentation: CustomerPresentation;
}>;

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, field: string) {
  const parsed = optionalText(value);
  if (!parsed) throw new TypeError(`${field} is required.`);
  return parsed;
}

function detailLevel(value: unknown): EstimatePresentationDetail {
  if (value === "lump_sum" || value === "section_summary" || value === "itemized") return value;
  throw new TypeError("The estimate does not have a supported customer detail level.");
}

function ohpMode(value: unknown, detail: EstimatePresentationDetail): OhpPresentationMode {
  if (detail === "lump_sum") return "distributed";
  if (value === "distributed" || value === "separate_line_item") return value;
  throw new TypeError("The estimate does not have a supported OH&P presentation mode.");
}

function serializeCents(value: bigint | null) {
  return value === null ? null : value.toString();
}

function presentationItems(items: readonly CanonicalEstimateItem[], calculation: InternalEstimateCalculation) {
  const calculatedById = new Map(calculation.items.map((item) => [item.id, item]));
  return items.map((item) => {
    const calculated = calculatedById.get(item.id);
    if (!calculated) throw new TypeError(`The customer calculation is missing item ${item.id}.`);
    return Object.freeze({
      id: item.id,
      sectionId: item.sectionId,
      customerDescription: item.customerDescription,
      quantity: item.quantity,
      unit: item.unit,
      included: item.included,
      customerPriceCents: serializeCents(calculated.customerPriceCents),
    });
  });
}

export function buildEstimateCustomerDocument(
  state: MutationState,
  calculation: InternalEstimateCalculation,
): EstimateCustomerDocument {
  const estimate = state.estimate;
  if (estimate.presentation_version !== "estimate-presentation-v1") {
    throw new TypeError("The estimate does not have a supported customer presentation snapshot.");
  }
  const detail = detailLevel(estimate.presentation_detail_level);
  const lumpSumLabel = requiredText(estimate.presentation_lump_sum_label, "presentation_lump_sum_label");
  const snapshot = snapshotEstimatePresentation({
    id: "estimate-snapshot",
    name: "Estimate snapshot",
    detailLevel: detail,
    lumpSumLabel,
    showQuantities: detail === "itemized",
    showUnitPrices: detail === "itemized",
    showSectionSubtotals: detail !== "lump_sum",
    ohpPresentationMode: ohpMode(estimate.presentation_ohp_mode, detail),
  });
  const presentation = buildCustomerPresentation(
    snapshot,
    state.sections.map((section) => ({ id: String(section.id), name: requiredText(section.name, "section.name") })),
    presentationItems(state.items, calculation),
    {
      customerTotalCents: serializeCents(calculation.customerTotalCents),
      overheadCents: serializeCents(calculation.overheadCents),
      profitMarkupCents: serializeCents(calculation.profitMarkupCents),
      discountCents: serializeCents(calculation.discountCents),
      taxCents: serializeCents(calculation.taxCents),
    },
  );
  if (!presentation) throw new TypeError("The estimate must have complete customer pricing before it can be presented.");
  return Object.freeze({
    estimateId: requiredText(estimate.id, "estimate.id"),
    title: requiredText(estimate.title, "estimate.title"),
    description: optionalText(estimate.description),
    propertyAddress: optionalText(estimate.property_address),
    validUntil: optionalText(estimate.valid_until),
    scopeNotes: optionalText(estimate.scope_notes),
    exclusions: optionalText(estimate.exclusions),
    customerNotes: optionalText(estimate.customer_notes),
    presentation,
  });
}
