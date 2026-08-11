import {
  calculateEstimateWithMaterialTax,
  ESTIMATE_CALCULATION_POLICY_VERSION,
  projectEstimateCalculation,
} from "./estimate-calculations";
import type {
  EstimateCalculationInput,
  EstimateItemInput,
  EstimateProjectionPermissions,
  InternalEstimateCalculation,
} from "./estimate-types";
import { DEFAULT_ESTIMATE_PRESENTATION, ESTIMATE_PRESENTATION_VERSION } from "./estimate-presentation";

export const STRUCTURED_ESTIMATE_ITEM_SELECT = `
  id,
  section_id,
  item_type,
  internal_description,
  customer_description,
  quantity_text:quantity::text,
  unit,
  material_unit_cost_text:material_unit_cost::text,
  labor_unit_cost_text:labor_unit_cost::text,
  subcontractor_unit_cost_text:subcontractor_unit_cost::text,
  equipment_unit_cost_text:equipment_unit_cost::text,
  other_direct_unit_cost_text:other_direct_unit_cost::text,
  material_waste_percent_text:material_waste_percent::text,
  item_markup_percent_text:item_markup_percent::text,
  taxable,
  is_included,
  fixed_customer_price_text:fixed_customer_price::text,
  sort_order
`;

export const STRUCTURED_ESTIMATE_SELECT = `
  *,
  overhead_percent_text:overhead_percent::text,
  profit_markup_percent_text:profit_markup_percent::text,
  tax_rate_percent_text:tax_rate_percent::text,
  discount_value_text:discount_value::text
`;

export const STRUCTURED_LEAD_DRAFT_UNIQUE_INDEX =
  "estimates_one_structured_draft_per_lead_uidx";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function optionalIsoCalendarDate(
  value: unknown,
  fieldName = "validUntil",
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${fieldName} must use YYYY-MM-DD.`);
  }

  const [yearText, monthText, dayText] = value.split("-");
  if (yearText === "0000") {
    throw new TypeError(`${fieldName} must be a real calendar date.`);
  }
  const year = BigInt(yearText);
  const leapYear = year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
  const maximumDay = {
    "01": "31", "02": leapYear ? "29" : "28", "03": "31", "04": "30",
    "05": "31", "06": "30", "07": "31", "08": "31", "09": "30",
    "10": "31", "11": "30", "12": "31",
  }[monthText];
  if (!maximumDay || dayText < "01" || dayText > maximumDay) {
    throw new TypeError(`${fieldName} must be a real calendar date.`);
  }
  return value;
}

export function defaultEstimateValidUntil(
  now: Date = new Date(),
  validityDays = 30,
): string {
  if (Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid date.");
  }

  if (!Number.isSafeInteger(validityDays) || validityDays < 0) {
    throw new TypeError("validityDays must be a nonnegative whole number.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = +(part("year") ?? "");
  const month = +(part("month") ?? "");
  const day = +(part("day") ?? "");
  const validUntil = new Date(
    Date.UTC(year, month - 1, day + validityDays),
  );

  return validUntil.toISOString().slice(0, 10);
}

export function isStructuredLeadDraftUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code !== "23505") return false;
  return [record.message, record.details].some(
    (value) => typeof value === "string" && value.includes(STRUCTURED_LEAD_DRAFT_UNIQUE_INDEX),
  );
}

export function postgresNumericToDecimalString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`${fieldName} must be an exact PostgreSQL numeric string.`);
  }
  const [whole, fraction] = value.split(".");
  const normalizedFraction = fraction?.replace(/0+$/, "");
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
}

export function nullablePostgresNumeric(
  value: unknown,
  fieldName: string,
): string | null {
  return value === null || value === undefined
    ? null
    : postgresNumericToDecimalString(value, fieldName);
}

export function centsToPostgresNumeric(value: bigint | null): string | null {
  if (value === null) return null;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? "-" : ""}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}

export function milliPercentToPostgresNumeric(value: bigint | null): string | null {
  if (value === null) return null;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? "-" : ""}${magnitude / 1_000n}.${(magnitude % 1_000n).toString().padStart(3, "0")}`;
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} is required.`);
  }
  return value;
}

export function storedLineItemToCalculationInput(
  record: Record<string, unknown>,
): EstimateItemInput {
  const id = requiredString(record.id, "item.id");
  const kind = record.item_type;
  if (kind !== "standard" && kind !== "allowance") {
    throw new TypeError(`${id}.item_type is unsupported.`);
  }
  const base = {
    id,
    kind,
    customerDescription: requiredString(record.customer_description, `${id}.customer_description`),
    quantity: postgresNumericToDecimalString(record.quantity_text, `${id}.quantity`),
    unit: requiredString(record.unit, `${id}.unit`),
    wastePercent: postgresNumericToDecimalString(record.material_waste_percent_text, `${id}.material_waste_percent`),
    taxable: record.taxable === true,
    included: record.is_included === true,
    costs: {
      materialUnitCost: nullablePostgresNumeric(record.material_unit_cost_text, `${id}.material_unit_cost`),
      laborUnitCost: nullablePostgresNumeric(record.labor_unit_cost_text, `${id}.labor_unit_cost`),
      subcontractorUnitCost: nullablePostgresNumeric(record.subcontractor_unit_cost_text, `${id}.subcontractor_unit_cost`),
      equipmentUnitCost: nullablePostgresNumeric(record.equipment_unit_cost_text, `${id}.equipment_unit_cost`),
      otherDirectUnitCost: nullablePostgresNumeric(record.other_direct_unit_cost_text, `${id}.other_direct_unit_cost`),
    },
  };
  return kind === "allowance"
    ? {
        ...base,
        kind,
        fixedCustomerPrice: postgresNumericToDecimalString(record.fixed_customer_price_text, `${id}.fixed_customer_price`),
      }
    : {
        ...base,
        kind,
        itemMarkupPercent: postgresNumericToDecimalString(record.item_markup_percent_text, `${id}.item_markup_percent`),
      };
}

export function calculatePersistedEstimate(
  estimate: Record<string, unknown>,
  lineItems: readonly Record<string, unknown>[],
) {
  if (estimate.calculation_policy_version !== ESTIMATE_CALCULATION_POLICY_VERSION) {
    throw new TypeError("Unsupported calculation_policy_version.");
  }
  const input: EstimateCalculationInput = {
    items: lineItems.map(storedLineItemToCalculationInput),
    overheadPercent: postgresNumericToDecimalString(estimate.overhead_percent_text, "overhead_percent"),
    profitMarkupPercent: postgresNumericToDecimalString(estimate.profit_markup_percent_text, "profit_markup_percent"),
    taxPercent: postgresNumericToDecimalString(estimate.tax_rate_percent_text, "tax_rate_percent"),
    discountAmount: postgresNumericToDecimalString(estimate.discount_value_text, "discount_value"),
  };
  return calculateEstimateWithMaterialTax({
    ...input,
    taxPercent: "0",
    materialTaxPercent: postgresNumericToDecimalString(
      estimate.tax_rate_percent_text,
      "material_tax_percent",
    ),
  });
}

function moneyOrZero(value: bigint | null) {
  return centsToPostgresNumeric(value) ?? "0.00";
}

export function buildEstimateCalculationPersistence(
  calculation: InternalEstimateCalculation,
) {
  return {
    costs_complete: calculation.costsComplete,
    prices_complete: calculation.pricesComplete,
    subtotal_cost: moneyOrZero(calculation.directCostCents),
    subtotal_price: moneyOrZero(calculation.itemPriceSubtotalCents),
    contingency_amount: "0.00",
    discount_amount: moneyOrZero(calculation.discountCents),
    tax_amount: moneyOrZero(
      calculation.policyVersion === "structured-estimate-v2-material-tax"
        ? calculation.materialTaxCents
        : calculation.taxCents,
    ),
    total_price: moneyOrZero(calculation.customerTotalCents),
    estimated_profit: moneyOrZero(calculation.grossProfitCents),
    estimated_margin: milliPercentToPostgresNumeric(calculation.grossMarginMilliPercent),
    item_markup_amount: centsToPostgresNumeric(calculation.itemMarkupTotalCents),
    overhead_amount: centsToPostgresNumeric(calculation.overheadCents),
    pre_profit_subtotal: centsToPostgresNumeric(calculation.preProfitSubtotalCents),
    profit_markup_amount: centsToPostgresNumeric(calculation.profitMarkupCents),
    pre_discount_subtotal: centsToPostgresNumeric(calculation.preDiscountCustomerSubtotalCents),
    post_discount_subtotal: centsToPostgresNumeric(calculation.postDiscountSubtotalCents),
    taxable_item_price_subtotal: centsToPostgresNumeric(calculation.taxableItemPriceSubtotalCents),
    taxable_overhead_amount: centsToPostgresNumeric(calculation.taxableOverheadCents),
    taxable_profit_amount: centsToPostgresNumeric(calculation.taxableProfitCents),
    taxable_discount_amount: centsToPostgresNumeric(calculation.taxableDiscountCents),
    taxable_subtotal: centsToPostgresNumeric(calculation.taxableSubtotalCents),
  };
}

export function projectPersistedEstimate(
  estimate: Record<string, unknown>,
  calculation: InternalEstimateCalculation,
  permissions: EstimateProjectionPermissions,
) {
  const projection = projectEstimateCalculation(calculation, permissions);
  const presentationSchemaAvailable = "presentation_detail_level" in estimate;
  const detailLevel = estimate.presentation_detail_level === "section_summary" || estimate.presentation_detail_level === "itemized"
    ? estimate.presentation_detail_level
    : "lump_sum";
  const ohpPresentationMode = detailLevel === "lump_sum"
    ? "distributed"
    : estimate.presentation_ohp_mode === "separate_line_item" ? "separate_line_item" : "distributed";
  return Object.freeze({
    id: String(estimate.id ?? ""),
    leadId: estimate.lead_id ?? null,
    customerId: estimate.customer_id ?? null,
    projectId: estimate.project_id ?? null,
    estimateNumber: estimate.estimate_number ?? null,
    title: estimate.title,
    description: estimate.description ?? null,
    status: estimate.status,
    propertyAddress: estimate.property_address ?? null,
    validUntil: estimate.valid_until ?? null,
    scopeNotes: estimate.scope_notes ?? null,
    exclusions: estimate.exclusions ?? null,
    internalNotes: estimate.internal_notes ?? null,
    customerNotes: estimate.customer_notes ?? null,
    taxRatePercent: estimate.tax_rate_percent_text,
    materialTax: Object.freeze({
      municipality: estimate.material_tax_municipality ?? null,
      county: estimate.material_tax_county ?? null,
      stateCode: estimate.material_tax_state_code ?? null,
      sourceUrl: estimate.material_tax_source_url ?? null,
      verifiedAt: estimate.material_tax_verified_at ?? null,
    }),
    discountAmount: estimate.discount_value_text,
    calculationPolicyVersion: calculation.policyVersion,
    calculationRevision: estimate.calculation_revision,
    presentation: Object.freeze({
      schemaAvailable: presentationSchemaAvailable,
      version: ESTIMATE_PRESENTATION_VERSION,
      detailLevel,
      ohpPresentationMode,
      lumpSumLabel: typeof estimate.presentation_lump_sum_label === "string" && estimate.presentation_lump_sum_label.trim()
        ? estimate.presentation_lump_sum_label.trim()
        : DEFAULT_ESTIMATE_PRESENTATION.lumpSumLabel,
    }),
    ...(permissions.canViewProfit
      ? {
          overheadPercent: estimate.overhead_percent_text,
          profitMarkupPercent: estimate.profit_markup_percent_text,
        }
      : {}),
    calculation: projection,
  });
}

export function legacySentinelToNullable(
  value: string,
  complete: boolean,
) {
  return complete ? postgresNumericToDecimalString(value, "legacy total") : null;
}
