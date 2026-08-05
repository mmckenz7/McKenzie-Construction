import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateEstimate } from "./estimate-calculations";
import {
  buildEstimateCalculationPersistence,
  centsToPostgresNumeric,
  milliPercentToPostgresNumeric,
  nullablePostgresNumeric,
  postgresNumericToDecimalString,
  projectPersistedEstimate,
  STRUCTURED_ESTIMATE_ITEM_SELECT,
  STRUCTURED_ESTIMATE_SELECT,
} from "./estimate-persistence";
import type {
  EstimateItemInput,
  EstimateProjectionPermissions,
  InternalEstimateCalculation,
  InternalEstimateItemCalculation,
} from "./estimate-types";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SECTION_CREATE_FIELDS = new Set([
  "name", "customerDescription", "internalNotes", "sortOrder", "expectedCalculationRevision",
]);
export const SECTION_PATCH_FIELDS = new Set(SECTION_CREATE_FIELDS);
export const ITEM_FIELDS = new Set([
  "sectionId", "itemType", "quantity", "unit", "customerDescription",
  "internalDescription", "materialUnitCost", "laborUnitCost",
  "subcontractorUnitCost", "equipmentUnitCost", "otherDirectUnitCost",
  "materialWastePercent", "itemMarkupPercent", "taxable", "included",
  "fixedCustomerPrice", "sortOrder", "expectedCalculationRevision",
]);

export type CanonicalEstimateItem = {
  id: string;
  sectionId: string;
  itemType: "standard" | "allowance";
  quantity: string;
  unit: string;
  customerDescription: string;
  internalDescription: string | null;
  materialUnitCost: string | null;
  laborUnitCost: string | null;
  subcontractorUnitCost: string | null;
  equipmentUnitCost: string | null;
  otherDirectUnitCost: string | null;
  materialWastePercent: string;
  itemMarkupPercent: string | null;
  taxable: boolean;
  included: boolean;
  fixedCustomerPrice: string | null;
  sortOrder: number;
};

export type SectionInput = {
  name: string;
  customerDescription: string | null;
  internalNotes: string | null;
  sortOrder: number;
};

export type MutationState = {
  estimate: Record<string, unknown>;
  items: CanonicalEstimateItem[];
  sections: Array<Record<string, unknown>>;
};

export type MutationResultCode =
  | "ok"
  | "not_found"
  | "non_draft"
  | "stale_calculation_revision"
  | "section_not_empty"
  | "invalid_item"
  | "invalid_calculation";

export class MutationStateChangedError extends Error {
  constructor() {
    super("The estimate was updated while its mutation state was being loaded.");
    this.name = "MutationStateChangedError";
  }
}

const UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function exactDecimal(value: unknown, name: string, places: number) {
  if (typeof value !== "string" || !UNSIGNED_DECIMAL.test(value)) {
    throw new TypeError(`${name} must be a nonnegative decimal string.`);
  }
  const fraction = value.split(".")[1] ?? "";
  if (fraction.length > places) throw new RangeError(`${name} supports at most ${places} decimal places.`);
  return value;
}

function nullableDecimal(value: unknown, name: string, places: number) {
  return value === null ? null : exactDecimal(value, name, places);
}

function requiredText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required.`);
  return value.trim();
}

function nullableText(value: unknown, name: string) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError(`${name} must be text or null.`);
  return value.trim() || null;
}

function nonnegativeInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${name} must be a nonnegative integer.`);
  return value as number;
}

export function expectedRevision(value: unknown) {
  return nonnegativeInteger(value, "expectedCalculationRevision");
}

export function assertExactFields(body: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new TypeError("The request contains unsupported fields.");
  }
}

export function parseSectionInput(body: Record<string, unknown>, current?: SectionInput): SectionInput {
  return {
    name: body.name === undefined && current ? current.name : requiredText(body.name, "name"),
    customerDescription: body.customerDescription === undefined && current
      ? current.customerDescription
      : nullableText(body.customerDescription ?? null, "customerDescription"),
    internalNotes: body.internalNotes === undefined && current
      ? current.internalNotes
      : nullableText(body.internalNotes ?? null, "internalNotes"),
    sortOrder: body.sortOrder === undefined && current
      ? current.sortOrder
      : nonnegativeInteger(body.sortOrder, "sortOrder"),
  };
}

export function parseCanonicalItem(
  id: string,
  body: Record<string, unknown>,
  current?: CanonicalEstimateItem,
): CanonicalEstimateItem {
  if (!UUID_PATTERN.test(id)) throw new TypeError("itemId must be a UUID.");
  const value = (key: keyof CanonicalEstimateItem) => body[key] === undefined && current ? current[key] : body[key];
  const sectionId = value("sectionId");
  if (typeof sectionId !== "string" || !UUID_PATTERN.test(sectionId)) throw new TypeError("sectionId must be a UUID.");
  const itemType = value("itemType");
  if (itemType !== "standard" && itemType !== "allowance") throw new TypeError("itemType must be standard or allowance.");
  const taxable = value("taxable");
  const included = value("included");
  if (typeof taxable !== "boolean" || typeof included !== "boolean") throw new TypeError("taxable and included must be booleans.");

  const item: CanonicalEstimateItem = {
    id,
    sectionId,
    itemType,
    quantity: exactDecimal(value("quantity"), "quantity", 4),
    unit: requiredText(value("unit"), "unit"),
    customerDescription: requiredText(value("customerDescription"), "customerDescription"),
    internalDescription: nullableText(value("internalDescription") ?? null, "internalDescription"),
    materialUnitCost: nullableDecimal(value("materialUnitCost") ?? null, "materialUnitCost", 4),
    laborUnitCost: nullableDecimal(value("laborUnitCost") ?? null, "laborUnitCost", 4),
    subcontractorUnitCost: nullableDecimal(value("subcontractorUnitCost") ?? null, "subcontractorUnitCost", 4),
    equipmentUnitCost: nullableDecimal(value("equipmentUnitCost") ?? null, "equipmentUnitCost", 4),
    otherDirectUnitCost: nullableDecimal(value("otherDirectUnitCost") ?? null, "otherDirectUnitCost", 4),
    materialWastePercent: exactDecimal(value("materialWastePercent"), "materialWastePercent", 3),
    itemMarkupPercent: nullableDecimal(value("itemMarkupPercent") ?? null, "itemMarkupPercent", 3),
    taxable,
    included,
    fixedCustomerPrice: nullableDecimal(value("fixedCustomerPrice") ?? null, "fixedCustomerPrice", 2),
    sortOrder: nonnegativeInteger(value("sortOrder"), "sortOrder"),
  };
  if (itemType === "standard" && (item.fixedCustomerPrice !== null || item.itemMarkupPercent === null)) {
    throw new TypeError("Standard items require itemMarkupPercent and cannot have fixedCustomerPrice.");
  }
  if (itemType === "allowance" && (item.fixedCustomerPrice === null || item.itemMarkupPercent !== null)) {
    throw new TypeError("Allowance items require fixedCustomerPrice and cannot have itemMarkupPercent.");
  }
  calculateEstimate({ items: [canonicalToCalculationInput(item)], overheadPercent: "0", profitMarkupPercent: "0", taxPercent: "0", discountAmount: "0" });
  return item;
}

export function storedRecordToCanonicalItem(record: Record<string, unknown>): CanonicalEstimateItem {
  return {
    id: String(record.id),
    sectionId: String(record.section_id),
    itemType: record.item_type as "standard" | "allowance",
    quantity: postgresNumericToDecimalString(record.quantity_text, "quantity"),
    unit: String(record.unit),
    customerDescription: String(record.customer_description),
    internalDescription: typeof record.internal_description === "string" ? record.internal_description : null,
    materialUnitCost: nullablePostgresNumeric(record.material_unit_cost_text, "materialUnitCost"),
    laborUnitCost: nullablePostgresNumeric(record.labor_unit_cost_text, "laborUnitCost"),
    subcontractorUnitCost: nullablePostgresNumeric(record.subcontractor_unit_cost_text, "subcontractorUnitCost"),
    equipmentUnitCost: nullablePostgresNumeric(record.equipment_unit_cost_text, "equipmentUnitCost"),
    otherDirectUnitCost: nullablePostgresNumeric(record.other_direct_unit_cost_text, "otherDirectUnitCost"),
    materialWastePercent: postgresNumericToDecimalString(record.material_waste_percent_text, "materialWastePercent"),
    itemMarkupPercent: nullablePostgresNumeric(record.item_markup_percent_text, "itemMarkupPercent"),
    taxable: record.taxable === true,
    included: record.is_included === true,
    fixedCustomerPrice: nullablePostgresNumeric(record.fixed_customer_price_text, "fixedCustomerPrice"),
    sortOrder: Number(record.sort_order),
  };
}

export function canonicalToCalculationInput(item: CanonicalEstimateItem): EstimateItemInput {
  const base = {
    id: item.id,
    customerDescription: item.customerDescription,
    quantity: item.quantity,
    unit: item.unit,
    wastePercent: item.materialWastePercent,
    taxable: item.taxable,
    included: item.included,
    costs: {
      materialUnitCost: item.materialUnitCost,
      laborUnitCost: item.laborUnitCost,
      subcontractorUnitCost: item.subcontractorUnitCost,
      equipmentUnitCost: item.equipmentUnitCost,
      otherDirectUnitCost: item.otherDirectUnitCost,
    },
  };
  return item.itemType === "standard"
    ? { ...base, kind: "standard", itemMarkupPercent: item.itemMarkupPercent! }
    : { ...base, kind: "allowance", fixedCustomerPrice: item.fixedCustomerPrice! };
}

function divideRoundedHalfAwayFromZero(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new RangeError("The rounding denominator must be positive.");
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const rounded = magnitude % denominator * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function scaledDecimal(value: bigint, scale: bigint, places: number) {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? "-" : ""}${magnitude / scale}.${(magnitude % scale).toString().padStart(places, "0")}`;
}

function decimalUnits(value: string, places: number) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(places) + BigInt((fraction + "0".repeat(places)).slice(0, places));
}

export function buildItemCalculationBundle(
  items: readonly CanonicalEstimateItem[],
  calculation: InternalEstimateCalculation,
) {
  const byId = new Map(calculation.items.map((item) => [item.id, item]));
  return items.map((item) => {
    const calculated = byId.get(item.id);
    if (!calculated) throw new TypeError(`Missing calculation for ${item.id}.`);
    return buildItemBundleEntry(item, calculated);
  });
}

export function verifyCalculationBundleCorrespondence(
  items: readonly CanonicalEstimateItem[],
  bundle: readonly Record<string, unknown>[],
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  if (itemById.size !== items.length || bundle.length !== items.length) {
    throw new TypeError("The calculation bundle does not contain the complete item set.");
  }
  const seen = new Set<string>();
  for (const entry of bundle) {
    const id = typeof entry.id === "string" ? entry.id : "";
    const item = itemById.get(id);
    if (!item || seen.has(id)) throw new TypeError("The calculation bundle contains an unknown or duplicate item ID.");
    seen.add(id);
    const canonical = canonicalItemRpcValue(item);
    for (const [key, value] of Object.entries(canonical)) {
      if (entry[key] !== value) throw new TypeError(`The calculation bundle does not match ${id}.${key}.`);
    }
  }
  if (seen.size !== items.length) throw new TypeError("The calculation bundle is missing an item ID.");
}

function buildItemBundleEntry(item: CanonicalEstimateItem, calculated: InternalEstimateItemCalculation) {
  const costs = [item.materialUnitCost, item.laborUnitCost, item.subcontractorUnitCost, item.equipmentUnitCost, item.otherDirectUnitCost];
  const costsComplete = costs.every((cost) => cost !== null);
  const baseUnitCost = costsComplete
    ? scaledDecimal(costs.reduce((sum, cost) => sum + decimalUnits(cost!, 4), 0n), 10_000n, 4)
    : "0.0000";
  const quantityUnits = decimalUnits(item.quantity, 4);
  const unitPrice = calculated.customerPriceCents === null || quantityUnits === 0n
    ? "0.0000"
    : scaledDecimal(divideRoundedHalfAwayFromZero(calculated.customerPriceCents * 1_000_000n, quantityUnits), 10_000n, 4);
  const profit = calculated.customerPriceCents === null || calculated.directCostCents === null
    ? null
    : calculated.customerPriceCents - calculated.directCostCents;
  const margin = profit === null || calculated.customerPriceCents === null || calculated.customerPriceCents === 0n
    ? null
    : divideRoundedHalfAwayFromZero(profit * 100_000n, calculated.customerPriceCents);
  return {
    id: item.id,
    section_id: item.sectionId,
    item_type: item.itemType,
    quantity: item.quantity,
    unit: item.unit,
    customer_description: item.customerDescription,
    internal_description: item.internalDescription,
    material_unit_cost: item.materialUnitCost,
    labor_unit_cost: item.laborUnitCost,
    subcontractor_unit_cost: item.subcontractorUnitCost,
    equipment_unit_cost: item.equipmentUnitCost,
    other_direct_unit_cost: item.otherDirectUnitCost,
    material_waste_percent: item.materialWastePercent,
    item_markup_percent: item.itemMarkupPercent,
    taxable: item.taxable,
    is_included: item.included,
    fixed_customer_price: item.fixedCustomerPrice,
    sort_order: item.sortOrder,
    costs_complete: calculated.costsComplete,
    prices_complete: calculated.customerPriceCents !== null,
    material_cost_amount: centsToPostgresNumeric(calculated.componentCosts.materialCostCents),
    labor_cost_amount: centsToPostgresNumeric(calculated.componentCosts.laborCostCents),
    subcontractor_cost_amount: centsToPostgresNumeric(calculated.componentCosts.subcontractorCostCents),
    equipment_cost_amount: centsToPostgresNumeric(calculated.componentCosts.equipmentCostCents),
    other_direct_cost_amount: centsToPostgresNumeric(calculated.componentCosts.otherDirectCostCents),
    item_markup_amount: centsToPostgresNumeric(calculated.itemMarkupCents),
    line_type: item.itemType === "standard" ? "other" : "allowance",
    category: "structured",
    description: item.customerDescription,
    base_unit_cost: baseUnitCost,
    waste_percent: item.materialWastePercent,
    pricing_method: item.itemType === "standard" ? "markup" : "fixed_price",
    markup_percent: item.itemType === "standard" ? item.itemMarkupPercent : null,
    target_margin_percent: null,
    fixed_price: item.itemType === "allowance" ? item.fixedCustomerPrice : null,
    adjusted_quantity: scaledDecimal(calculated.adjustedMaterialQuantityUnits, 10_000n, 4),
    estimated_cost: centsToPostgresNumeric(calculated.directCostCents) ?? "0.00",
    unit_price: unitPrice,
    total_price: centsToPostgresNumeric(calculated.customerPriceCents) ?? "0.00",
    estimated_profit: centsToPostgresNumeric(profit) ?? "0.00",
    estimated_margin: milliPercentToPostgresNumeric(margin),
    is_optional: false,
    notes: item.internalDescription,
    estimate_option_id: null,
    material_catalog_id: null,
    labor_catalog_id: null,
    metadata: {},
  };
}

export function calculateMutation(
  estimate: Record<string, unknown>,
  items: readonly CanonicalEstimateItem[],
) {
  const calculation = calculateEstimate({
    items: items.map(canonicalToCalculationInput),
    overheadPercent: postgresNumericToDecimalString(estimate.overhead_percent_text, "overheadPercent"),
    profitMarkupPercent: postgresNumericToDecimalString(estimate.profit_markup_percent_text, "profitMarkupPercent"),
    taxPercent: postgresNumericToDecimalString(estimate.tax_rate_percent_text, "taxRatePercent"),
    discountAmount: postgresNumericToDecimalString(estimate.discount_value_text, "discountAmount"),
  });
  const itemCalculations = buildItemCalculationBundle(items, calculation);
  verifyCalculationBundleCorrespondence(items, itemCalculations);
  return {
    calculation,
    itemCalculations,
    estimateCalculation: buildEstimateCalculationPersistence(calculation),
  };
}

export function canonicalItemRpcValue(item: CanonicalEstimateItem) {
  return {
    id: item.id, section_id: item.sectionId, item_type: item.itemType,
    quantity: item.quantity, unit: item.unit, customer_description: item.customerDescription,
    internal_description: item.internalDescription, material_unit_cost: item.materialUnitCost,
    labor_unit_cost: item.laborUnitCost, subcontractor_unit_cost: item.subcontractorUnitCost,
    equipment_unit_cost: item.equipmentUnitCost, other_direct_unit_cost: item.otherDirectUnitCost,
    material_waste_percent: item.materialWastePercent, item_markup_percent: item.itemMarkupPercent,
    taxable: item.taxable, is_included: item.included, fixed_customer_price: item.fixedCustomerPrice,
    sort_order: item.sortOrder,
  };
}

export async function loadMutationState(supabase: SupabaseClient, estimateId: string): Promise<MutationState | null> {
  const estimate = await supabase.from("estimates").select(STRUCTURED_ESTIMATE_SELECT).eq("id", estimateId).maybeSingle();
  if (estimate.error) throw new Error("Estimate mutation state could not be loaded.");
  if (!estimate.data || estimate.data.calculation_policy_version !== "structured-estimate-v1") return null;
  const [items, sections] = await Promise.all([
    supabase.from("estimate_line_items").select(STRUCTURED_ESTIMATE_ITEM_SELECT).eq("estimate_id", estimateId).order("sort_order").order("id"),
    supabase.from("estimate_sections").select("id, name, customer_description, internal_notes, sort_order").eq("estimate_id", estimateId).order("sort_order").order("id"),
  ]);
  if (items.error || sections.error) throw new Error("Estimate mutation state could not be loaded.");
  const fence = await supabase.from("estimates")
    .select("status, calculation_policy_version, calculation_revision")
    .eq("id", estimateId).maybeSingle();
  if (fence.error) throw new Error("Estimate mutation state could not be loaded.");
  if (!fence.data || fence.data.calculation_policy_version !== "structured-estimate-v1") return null;
  if (fence.data.status !== estimate.data.status
    || fence.data.calculation_policy_version !== estimate.data.calculation_policy_version
    || fence.data.calculation_revision !== estimate.data.calculation_revision) {
    throw new MutationStateChangedError();
  }
  return {
    estimate: estimate.data,
    items: (items.data ?? []).map((item) => storedRecordToCanonicalItem(item)),
    sections: sections.data ?? [],
  };
}

export function projectMutationState(
  state: MutationState,
  calculation: InternalEstimateCalculation,
  permissions: EstimateProjectionPermissions,
  nextRevision: number,
) {
  const estimateRecord = { ...state.estimate, calculation_revision: nextRevision };
  const estimate = projectPersistedEstimate(estimateRecord, calculation, permissions);
  const projectedById = new Map(estimate.calculation.items.map((item) => [item.id, item]));
  return {
    estimate,
    sections: [...state.sections].sort((left, right) =>
      Number(left.sort_order) - Number(right.sort_order) || String(left.id).localeCompare(String(right.id))
    ).map((section) => ({
      id: section.id,
      name: section.name,
      customerDescription: section.customer_description ?? null,
      internalNotes: section.internal_notes ?? null,
      sortOrder: section.sort_order,
    })),
    items: [...state.items].sort((left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    ).map((item) => ({
      ...projectedById.get(item.id),
      sectionId: item.sectionId,
      internalDescription: item.internalDescription,
      sortOrder: item.sortOrder,
    })),
  };
}

export function rpcResult(data: unknown): { result_code: MutationResultCode; next_calculation_revision: number; resource_id: string } {
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object") throw new Error("Estimate mutation returned an invalid result.");
  const record = row as Record<string, unknown>;
  return {
    result_code: record.result_code as MutationResultCode,
    next_calculation_revision: Number(record.next_calculation_revision),
    resource_id: String(record.resource_id ?? ""),
  };
}
