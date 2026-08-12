export type EstimateBuilderCapabilities = {
  canEditPrices: boolean;
  canViewCosts: boolean;
  canViewProfit: boolean;
};

export type EstimateBuilderSection = {
  id: string;
  name: string;
  customerDescription: string | null;
  internalNotes: string | null;
  sortOrder: number;
};

export type EstimateBuilderItem = {
  id: string;
  sectionId: string;
  itemType: "standard" | "allowance";
  customerDescription: string;
  internalDescription: string | null;
  quantity: string;
  unit: string;
  taxable: boolean;
  included: boolean;
  sortOrder: number;
  customerPriceCents: string | null;
  materialUnitCost?: string | null;
  laborUnitCost?: string | null;
  subcontractorUnitCost?: string | null;
  equipmentUnitCost?: string | null;
  otherDirectUnitCost?: string | null;
  materialWastePercent?: string;
  itemMarkupPercent?: string | null;
  fixedCustomerPrice?: string;
  directCostCents?: string | null;
  itemMarkupCents?: string | null;
};

export const ESTIMATE_COST_CATEGORIES = Object.freeze([
  "material",
  "labor",
  "subcontractor",
  "equipment",
  "other",
] as const);

export type EstimateCostCategory = typeof ESTIMATE_COST_CATEGORIES[number];

export const COST_FIELD_BY_CATEGORY: Record<EstimateCostCategory, keyof Pick<EstimateBuilderItem,
  "materialUnitCost" | "laborUnitCost" | "subcontractorUnitCost" | "equipmentUnitCost" | "otherDirectUnitCost"
>> = {
  material: "materialUnitCost",
  labor: "laborUnitCost",
  subcontractor: "subcontractorUnitCost",
  equipment: "equipmentUnitCost",
  other: "otherDirectUnitCost",
};

export function estimateItemCostEntries(item?: EstimateBuilderItem) {
  if (!item || item.itemType !== "standard") return [];
  return ESTIMATE_COST_CATEGORIES.flatMap((category) => {
    const unitCost = item[COST_FIELD_BY_CATEGORY[category]];
    return typeof unitCost === "string" && !/^0(?:\.0+)?$/.test(unitCost)
      ? [{ category, unitCost }]
      : [];
  });
}

export function estimateItemPrimaryCostEntry(item?: EstimateBuilderItem) {
  const entries = estimateItemCostEntries(item);
  if (entries.length === 0) return { category: "material" as const, unitCost: "0" };
  if (entries.length === 1) return entries[0];
  return { category: "mixed" as const, unitCost: "" };
}

export type EstimateBuilderState = {
  calculationRevision: number;
  capabilities: EstimateBuilderCapabilities;
  estimate: {
    id: string;
    title: unknown;
    status: unknown;
    calculationPolicyVersion: "structured-estimate-v1" | "structured-estimate-v2-material-tax";
    calculationRevision: unknown;
    calculation: Record<string, unknown> & { customerTotalCents?: string | null };
    internalNotes: string | null;
    presentation: {
      schemaAvailable: boolean;
      version: "estimate-presentation-v1";
      detailLevel: "lump_sum" | "section_summary" | "itemized";
      ohpPresentationMode: "distributed" | "separate_line_item";
      lumpSumLabel: string;
    };
    [key: string]: unknown;
  };
  sections: readonly EstimateBuilderSection[];
  items: readonly EstimateBuilderItem[];
};

export type EstimateBuilderEnvelope = EstimateBuilderState & {
  success: true;
  nextCalculationRevision?: number;
};

export type BuilderMutationOutcome =
  | "success"
  | "stale_recovered"
  | "committed_recovered"
  | "ambiguous_recovered"
  | "stale_reload_failed"
  | "committed_reload_failed"
  | "ambiguous_reload_failed"
  | "blocked";

export type BuilderReloadRequirement = Readonly<{
  minimumAcceptableRevision: number;
  reason: "stale" | "committed" | "ambiguous";
  mutationCommitted: boolean;
  notice: string;
}>;

export type BuilderFetch = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

export const DECIMAL_PATTERNS = Object.freeze({
  quantity: /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
  unitCost: /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
  percent: /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/,
  money: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
});

export function nullableDecimalInput(value: string, pattern: RegExp, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!pattern.test(trimmed)) throw new TypeError(`${label} is not a valid nonnegative decimal.`);
  return trimmed;
}

export function requiredDecimalInput(value: string, pattern: RegExp, label: string) {
  const parsed = nullableDecimalInput(value, pattern, label);
  if (parsed === null) throw new TypeError(`${label} is required.`);
  return parsed;
}

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const INTEGER = /^-?\d+$/;
const nullableInteger = (value: unknown) => value === null || typeof value === "string" && INTEGER.test(value);
const optionalInteger = (record: Record<string, unknown>, key: string) => !(key in record) || nullableInteger(record[key]);
const optionalDecimal = (record: Record<string, unknown>, key: string, nullable: boolean) =>
  !(key in record) || typeof record[key] === "string" && DECIMAL.test(record[key]) || nullable && record[key] === null;

function isSection(value: unknown): value is EstimateBuilderSection {
  if (!value || typeof value !== "object") return false;
  const section = value as Record<string, unknown>;
  return typeof section.id === "string" && !!section.id
    && typeof section.name === "string"
    && (section.customerDescription === null || typeof section.customerDescription === "string")
    && (section.internalNotes === null || typeof section.internalNotes === "string")
    && Number.isSafeInteger(section.sortOrder) && (section.sortOrder as number) >= 0;
}

function isItem(value: unknown): value is EstimateBuilderItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || typeof item.sectionId !== "string" || !item.sectionId
    || (item.itemType !== "standard" && item.itemType !== "allowance")
    || typeof item.customerDescription !== "string"
    || !(item.internalDescription === null || typeof item.internalDescription === "string")
    || typeof item.quantity !== "string" || !DECIMAL.test(item.quantity)
    || typeof item.unit !== "string" || typeof item.taxable !== "boolean" || typeof item.included !== "boolean"
    || !Number.isSafeInteger(item.sortOrder) || (item.sortOrder as number) < 0
    || !nullableInteger(item.customerPriceCents)) return false;
  for (const key of ["materialUnitCost", "laborUnitCost", "subcontractorUnitCost", "equipmentUnitCost", "otherDirectUnitCost"]) {
    if (!optionalDecimal(item, key, true)) return false;
  }
  if (!optionalDecimal(item, "materialWastePercent", false)
    || !optionalDecimal(item, "itemMarkupPercent", false)
    || !optionalInteger(item, "directCostCents") || !optionalInteger(item, "itemMarkupCents")) return false;
  if (item.itemType === "standard") return !("fixedCustomerPrice" in item);
  return typeof item.fixedCustomerPrice === "string" && DECIMAL.test(item.fixedCustomerPrice)
    && !("itemMarkupPercent" in item);
}

export function isBuilderEnvelope(value: unknown): value is EstimateBuilderEnvelope {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.success !== true || !Number.isSafeInteger(record.calculationRevision)
    || (record.calculationRevision as number) < 0
    || !record.capabilities || typeof record.capabilities !== "object"
    || !record.estimate || typeof record.estimate !== "object"
    || !Array.isArray(record.sections) || !Array.isArray(record.items)) return false;
  const capabilities = record.capabilities as Record<string, unknown>;
  if (typeof capabilities.canEditPrices !== "boolean" || typeof capabilities.canViewCosts !== "boolean"
    || typeof capabilities.canViewProfit !== "boolean") return false;
  const estimate = record.estimate as Record<string, unknown>;
  if (typeof estimate.id !== "string" || !estimate.id || typeof estimate.status !== "string" || !estimate.status
    || !(estimate.internalNotes === null || typeof estimate.internalNotes === "string")
    || !["structured-estimate-v1", "structured-estimate-v2-material-tax"].includes(String(estimate.calculationPolicyVersion))
    || estimate.calculationRevision !== record.calculationRevision
    || !estimate.calculation || typeof estimate.calculation !== "object" || Array.isArray(estimate.calculation)
    || !estimate.presentation || typeof estimate.presentation !== "object" || Array.isArray(estimate.presentation)) return false;
  const presentation = estimate.presentation as Record<string, unknown>;
  if (typeof presentation.schemaAvailable !== "boolean"
    || presentation.version !== "estimate-presentation-v1"
    || !["lump_sum", "section_summary", "itemized"].includes(String(presentation.detailLevel))
    || !["distributed", "separate_line_item"].includes(String(presentation.ohpPresentationMode))
    || typeof presentation.lumpSumLabel !== "string" || !presentation.lumpSumLabel.trim()) return false;
  if (record.nextCalculationRevision !== undefined && record.nextCalculationRevision !== record.calculationRevision) return false;
  const calculation = estimate.calculation as Record<string, unknown>;
  if (calculation.policyVersion !== estimate.calculationPolicyVersion || !Array.isArray(calculation.items)) return false;
  for (const key of ["itemPriceSubtotalCents", "preDiscountCustomerSubtotalCents", "discountCents", "postDiscountSubtotalCents", "taxableSubtotalCents", "taxCents", "customerTotalCents"]) {
    if (!nullableInteger(calculation[key])) return false;
  }
  for (const key of ["directCostCents", "grossProfitCents"]) {
    if (!optionalInteger(calculation, key)) return false;
  }
  if (!(calculation.grossMarginPercent === undefined || calculation.grossMarginPercent === null
    || typeof calculation.grossMarginPercent === "string" && SIGNED_DECIMAL.test(calculation.grossMarginPercent))) return false;
  if (!record.sections.every(isSection) || !record.items.every(isItem)) return false;
  const sectionIds = new Set<string>();
  for (const section of record.sections as EstimateBuilderSection[]) {
    if (sectionIds.has(section.id)) return false;
    sectionIds.add(section.id);
  }
  const itemIds = new Set<string>();
  for (const item of record.items as EstimateBuilderItem[]) {
    if (itemIds.has(item.id) || !sectionIds.has(item.sectionId)) return false;
    itemIds.add(item.id);
  }
  return true;
}

async function readJson(response: Pick<Response, "json">) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function loadEstimateBuilder(fetcher: BuilderFetch, estimateId: string) {
  const response = await fetcher(`/api/estimates/${estimateId}`, { cache: "no-store" });
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "Unable to load the estimate builder.");
  }
  if (!isBuilderEnvelope(result)) throw new Error("The estimate data could not be loaded. Please try again.");
  return result;
}

export type BuilderMutation = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body: Record<string, unknown>;
};

export type BuilderMutationResult = {
  state: EstimateBuilderEnvelope;
  notice: string | null;
  recoveryFailed: boolean;
  committed: boolean;
  outcome: BuilderMutationOutcome;
  reloadRequirement: BuilderReloadRequirement | null;
  closeSubmittedForm: boolean;
};

export function satisfiesRevisionRequirement(
  state: Pick<EstimateBuilderEnvelope, "calculationRevision">,
  requirement: Pick<BuilderReloadRequirement, "minimumAcceptableRevision">,
) {
  return Number.isSafeInteger(requirement.minimumAcceptableRevision)
    && requirement.minimumAcceptableRevision >= 0
    && state.calculationRevision >= requirement.minimumAcceptableRevision;
}

export function canMutateEstimate(state: EstimateBuilderEnvelope, reloadRequirement: BuilderReloadRequirement | null) {
  return state.capabilities.canEditPrices && state.estimate.status === "draft" && reloadRequirement === null;
}

export type EstimateItemDraft = {
  itemType: "standard" | "allowance";
  sectionId: string;
  customerDescription: string;
  internalDescription: string;
  quantity: string;
  unit: string;
  costCategory: EstimateCostCategory | "mixed";
  unitCost: string;
  fixedCustomerPrice: string;
  taxable: boolean;
  included: boolean;
  sortOrder: string;
};

export function nonnegativeSortOrder(value: string) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new TypeError("Sort order must be a nonnegative whole number.");
  }
  return Number(value);
}

export function buildItemMutationBody(draft: EstimateItemDraft, creating: boolean) {
  if (!draft.customerDescription.trim() || !draft.unit.trim()) {
    throw new TypeError("Customer description and unit are required.");
  }
  const body: Record<string, unknown> = {
    sectionId: draft.sectionId,
    itemType: draft.itemType,
    customerDescription: draft.customerDescription.trim(),
    internalDescription: draft.internalDescription.trim() || null,
    quantity: requiredDecimalInput(draft.quantity, DECIMAL_PATTERNS.quantity, "Quantity"),
    unit: draft.unit.trim(),
    taxable: draft.taxable,
    included: draft.included,
    sortOrder: nonnegativeSortOrder(draft.sortOrder),
  };
  if (draft.itemType === "allowance") {
    body.fixedCustomerPrice = requiredDecimalInput(draft.fixedCustomerPrice, DECIMAL_PATTERNS.money, "Allowance price");
    if (creating) body.materialWastePercent = "0";
    return body;
  }
  if (draft.costCategory === "mixed") throw new TypeError("Split this older mixed-cost row into separate category lines before saving.");
  const unitCost = requiredDecimalInput(draft.unitCost, DECIMAL_PATTERNS.unitCost, "Unit cost");
  for (const category of ESTIMATE_COST_CATEGORIES) body[COST_FIELD_BY_CATEGORY[category]] = category === draft.costCategory ? unitCost : "0";
  body.materialWastePercent = "0";
  body.itemMarkupPercent = "0";
  return body;
}

export async function runEstimateBuilderMutation(
  fetcher: BuilderFetch,
  estimateId: string,
  current: EstimateBuilderEnvelope,
  mutation: BuilderMutation,
  reloadRequirement: BuilderReloadRequirement | null = null,
): Promise<BuilderMutationResult> {
  if (!canMutateEstimate(current, reloadRequirement)) {
    return {
      state: current, notice: "Editing is unavailable until the estimate is an editable draft and current state is loaded.",
      recoveryFailed: reloadRequirement !== null, committed: false, outcome: "blocked",
      reloadRequirement, closeSubmittedForm: false,
    };
  }
  const submittedRevision = current.calculationRevision;
  const response = await fetcher(mutation.path, {
    method: mutation.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...mutation.body, expectedCalculationRevision: submittedRevision }),
  });
  const result = await readJson(response);
  if (response.ok && isBuilderEnvelope(result) && result.calculationRevision > submittedRevision) {
    return { state: result, notice: null, recoveryFailed: false, committed: true, outcome: "success", reloadRequirement: null, closeSubmittedForm: true };
  }

  const responseRecord = result as Record<string, unknown>;
  const code = typeof responseRecord.code === "string" ? responseRecord.code : typeof responseRecord.error === "string" ? responseRecord.error : "";
  const reportedCommittedRevision = responseRecord.calculationRevision;
  const committed = code === "mutation_committed_state_reload_required"
    && responseRecord.mutationCommitted === true
    && responseRecord.reloadRequired === true
    && Number.isSafeInteger(reportedCommittedRevision)
    && (reportedCommittedRevision as number) > submittedRevision
    && (responseRecord.nextCalculationRevision === undefined || responseRecord.nextCalculationRevision === reportedCommittedRevision);
  const ambiguous = response.ok;
  const potentiallyCommitted = code === "mutation_committed_state_reload_required" || responseRecord.mutationCommitted === true;
  if (code === "stale_calculation_revision" || committed || potentiallyCommitted || ambiguous) {
    const reason: BuilderReloadRequirement["reason"] = committed ? "committed" : code === "stale_calculation_revision" ? "stale" : "ambiguous";
    const minimumAcceptableRevision = committed ? reportedCommittedRevision as number : submittedRevision + 1;
    const requirement: BuilderReloadRequirement = {
      minimumAcceptableRevision,
      reason,
      mutationCommitted: committed || ambiguous || potentiallyCommitted,
      notice: reason === "committed"
        ? "Your edit was saved, but the latest estimate state has not yet been loaded. Editing remains disabled until reload succeeds."
        : reason === "ambiguous"
        ? "The operation may have saved, but a newer estimate state has not yet been loaded. Editing remains disabled until reload succeeds."
        : "The estimate changed before your edit was saved, but a newer estimate state has not yet been loaded. Editing remains disabled until reload succeeds.",
    };
    try {
      const state = await loadEstimateBuilder(fetcher, estimateId);
      if (!satisfiesRevisionRequirement(state, requirement)) throw new Error("The authoritative estimate revision is too old.");
      return {
        state,
        notice: reason === "ambiguous"
          ? "The server response required a refresh. The latest estimate state was loaded; review it before making another change."
          : reason === "committed"
          ? "Your edit was saved. The estimate display was refreshed to show the latest state."
          : "The estimate changed before your edit was saved. Review the latest state before trying again.",
        recoveryFailed: false,
        committed: requirement.mutationCommitted,
        outcome: reason === "ambiguous" ? "ambiguous_recovered" : reason === "committed" ? "committed_recovered" : "stale_recovered",
        reloadRequirement: null,
        closeSubmittedForm: reason !== "stale",
      };
    } catch {
      return {
        state: current,
        notice: requirement.notice,
        recoveryFailed: true,
        committed: requirement.mutationCommitted,
        outcome: reason === "ambiguous" ? "ambiguous_reload_failed" : reason === "committed" ? "committed_reload_failed" : "stale_reload_failed",
        reloadRequirement: requirement,
        closeSubmittedForm: reason !== "stale",
      };
    }
  }
  if (response.status >= 500) throw new Error("The estimate service could not complete the change. Try again.");
  throw new Error(typeof responseRecord.error === "string" ? responseRecord.error : "The estimate change could not be saved.");
}

export async function retryRequiredBuilderReload(
  fetcher: BuilderFetch,
  estimateId: string,
  current: EstimateBuilderEnvelope,
  requirement: BuilderReloadRequirement,
) {
  try {
    const state = await loadEstimateBuilder(fetcher, estimateId);
    if (!satisfiesRevisionRequirement(state, requirement)) throw new Error("The authoritative estimate revision is too old.");
    return { state, reloadRequirement: null, notice: "The latest estimate state was loaded. Editing is available again." };
  } catch {
    return { state: current, reloadRequirement: requirement, notice: requirement.notice };
  }
}

export function formatCents(value: string | null | undefined) {
  if (value === null || value === undefined || !/^-?\d+$/.test(value)) return "—";
  const cents = BigInt(value);
  const negative = cents < 0n;
  const magnitude = negative ? -cents : cents;
  return `${negative ? "-" : ""}$${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}

export function formatDecimalDollars(value: string | null | undefined) {
  if (value === null || value === undefined || !/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) return "—";
  const [whole, suppliedFraction = ""] = value.split(".");
  let fraction = suppliedFraction.padEnd(2, "0");
  while (fraction.length > 2 && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function previewMarkupCents(
  baseCents: string | null | undefined,
  percent: string,
) {
  if (
    baseCents === null ||
    baseCents === undefined ||
    !/^\d+$/.test(baseCents) ||
    !DECIMAL_PATTERNS.percent.test(percent)
  ) {
    return null;
  }

  const [whole, fraction = ""] =
    percent.split(".");
  const milliPercent =
    BigInt(whole) * 1_000n +
    BigInt(
      (fraction + "000").slice(0, 3),
    );
  const numerator =
    BigInt(baseCents) * milliPercent;
  const denominator = 100_000n;

  return (
    (numerator + denominator / 2n) /
    denominator
  ).toString();
}

export function moneyInputToCents(value: string) {
  const normalized = value.trim();
  if (!DECIMAL_PATTERNS.money.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return (BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2))).toString();
}

export function centsToMoneyInput(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return "";
  const cents = BigInt(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function previewMarkupPercent(baseCents: string | null, markupDollars: string) {
  const markupCents = moneyInputToCents(markupDollars);
  if (baseCents === null || !/^\d+$/.test(baseCents) || markupCents === null) return null;
  const base = BigInt(baseCents);
  const markup = BigInt(markupCents);
  if (base === 0n) return markup === 0n ? "0" : null;
  const numerator = markup * 100_000n;
  const thousandths = (numerator + base / 2n) / base;
  if (thousandths > 1_000_000n) return null;
  const whole = thousandths / 1_000n;
  const fraction = String(thousandths % 1_000n).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function addPreviewCents(...values: readonly (string | null)[]) {
  if (values.some((value) => value === null || !/^\d+$/.test(value))) return null;
  return values.reduce((sum, value) => sum + BigInt(value as string), 0n).toString();
}

type PreviewCostLine = Readonly<{
  id?: string | null;
  itemType: "standard" | "allowance";
  quantity: string;
  included: boolean;
  materialUnitCost?: string | null;
  laborUnitCost?: string | null;
  subcontractorUnitCost?: string | null;
  equipmentUnitCost?: string | null;
  otherDirectUnitCost?: string | null;
  materialWastePercent?: string | null;
}>;

function previewDecimalUnits(value: string | null | undefined, places: number) {
  const normalized = value?.trim() || "0";
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > places) return null;
  return BigInt(whole) * 10n ** BigInt(places)
    + BigInt((fraction + "0".repeat(places)).slice(0, places));
}

function previewRoundRatio(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  return numerator % denominator * 2n >= denominator ? quotient + 1n : quotient;
}

export function previewCostLineCents(line: PreviewCostLine) {
  if (!line.included) return "0";
  const quantity = previewDecimalUnits(line.quantity, 4);
  const waste = previewDecimalUnits(line.materialWastePercent, 3);
  if (quantity === null || waste === null || waste > 100_000n) return null;
  const adjustedMaterialQuantity = previewRoundRatio(quantity * (100_000n + waste), 100_000n);
  let total = 0n;
  for (const [field, componentQuantity] of [
    ["materialUnitCost", adjustedMaterialQuantity],
    ["laborUnitCost", quantity],
    ["subcontractorUnitCost", quantity],
    ["equipmentUnitCost", quantity],
    ["otherDirectUnitCost", quantity],
  ] as const) {
    const unitCost = previewDecimalUnits(line[field], 4);
    if (unitCost === null) return null;
    total += previewRoundRatio(componentQuantity * unitCost, 1_000_000n);
  }
  return total.toString();
}

export function previewEstimateRawCostCents(
  items: readonly EstimateBuilderItem[],
  draft: (EstimateItemDraft & { id?: string | null }) | null = null,
) {
  if (draft?.costCategory === "mixed") return null;
  const retained = draft?.id ? items.filter((item) => item.id !== draft.id) : items;
  const draftLine: PreviewCostLine | null = draft ? {
    ...draft,
    materialUnitCost: draft.costCategory === "material" ? draft.unitCost : "0",
    laborUnitCost: draft.costCategory === "labor" ? draft.unitCost : "0",
    subcontractorUnitCost: draft.costCategory === "subcontractor" ? draft.unitCost : "0",
    equipmentUnitCost: draft.costCategory === "equipment" ? draft.unitCost : "0",
    otherDirectUnitCost: draft.costCategory === "other" ? draft.unitCost : "0",
  } : null;
  const lines: PreviewCostLine[] = [...retained, ...(draftLine ? [draftLine] : [])];
  const costs = lines.map(previewCostLineCents);
  return costs.some((cost) => cost === null)
    ? null
    : costs.reduce((sum, cost) => sum + BigInt(cost as string), 0n).toString();
}
