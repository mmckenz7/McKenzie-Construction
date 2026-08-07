import type {
  EstimateCalculationInput,
  EstimateCostComponentsInput,
  EstimateItemInput,
  MaterialTaxEstimateCalculationInput,
  EstimateProjectionPermissions,
  InternalEstimateCalculation,
  InternalEstimateComponentCosts,
  InternalEstimateItemCalculation,
  SerializedEstimateCalculationProjection,
  SerializedEstimateComponentCosts,
  SerializedEstimateItemProjection,
} from "./estimate-types";

export const ESTIMATE_CALCULATION_POLICY_VERSION =
  "structured-estimate-v1" as const;
export const MATERIAL_TAX_ESTIMATE_CALCULATION_POLICY_VERSION =
  "structured-estimate-v2-material-tax" as const;

const QUANTITY_SCALE = 10_000n;
const PERCENT_SCALE = 1_000n;
const UNIT_COST_SCALE = 10_000n;
const MONEY_SCALE = 100n;

const MAX_DECIMAL_STRING_LENGTH = 32;
export const MAX_ESTIMATE_ITEMS = 1_000;
const MAX_QUANTITY_UNITS = 99_999_999_999_999n;
const MAX_UNIT_COST_UNITS = 999_999_999_999n;
const MAX_MONEY_CENTS = 999_999_999_999n;
const MAX_PERCENT_UNITS = 9_999_999n;
const MAX_WASTE_OR_TAX_PERCENT_UNITS = 100_000n;
const MAX_MARKUP_PERCENT_UNITS = 1_000_000n;

const PERCENT_DENOMINATOR = 100n * PERCENT_SCALE;
const UNIT_EXTENSION_DENOMINATOR =
  QUANTITY_SCALE * (UNIT_COST_SCALE / MONEY_SCALE);

function parseUnsignedDecimal(
  value: string,
  decimalPlaces: number,
  label: string,
  maximum: bigint,
) {
  if (typeof value !== "string" || value.length > MAX_DECIMAL_STRING_LENGTH) {
    throw new RangeError(`${label} exceeds the supported input length.`);
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new TypeError(`${label} must be a nonnegative decimal string.`);
  }

  const [whole, fraction = ""] = value.split(".");

  if (fraction.length > decimalPlaces) {
    throw new RangeError(`${label} supports at most ${decimalPlaces} decimal places.`);
  }

  const scale = 10n ** BigInt(decimalPlaces);
  const parsed = BigInt(whole) * scale + BigInt((fraction + "0".repeat(decimalPlaces)).slice(0, decimalPlaces));
  if (parsed > maximum) {
    throw new RangeError(`${label} exceeds the supported magnitude.`);
  }
  return parsed;
}

function divideRoundedHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
) {
  if (denominator <= 0n) {
    throw new RangeError("The rounding denominator must be positive.");
  }

  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function multiplyRatioRounded(
  value: bigint,
  numerator: bigint,
  denominator: bigint,
) {
  return divideRoundedHalfAwayFromZero(value * numerator, denominator);
}

function parseQuantity(value: string, label: string) {
  return parseUnsignedDecimal(value, 4, label, MAX_QUANTITY_UNITS);
}

function parsePercent(value: string, label: string) {
  return parseUnsignedDecimal(value, 3, label, MAX_PERCENT_UNITS);
}

function parseUnitCost(value: string, label: string) {
  return parseUnsignedDecimal(value, 4, label, MAX_UNIT_COST_UNITS);
}

function parseMoney(value: string, label: string) {
  return parseUnsignedDecimal(value, 2, label, MAX_MONEY_CENTS);
}

function requireMaximum(value: bigint, maximum: bigint, label: string) {
  if (value > maximum) throw new RangeError(`${label} exceeds the allowed maximum.`);
  return value;
}

function extendUnitCost(quantity: bigint, unitCost: bigint) {
  return divideRoundedHalfAwayFromZero(
    quantity * unitCost,
    UNIT_EXTENSION_DENOMINATOR,
  );
}

function calculateComponent(
  value: string | null,
  quantity: bigint,
  label: string,
) {
  return value === null
    ? null
    : extendUnitCost(quantity, parseUnitCost(value, label));
}

function sumKnownComponents(costs: InternalEstimateComponentCosts) {
  const values = Object.values(costs);
  if (values.some((value) => value === null)) return null;
  return values.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);
}

function calculateComponents(
  item: EstimateItemInput,
  quantity: bigint,
  adjustedMaterialQuantity: bigint,
) {
  const costs: EstimateCostComponentsInput = item.costs;
  return Object.freeze({
    materialCostCents: calculateComponent(
      costs.materialUnitCost,
      adjustedMaterialQuantity,
      `${item.id}.materialUnitCost`,
    ),
    laborCostCents: calculateComponent(
      costs.laborUnitCost,
      quantity,
      `${item.id}.laborUnitCost`,
    ),
    subcontractorCostCents: calculateComponent(
      costs.subcontractorUnitCost,
      quantity,
      `${item.id}.subcontractorUnitCost`,
    ),
    equipmentCostCents: calculateComponent(
      costs.equipmentUnitCost,
      quantity,
      `${item.id}.equipmentUnitCost`,
    ),
    otherDirectCostCents: calculateComponent(
      costs.otherDirectUnitCost,
      quantity,
      `${item.id}.otherDirectUnitCost`,
    ),
  });
}

function calculateItem(
  item: EstimateItemInput,
  materialTaxPercent: bigint,
): InternalEstimateItemCalculation {
  if (!item.id.trim()) throw new TypeError("Estimate item id is required.");
  if (!item.unit.trim()) throw new TypeError(`${item.id}.unit is required.`);

  const quantity = parseQuantity(item.quantity, `${item.id}.quantity`);
  const wastePercent = parsePercent(item.wastePercent, `${item.id}.wastePercent`);
  if (wastePercent > PERCENT_DENOMINATOR) {
    throw new RangeError(`${item.id}.wastePercent cannot exceed 100.`);
  }

  const adjustedMaterialQuantity = divideRoundedHalfAwayFromZero(
    quantity * (PERCENT_DENOMINATOR + wastePercent),
    PERCENT_DENOMINATOR,
  );
  const componentCosts = calculateComponents(item, quantity, adjustedMaterialQuantity);
  const preTaxDirectCostCents =
    sumKnownComponents(componentCosts);
  const materialTaxCents =
    materialTaxPercent === 0n
      ? 0n
      : componentCosts.materialCostCents === null
        ? null
        : multiplyRatioRounded(
            componentCosts.materialCostCents,
            materialTaxPercent,
            PERCENT_DENOMINATOR,
          );
  const directCostCents =
    preTaxDirectCostCents === null ||
    materialTaxCents === null
      ? null
      : preTaxDirectCostCents +
        materialTaxCents;
  const costsComplete = directCostCents !== null;

  let itemMarkupCents: bigint | null;
  let customerPriceCents: bigint | null;

  if (item.kind === "allowance") {
    itemMarkupCents = costsComplete
      ? parseMoney(item.fixedCustomerPrice, `${item.id}.fixedCustomerPrice`) - directCostCents
      : null;
    customerPriceCents = parseMoney(item.fixedCustomerPrice, `${item.id}.fixedCustomerPrice`);
  } else {
    const markupPercent = parsePercent(item.itemMarkupPercent, `${item.id}.itemMarkupPercent`);
    requireMaximum(markupPercent, MAX_MARKUP_PERCENT_UNITS, `${item.id}.itemMarkupPercent`);
    itemMarkupCents = directCostCents === null
      ? null
      : multiplyRatioRounded(directCostCents, markupPercent, PERCENT_DENOMINATOR);
    customerPriceCents = directCostCents === null || itemMarkupCents === null
      ? null
      : directCostCents + itemMarkupCents;
  }

  return Object.freeze({
    id: item.id,
    kind: item.kind,
    customerDescription: item.customerDescription,
    unit: item.unit,
    included: item.included,
    taxable: item.taxable,
    quantityUnits: quantity,
    adjustedMaterialQuantityUnits: adjustedMaterialQuantity,
    componentCosts,
    materialTaxCents,
    directCostCents,
    itemMarkupCents,
    customerPriceCents,
    costsComplete,
  });
}

function sum(values: readonly bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function calculateEstimateInternal(
  input: EstimateCalculationInput,
  policyVersion: InternalEstimateCalculation["policyVersion"],
  materialTaxPercent: bigint,
): Readonly<InternalEstimateCalculation> {
  if (input.items.length > MAX_ESTIMATE_ITEMS) {
    throw new RangeError(`An estimate supports at most ${MAX_ESTIMATE_ITEMS} items.`);
  }
  const itemIds = new Set(input.items.map((item) => item.id));
  if (itemIds.size !== input.items.length) {
    throw new RangeError("Estimate item IDs must be unique.");
  }
  const overheadPercent = parsePercent(input.overheadPercent, "overheadPercent");
  const profitMarkupPercent = parsePercent(input.profitMarkupPercent, "profitMarkupPercent");
  const taxPercent = parsePercent(input.taxPercent, "taxPercent");
  requireMaximum(overheadPercent, MAX_MARKUP_PERCENT_UNITS, "overheadPercent");
  requireMaximum(profitMarkupPercent, MAX_MARKUP_PERCENT_UNITS, "profitMarkupPercent");
  requireMaximum(taxPercent, MAX_WASTE_OR_TAX_PERCENT_UNITS, "taxPercent");
  const requestedDiscountCents = parseMoney(input.discountAmount, "discountAmount");
  const items = Object.freeze(
    input.items.map((item) =>
      calculateItem(
        item,
        materialTaxPercent,
      ),
    ),
  );
  const includedItems = items.filter((item) => item.included);
  const costsComplete = includedItems.every((item) => item.costsComplete);
  const pricesComplete = includedItems.every(
    (item) => item.customerPriceCents !== null,
  );

  const knownDirectCost = costsComplete
    ? sum(includedItems.map((item) => item.directCostCents ?? 0n))
    : null;
  const materialTaxCents = includedItems.every(
    (item) => item.materialTaxCents !== null,
  )
    ? sum(
        includedItems.map(
          (item) => item.materialTaxCents ?? 0n,
        ),
      )
    : null;
  const knownItemMarkup = costsComplete
    ? sum(includedItems.map((item) => item.itemMarkupCents ?? 0n))
    : null;
  const itemPriceSubtotalCents = pricesComplete
    ? sum(includedItems.map((item) => item.customerPriceCents ?? 0n))
    : null;
  const taxableItemPriceSubtotalCents = pricesComplete
    ? sum(
        includedItems
          .filter((item) => item.taxable)
          .map((item) => item.customerPriceCents ?? 0n),
      )
    : null;

  const overheadCents = overheadPercent === 0n
    ? 0n
    : knownDirectCost === null
      ? null
    : multiplyRatioRounded(knownDirectCost, overheadPercent, PERCENT_DENOMINATOR);
  const preProfitSubtotalCents = itemPriceSubtotalCents === null || overheadCents === null
    ? null
    : itemPriceSubtotalCents + overheadCents;
  const profitMarkupCents = preProfitSubtotalCents === null
    ? null
    : multiplyRatioRounded(
        preProfitSubtotalCents,
        profitMarkupPercent,
        PERCENT_DENOMINATOR,
      );
  const preDiscountCustomerSubtotalCents =
    preProfitSubtotalCents === null || profitMarkupCents === null
      ? null
      : preProfitSubtotalCents + profitMarkupCents;
  const discountCents = preDiscountCustomerSubtotalCents === null
    ? null
    : requestedDiscountCents > preDiscountCustomerSubtotalCents
      ? preDiscountCustomerSubtotalCents
      : requestedDiscountCents;
  const postDiscountSubtotalCents =
    preDiscountCustomerSubtotalCents === null || discountCents === null
      ? null
      : preDiscountCustomerSubtotalCents - discountCents;

  const taxableOverheadCents =
    itemPriceSubtotalCents === null || taxableItemPriceSubtotalCents === null || overheadCents === null
      ? null
      : itemPriceSubtotalCents === 0n
    ? 0n
    : multiplyRatioRounded(
        overheadCents,
        taxableItemPriceSubtotalCents,
        itemPriceSubtotalCents,
      );
  const taxableProfitCents =
    itemPriceSubtotalCents === null || taxableItemPriceSubtotalCents === null || profitMarkupCents === null
      ? null
      : itemPriceSubtotalCents === 0n
    ? 0n
    : multiplyRatioRounded(
        profitMarkupCents,
        taxableItemPriceSubtotalCents,
        itemPriceSubtotalCents,
      );
  const taxablePreDiscountSubtotalCents =
    taxableItemPriceSubtotalCents === null || taxableOverheadCents === null || taxableProfitCents === null
      ? null
      : taxableItemPriceSubtotalCents + taxableOverheadCents + taxableProfitCents;
  const taxableDiscountCents =
    preDiscountCustomerSubtotalCents === null || discountCents === null || taxablePreDiscountSubtotalCents === null
      ? null
      : preDiscountCustomerSubtotalCents === 0n
    ? 0n
    : multiplyRatioRounded(
        discountCents,
        taxablePreDiscountSubtotalCents,
        preDiscountCustomerSubtotalCents,
      );

  // Each taxable share is rounded once, half away from zero. The corresponding
  // nontaxable share is always the total minus this taxable share; it must never
  // be independently rounded, so both buckets reconcile exactly to the total.
  const taxableSubtotalCents = taxablePreDiscountSubtotalCents === null || taxableDiscountCents === null
    ? null
    : taxablePreDiscountSubtotalCents > taxableDiscountCents
    ? taxablePreDiscountSubtotalCents - taxableDiscountCents
    : 0n;
  const taxCents = taxableSubtotalCents === null
    ? null
    : multiplyRatioRounded(
        taxableSubtotalCents,
        taxPercent,
        PERCENT_DENOMINATOR,
      );
  const customerTotalCents = postDiscountSubtotalCents === null || taxCents === null
    ? null
    : postDiscountSubtotalCents + taxCents;
  const preTaxRevenueCents = customerTotalCents === null || taxCents === null
    ? null
    : customerTotalCents - taxCents;
  const grossProfitCents = knownDirectCost === null || preTaxRevenueCents === null
    ? null
    : preTaxRevenueCents - knownDirectCost;
  const grossMarginMilliPercent =
    grossProfitCents === null || preTaxRevenueCents === null || preTaxRevenueCents === 0n
      ? null
      : divideRoundedHalfAwayFromZero(
          grossProfitCents * PERCENT_DENOMINATOR,
          preTaxRevenueCents,
        );

  return Object.freeze({
    policyVersion,
    items,
    costsComplete,
    pricesComplete,
    directCostCents: knownDirectCost,
    materialTaxCents,
    itemMarkupTotalCents: knownItemMarkup,
    itemPriceSubtotalCents,
    taxableItemPriceSubtotalCents,
    overheadCents,
    preProfitSubtotalCents,
    profitMarkupCents,
    preDiscountCustomerSubtotalCents,
    discountCents,
    postDiscountSubtotalCents,
    taxableOverheadCents,
    taxableProfitCents,
    taxableDiscountCents,
    taxableSubtotalCents,
    taxCents,
    customerTotalCents,
    grossProfitCents,
    grossMarginMilliPercent,
  });
}

export function calculateEstimate(
  input: EstimateCalculationInput,
) {
  return calculateEstimateInternal(
    input,
    ESTIMATE_CALCULATION_POLICY_VERSION,
    0n,
  );
}

export function calculateEstimateWithMaterialTax(
  input: MaterialTaxEstimateCalculationInput,
) {
  const materialTaxPercent = parsePercent(
    input.materialTaxPercent,
    "materialTaxPercent",
  );
  requireMaximum(
    materialTaxPercent,
    MAX_WASTE_OR_TAX_PERCENT_UNITS,
    "materialTaxPercent",
  );
  const customerTaxPercent = parsePercent(
    input.taxPercent,
    "taxPercent",
  );
  if (customerTaxPercent !== 0n) {
    throw new RangeError(
      "Customer sales tax must be zero for the material-tax calculation policy.",
    );
  }

  return calculateEstimateInternal(
    input,
    MATERIAL_TAX_ESTIMATE_CALCULATION_POLICY_VERSION,
    materialTaxPercent,
  );
}

function serializeInteger(value: bigint | null) {
  return value === null ? null : value.toString();
}

function serializeFixed(value: bigint | null, decimalPlaces: number) {
  if (value === null) return null;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const scale = 10n ** BigInt(decimalPlaces);
  const whole = magnitude / scale;
  const fraction = (magnitude % scale).toString().padStart(decimalPlaces, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function serializeComponents(
  costs: InternalEstimateComponentCosts,
): Readonly<SerializedEstimateComponentCosts> {
  return Object.freeze({
    materialCostCents: serializeInteger(costs.materialCostCents),
    laborCostCents: serializeInteger(costs.laborCostCents),
    subcontractorCostCents: serializeInteger(costs.subcontractorCostCents),
    equipmentCostCents: serializeInteger(costs.equipmentCostCents),
    otherDirectCostCents: serializeInteger(costs.otherDirectCostCents),
  });
}

function projectItem(
  item: InternalEstimateItemCalculation,
  permissions: EstimateProjectionPermissions,
): Readonly<SerializedEstimateItemProjection> {
  const projection: SerializedEstimateItemProjection = {
    id: item.id,
    kind: item.kind,
    customerDescription: item.customerDescription,
    unit: item.unit,
    included: item.included,
    taxable: item.taxable,
    quantity: serializeFixed(item.quantityUnits, 4)!,
    adjustedMaterialQuantity: serializeFixed(item.adjustedMaterialQuantityUnits, 4)!,
    customerPriceCents: serializeInteger(item.customerPriceCents),
    ...(permissions.canViewCosts
      ? {
          costsComplete: item.costsComplete,
          componentCosts: serializeComponents(item.componentCosts),
          directCostCents: serializeInteger(item.directCostCents),
          materialTaxCents: serializeInteger(item.materialTaxCents),
        }
      : {}),
    ...(permissions.canViewCosts && permissions.canViewProfit
      ? { itemMarkupCents: serializeInteger(item.itemMarkupCents) }
      : {}),
  };
  return Object.freeze(projection);
}

export function projectEstimateCalculation(
  calculation: InternalEstimateCalculation,
  permissions: EstimateProjectionPermissions,
): Readonly<SerializedEstimateCalculationProjection> {
  const projection: SerializedEstimateCalculationProjection = {
    policyVersion: calculation.policyVersion,
    items: Object.freeze(
      calculation.items.map((item) => projectItem(item, permissions)),
    ),
    itemPriceSubtotalCents: serializeInteger(calculation.itemPriceSubtotalCents),
    preDiscountCustomerSubtotalCents: serializeInteger(calculation.preDiscountCustomerSubtotalCents),
    discountCents: serializeInteger(calculation.discountCents),
    postDiscountSubtotalCents: serializeInteger(calculation.postDiscountSubtotalCents),
    taxableSubtotalCents: serializeInteger(calculation.taxableSubtotalCents),
    taxCents: serializeInteger(calculation.taxCents),
    customerTotalCents: serializeInteger(calculation.customerTotalCents),
    ...(permissions.canViewCosts
      ? {
          costsComplete: calculation.costsComplete,
          pricesComplete: calculation.pricesComplete,
          directCostCents: serializeInteger(calculation.directCostCents),
          materialTaxCents: serializeInteger(calculation.materialTaxCents),
          taxableItemPriceSubtotalCents:
            serializeInteger(calculation.taxableItemPriceSubtotalCents),
        }
      : {}),
    ...(permissions.canViewProfit
      ? {
          overheadCents: serializeInteger(calculation.overheadCents),
          preProfitSubtotalCents: serializeInteger(calculation.preProfitSubtotalCents),
          profitMarkupCents: serializeInteger(calculation.profitMarkupCents),
          taxableOverheadCents: serializeInteger(calculation.taxableOverheadCents),
          taxableProfitCents: serializeInteger(calculation.taxableProfitCents),
          taxableDiscountCents: serializeInteger(calculation.taxableDiscountCents),
          grossProfitCents: serializeInteger(calculation.grossProfitCents),
          grossMarginPercent: serializeFixed(calculation.grossMarginMilliPercent, 3),
        }
      : {}),
    ...(permissions.canViewCosts && permissions.canViewProfit
      ? { itemMarkupTotalCents: serializeInteger(calculation.itemMarkupTotalCents) }
      : {}),
  };
  return Object.freeze(projection);
}
