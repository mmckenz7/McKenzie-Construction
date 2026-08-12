import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateEstimate,
  calculateEstimateForStoredPolicy,
  calculateEstimateWithMaterialTax,
  projectEstimateCalculation,
  MAX_ESTIMATE_ITEMS,
} from "../src/lib/estimate-calculations.ts";

const zeroCosts = Object.freeze({
  materialUnitCost: "0",
  laborUnitCost: "0",
  subcontractorUnitCost: "0",
  equipmentUnitCost: "0",
  otherDirectUnitCost: "0",
});

function standard(overrides = {}) {
  return {
    id: "item-1",
    kind: "standard",
    customerDescription: "Work item",
    quantity: "1",
    unit: "each",
    wastePercent: "0",
    itemMarkupPercent: "0",
    taxable: false,
    included: true,
    costs: zeroCosts,
    ...overrides,
  };
}

function allowance(overrides = {}) {
  return {
    id: "allowance-1",
    kind: "allowance",
    customerDescription: "Fixture allowance",
    quantity: "1",
    unit: "allowance",
    wastePercent: "0",
    taxable: false,
    included: true,
    fixedCustomerPrice: "500.00",
    costs: zeroCosts,
    ...overrides,
  };
}

function estimate(items, overrides = {}) {
  return calculateEstimate({
    items,
    overheadPercent: "0",
    profitMarkupPercent: "0",
    discountAmount: "0",
    taxPercent: "0",
    ...overrides,
  });
}

function materialTaxEstimate(items, overrides = {}) {
  return calculateEstimateWithMaterialTax({
    items,
    overheadPercent: "0",
    profitMarkupPercent: "0",
    discountAmount: "0",
    taxPercent: "0",
    materialTaxPercent: "0",
    ...overrides,
  });
}

test("handles an empty estimate with the versioned policy", () => {
  const result = estimate([]);
  assert.equal(result.policyVersion, "structured-estimate-v1");
  assert.equal(result.costsComplete, true);
  assert.equal(result.pricesComplete, true);
  assert.equal(result.directCostCents, 0n);
  assert.equal(result.customerTotalCents, 0n);
  assert.equal(result.grossProfitCents, 0n);
  assert.equal(result.grossMarginMilliPercent, null);
});

test("stored policy dispatch keeps v1 customer tax separate from v2 material tax", () => {
  const input = {
    items: [standard({
      taxable: true,
      costs: { ...zeroCosts, materialUnitCost: "100", laborUnitCost: "50" },
    })],
    overheadPercent: "10",
    profitMarkupPercent: "0",
    discountAmount: "0",
  };
  const v1 = calculateEstimateForStoredPolicy("structured-estimate-v1", input, "10");
  const v2 = calculateEstimateForStoredPolicy("structured-estimate-v2-material-tax", input, "10");

  assert.equal(v1.policyVersion, "structured-estimate-v1");
  assert.equal(v1.directCostCents, 15_000n);
  assert.equal(v1.taxCents, 1_650n);
  assert.equal(v1.customerTotalCents, 18_150n);
  assert.equal(v2.policyVersion, "structured-estimate-v2-material-tax");
  assert.equal(v2.materialTaxCents, 1_000n);
  assert.equal(v2.directCostCents, 16_000n);
  assert.equal(v2.taxCents, 0n);
  assert.equal(v2.customerTotalCents, 17_600n);
});

test("zero-rate v1 and v2 dispatch preserve identical monetary outputs", () => {
  const input = {
    items: [standard({ taxable: true, costs: { ...zeroCosts, materialUnitCost: "41.54" } })],
    overheadPercent: "20",
    profitMarkupPercent: "0",
    discountAmount: "0",
  };
  const v1 = calculateEstimateForStoredPolicy("structured-estimate-v1", input, "0");
  const v2 = calculateEstimateForStoredPolicy("structured-estimate-v2-material-tax", input, "0");
  for (const field of ["directCostCents", "materialTaxCents", "itemPriceSubtotalCents", "overheadCents", "taxCents", "customerTotalCents", "grossProfitCents"]) {
    assert.equal(v1[field], v2[field], field);
  }
  assert.throws(
    () => calculateEstimateForStoredPolicy("unsupported", input, "0"),
    /Unsupported calculation_policy_version/,
  );
});

test("calculates basic and multi-component direct costs", () => {
  const result = estimate([
    standard({
      quantity: "2",
      costs: {
        materialUnitCost: "10.0000",
        laborUnitCost: "5.0000",
        subcontractorUnitCost: "2.5000",
        equipmentUnitCost: "1.2500",
        otherDirectUnitCost: "0.7500",
      },
    }),
  ]);

  assert.deepEqual(result.items[0].componentCosts, {
    materialCostCents: 2000n,
    laborCostCents: 1000n,
    subcontractorCostCents: 500n,
    equipmentCostCents: 250n,
    otherDirectCostCents: 150n,
  });
  assert.equal(result.directCostCents, 3900n);
  assert.equal(result.customerTotalCents, 3900n);
});

test("material-tax policy applies municipality tax only to material cost", () => {
  const result = materialTaxEstimate(
    [
      standard({
        itemMarkupPercent: "10",
        costs: {
          ...zeroCosts,
          materialUnitCost: "100",
          laborUnitCost: "50",
        },
      }),
    ],
    { materialTaxPercent: "9.25" },
  );

  assert.equal(
    result.policyVersion,
    "structured-estimate-v2-material-tax",
  );
  assert.equal(result.items[0].materialTaxCents, 925n);
  assert.equal(result.materialTaxCents, 925n);
  assert.equal(result.directCostCents, 15_925n);
  assert.equal(result.itemMarkupTotalCents, 1_593n);
  assert.equal(result.customerTotalCents, 17_518n);
  assert.equal(result.taxCents, 0n);
});

test("material-tax policy fails closed for unknown material cost and customer tax", () => {
  const unknown = materialTaxEstimate(
    [
      standard({
        costs: {
          ...zeroCosts,
          materialUnitCost: null,
        },
      }),
    ],
    { materialTaxPercent: "9.25" },
  );
  assert.equal(unknown.items[0].materialTaxCents, null);
  assert.equal(unknown.materialTaxCents, null);
  assert.equal(unknown.directCostCents, null);

  assert.throws(
    () =>
      materialTaxEstimate([], {
        materialTaxPercent: "9.25",
        taxPercent: "1",
      }),
    /Customer sales tax must be zero/,
  );
});

test("applies waste only to material quantity and material cost", () => {
  const result = estimate([
    standard({
      quantity: "3",
      wastePercent: "10",
      costs: { ...zeroCosts, materialUnitCost: "2", laborUnitCost: "4" },
    }),
  ]);
  assert.equal(result.items[0].quantityUnits, 30_000n);
  assert.equal(result.items[0].adjustedMaterialQuantityUnits, 33_000n);
  assert.equal(result.items[0].componentCosts.materialCostCents, 660n);
  assert.equal(result.items[0].componentCosts.laborCostCents, 1200n);
});

test("applies item markup after rounded direct components", () => {
  const result = estimate([
    standard({
      itemMarkupPercent: "25",
      costs: { ...zeroCosts, materialUnitCost: "10" },
    }),
  ]);
  assert.equal(result.items[0].directCostCents, 1000n);
  assert.equal(result.items[0].itemMarkupCents, 250n);
  assert.equal(result.items[0].customerPriceCents, 1250n);
});

test("calculates overhead on direct cost before profit markup", () => {
  const result = estimate(
    [standard({ itemMarkupPercent: "10", costs: { ...zeroCosts, materialUnitCost: "100" } })],
    { overheadPercent: "10", profitMarkupPercent: "20" },
  );
  assert.equal(result.directCostCents, 10_000n);
  assert.equal(result.itemMarkupTotalCents, 1000n);
  assert.equal(result.overheadCents, 1000n);
  assert.equal(result.preProfitSubtotalCents, 12_000n);
  assert.equal(result.profitMarkupCents, 2400n);
  assert.equal(result.customerTotalCents, 14_400n);
});

test("caps discounts at the pre-discount subtotal and applies them before tax", () => {
  const discounted = estimate(
    [standard({ taxable: true, costs: { ...zeroCosts, materialUnitCost: "100" } })],
    { discountAmount: "10", taxPercent: "10" },
  );
  assert.equal(discounted.discountCents, 1000n);
  assert.equal(discounted.taxableSubtotalCents, 9000n);
  assert.equal(discounted.taxCents, 900n);
  assert.equal(discounted.customerTotalCents, 9900n);

  const capped = estimate([standard({ costs: { ...zeroCosts, materialUnitCost: "5" } })], {
    discountAmount: "100",
  });
  assert.equal(capped.discountCents, 500n);
  assert.equal(capped.customerTotalCents, 0n);
});

test("supports fully taxable and fully nontaxable estimates", () => {
  const taxable = estimate(
    [standard({ taxable: true, costs: { ...zeroCosts, materialUnitCost: "10" } })],
    { taxPercent: "9.25" },
  );
  const nontaxable = estimate(
    [standard({ taxable: false, costs: { ...zeroCosts, materialUnitCost: "10" } })],
    { taxPercent: "9.25" },
  );
  assert.equal(taxable.taxCents, 93n);
  assert.equal(taxable.customerTotalCents, 1093n);
  assert.equal(nontaxable.taxCents, 0n);
  assert.equal(nontaxable.customerTotalCents, 1000n);
});

test("allocates overhead, profit, and discounts proportionally for mixed taxability", () => {
  const result = estimate(
    [
      standard({ id: "taxable", taxable: true, costs: { ...zeroCosts, materialUnitCost: "100" } }),
      standard({ id: "nontaxable", taxable: false, costs: { ...zeroCosts, materialUnitCost: "100" } }),
    ],
    { overheadPercent: "10", profitMarkupPercent: "10", discountAmount: "24.20", taxPercent: "10" },
  );
  assert.equal(result.overheadCents, 2000n);
  assert.equal(result.profitMarkupCents, 2200n);
  assert.equal(result.taxableOverheadCents, 1000n);
  assert.equal(result.taxableProfitCents, 1100n);
  assert.equal(result.taxableDiscountCents, 1210n);
  assert.equal(result.taxableSubtotalCents, 10_890n);
  assert.equal(result.taxCents, 1089n);
  assert.equal(result.customerTotalCents, 22_869n);
});

test("fixed-price allowances retain customer price with known or unknown costs", () => {
  const known = estimate([
    allowance({ costs: { ...zeroCosts, materialUnitCost: "300" } }),
  ]);
  assert.equal(known.directCostCents, 30_000n);
  assert.equal(known.itemMarkupTotalCents, 20_000n);
  assert.equal(known.customerTotalCents, 50_000n);

  const unknown = estimate([
    allowance({ costs: { ...zeroCosts, materialUnitCost: null } }),
  ]);
  assert.equal(unknown.costsComplete, false);
  assert.equal(unknown.pricesComplete, true);
  assert.equal(unknown.items[0].directCostCents, null);
  assert.equal(unknown.items[0].customerPriceCents, 50_000n);
  assert.equal(unknown.customerTotalCents, 50_000n);
  assert.equal(unknown.grossProfitCents, null);
  assert.equal(unknown.grossMarginMilliPercent, null);
});

test("unknown standard costs propagate instead of becoming zero", () => {
  const result = estimate([
    standard({ costs: { ...zeroCosts, laborUnitCost: null } }),
  ]);
  assert.equal(result.items[0].componentCosts.laborCostCents, null);
  assert.equal(result.items[0].directCostCents, null);
  assert.equal(result.items[0].itemMarkupCents, null);
  assert.equal(result.items[0].customerPriceCents, null);
  assert.equal(result.directCostCents, null);
  assert.equal(result.customerTotalCents, null);
  assert.equal(result.grossProfitCents, null);
});

test("excluded items do not affect totals or completeness", () => {
  const result = estimate([
    standard({ id: "included", costs: { ...zeroCosts, materialUnitCost: "10" } }),
    standard({ id: "excluded", included: false, costs: { ...zeroCosts, materialUnitCost: null } }),
  ]);
  assert.equal(result.items.length, 2);
  assert.equal(result.costsComplete, true);
  assert.equal(result.directCostCents, 1000n);
});

test("rounds half away from zero at component and percentage boundaries", () => {
  const component = estimate([
    standard({ quantity: "0.5", costs: { ...zeroCosts, materialUnitCost: "0.0100" } }),
  ]);
  assert.equal(component.directCostCents, 1n);

  const markup = estimate([
    standard({ quantity: "0.5", itemMarkupPercent: "50", costs: { ...zeroCosts, materialUnitCost: "0.0100" } }),
  ]);
  assert.equal(markup.itemMarkupTotalCents, 1n);
  assert.equal(markup.customerTotalCents, 2n);

  const belowHalfCent = estimate([
    standard({ quantity: "0.4999", costs: { ...zeroCosts, materialUnitCost: "0.0100" } }),
  ]);
  assert.equal(belowHalfCent.directCostCents, 0n);
});

test("handles values beyond Number safe-integer precision", () => {
  const result = estimate([
    standard({
      quantity: "9999999999.9999",
      costs: { ...zeroCosts, materialUnitCost: "99999999.9999" },
    }),
  ]);
  assert.equal(result.directCostCents, 99_999_999_999_899_000_000n);
  assert.ok(result.directCostCents > BigInt(Number.MAX_SAFE_INTEGER));
});

test("rejects malformed, negative, over-precision, and out-of-range inputs", () => {
  assert.throws(() => estimate([standard({ quantity: "-1" })]), /nonnegative decimal string/);
  assert.throws(() => estimate([standard({ quantity: "1e3" })]), /nonnegative decimal string/);
  assert.throws(() => estimate([standard({ quantity: "1.00001" })]), /at most 4 decimal places/);
  assert.throws(() => estimate([standard({ itemMarkupPercent: "1.0001" })]), /at most 3 decimal places/);
  assert.throws(() => estimate([standard({ wastePercent: "100.001" })]), /cannot exceed 100/);
  assert.throws(() => estimate([standard({ costs: { ...zeroCosts, materialUnitCost: "NaN" } })]), /nonnegative decimal string/);
  assert.throws(() => estimate([], { discountAmount: "-0.01" }), /nonnegative decimal string/);
});

test("does not mutate inputs and returns frozen calculations", () => {
  const input = {
    items: [standard({ costs: { ...zeroCosts, materialUnitCost: "12" } })],
    overheadPercent: "5",
    profitMarkupPercent: "10",
    discountAmount: "1",
    taxPercent: "9",
  };
  const before = structuredClone(input);
  const result = calculateEstimate(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
  assert.equal(Object.isFrozen(result.items[0].componentCosts), true);
});

test("permission-safe projections preserve customer price while omitting restricted fields", () => {
  const calculation = estimate(
    [standard({ itemMarkupPercent: "25", costs: { ...zeroCosts, materialUnitCost: "100" } })],
    { overheadPercent: "10", profitMarkupPercent: "10" },
  );
  const customerOnly = projectEstimateCalculation(calculation, {
    canViewCosts: false,
    canViewProfit: false,
  });
  assert.equal(customerOnly.customerTotalCents, calculation.customerTotalCents.toString());
  assert.equal(customerOnly.items[0].customerPriceCents, "12500");
  assert.equal(customerOnly.items[0].quantity, "1.0000");
  assert.equal(customerOnly.items[0].adjustedMaterialQuantity, "1.0000");
  assert.equal("directCostCents" in customerOnly, false);
  assert.equal("grossProfitCents" in customerOnly, false);
  assert.equal("componentCosts" in customerOnly.items[0], false);
  assert.equal("itemMarkupCents" in customerOnly.items[0], false);

  const costsOnly = projectEstimateCalculation(calculation, {
    canViewCosts: true,
    canViewProfit: false,
  });
  assert.equal(costsOnly.directCostCents, "10000");
  assert.equal(costsOnly.materialTaxCents, "0");
  assert.equal(costsOnly.items[0].componentCosts.materialCostCents, "10000");
  assert.equal("grossProfitCents" in costsOnly, false);
  assert.equal("itemMarkupCents" in costsOnly.items[0], false);

  const profitOnly = projectEstimateCalculation(calculation, {
    canViewCosts: false,
    canViewProfit: true,
  });
  assert.equal(profitOnly.grossProfitCents, calculation.grossProfitCents.toString());
  assert.equal("itemMarkupCents" in profitOnly.items[0], false);
  assert.equal("itemMarkupTotalCents" in profitOnly, false);

  const full = projectEstimateCalculation(calculation, {
    canViewCosts: true,
    canViewProfit: true,
  });
  assert.equal(full.grossProfitCents, calculation.grossProfitCents.toString());
  assert.equal(full.items[0].itemMarkupCents, "2500");
  assert.equal(Object.isFrozen(customerOnly), true);
  assert.equal(Object.isFrozen(customerOnly.items), true);
  assert.equal(Object.isFrozen(customerOnly.items[0]), true);
});

test("serializes all four permission projections without bigint", () => {
  const calculation = estimate([
    standard({ itemMarkupPercent: "25", costs: { ...zeroCosts, materialUnitCost: "10" } }),
  ]);
  for (const permissions of [
    { canViewCosts: false, canViewProfit: false },
    { canViewCosts: true, canViewProfit: false },
    { canViewCosts: false, canViewProfit: true },
    { canViewCosts: true, canViewProfit: true },
  ]) {
    const projection = projectEstimateCalculation(calculation, permissions);
    const serialized = JSON.stringify(projection);
    assert.equal(typeof serialized, "string");
    assert.doesNotMatch(serialized, /\bn\b/);
    assert.equal(projection.customerTotalCents, "1250");
    assert.equal("directCostCents" in projection, permissions.canViewCosts);
    assert.equal("grossProfitCents" in projection, permissions.canViewProfit);
  }
});

test("reconciles residual cents by deriving nontaxable allocations from totals", () => {
  const result = estimate(
    [
      standard({ id: "tax", taxable: true, costs: { ...zeroCosts, materialUnitCost: "0.01" } }),
      standard({ id: "non", taxable: false, costs: { ...zeroCosts, materialUnitCost: "0.02" } }),
    ],
    { overheadPercent: "33.333", profitMarkupPercent: "33.333", discountAmount: "0.01" },
  );
  assert.equal(result.overheadCents, 1n);
  assert.equal(result.taxableOverheadCents, 0n);
  assert.equal(result.taxableOverheadCents + (result.overheadCents - result.taxableOverheadCents), result.overheadCents);
  assert.equal(result.profitMarkupCents, 1n);
  assert.equal(result.taxableProfitCents, 0n);
  assert.equal(result.taxableProfitCents + (result.profitMarkupCents - result.taxableProfitCents), result.profitMarkupCents);
  assert.equal(result.discountCents, 1n);
  assert.equal(result.taxableDiscountCents, 0n);
  assert.equal(result.taxableDiscountCents + (result.discountCents - result.taxableDiscountCents), result.discountCents);
});

test("propagates mixed known and unknown included standard items", () => {
  const result = estimate([
    standard({ id: "known", costs: { ...zeroCosts, materialUnitCost: "10" } }),
    standard({ id: "unknown", costs: { ...zeroCosts, laborUnitCost: null } }),
  ]);
  assert.equal(result.items[0].customerPriceCents, 1000n);
  assert.equal(result.items[1].customerPriceCents, null);
  assert.equal(result.costsComplete, false);
  assert.equal(result.pricesComplete, false);
  assert.equal(result.directCostCents, null);
  assert.equal(result.customerTotalCents, null);
});

test("defines allowance tax and overhead behavior when internal cost is unknown", () => {
  const unknownTaxable = allowance({
    taxable: true,
    costs: { ...zeroCosts, materialUnitCost: null },
  });
  const zeroOverhead = estimate([unknownTaxable], { taxPercent: "10" });
  assert.equal(zeroOverhead.customerTotalCents, 55_000n);
  assert.equal(zeroOverhead.taxCents, 5000n);
  assert.equal(zeroOverhead.grossProfitCents, null);

  const nonzeroOverhead = estimate([unknownTaxable], {
    overheadPercent: "10",
    taxPercent: "10",
  });
  assert.equal(nonzeroOverhead.overheadCents, null);
  assert.equal(nonzeroOverhead.taxCents, null);
  assert.equal(nonzeroOverhead.customerTotalCents, null);

  const nontaxable = estimate([
    allowance({ taxable: false, costs: { ...zeroCosts, materialUnitCost: null } }),
  ], { taxPercent: "10" });
  assert.equal(nontaxable.taxCents, 0n);
  assert.equal(nontaxable.customerTotalCents, 50_000n);
});

test("handles exact-total discounts and zero tax without residual values", () => {
  const result = estimate(
    [standard({ taxable: true, costs: { ...zeroCosts, materialUnitCost: "10" } })],
    { discountAmount: "10.00", taxPercent: "0" },
  );
  assert.equal(result.discountCents, 1000n);
  assert.equal(result.taxableSubtotalCents, 0n);
  assert.equal(result.taxCents, 0n);
  assert.equal(result.customerTotalCents, 0n);
});

test("preserves gross-profit identity and rounds gross margin to three decimals", () => {
  const result = estimate([
    standard({ itemMarkupPercent: "50", costs: { ...zeroCosts, materialUnitCost: "0.02" } }),
  ]);
  assert.equal(result.customerTotalCents, 3n);
  assert.equal(result.grossProfitCents, result.customerTotalCents - result.taxCents - result.directCostCents);
  assert.equal(result.grossMarginMilliPercent, 33_333n);
  const projected = projectEstimateCalculation(result, { canViewCosts: true, canViewProfit: true });
  assert.equal(projected.grossMarginPercent, "33.333");
});

test("accepts deeply frozen input and projections do not mutate or alias calculations", () => {
  const costs = Object.freeze({ ...zeroCosts, materialUnitCost: "10" });
  const item = Object.freeze(standard({ costs }));
  const input = Object.freeze({
    items: Object.freeze([item]),
    overheadPercent: "0",
    profitMarkupPercent: "0",
    discountAmount: "0",
    taxPercent: "0",
  });
  const calculation = calculateEstimate(input);
  const before = calculation.items[0].componentCosts.materialCostCents;
  const projection = projectEstimateCalculation(calculation, { canViewCosts: true, canViewProfit: true });
  assert.equal(calculation.items[0].componentCosts.materialCostCents, before);
  assert.notEqual(projection.items[0], calculation.items[0]);
  assert.notEqual(projection.items[0].componentCosts, calculation.items[0].componentCosts);
  assert.equal(Object.isFrozen(projection.items[0].componentCosts), true);
});

test("rejects duplicate IDs, excessive item counts, lengths, magnitudes, and percentages", () => {
  assert.throws(() => estimate([standard(), standard()]), /IDs must be unique/);
  assert.throws(
    () => estimate(Array.from({ length: MAX_ESTIMATE_ITEMS + 1 }, (_, index) => standard({ id: `item-${index}` }))),
    /at most 1000 items/,
  );
  assert.throws(() => estimate([standard({ quantity: "1".repeat(33) })]), /input length/);
  assert.throws(() => estimate([standard({ quantity: "10000000000.0000" })]), /magnitude/);
  assert.throws(() => estimate([standard({ costs: { ...zeroCosts, materialUnitCost: "100000000.0000" } })]), /magnitude/);
  assert.throws(() => estimate([], { discountAmount: "10000000000.00" }), /magnitude/);
  assert.throws(() => estimate([standard({ itemMarkupPercent: "1000.001" })]), /allowed maximum/);
  assert.throws(() => estimate([], { overheadPercent: "1000.001" }), /allowed maximum/);
  assert.throws(() => estimate([], { profitMarkupPercent: "1000.001" }), /allowed maximum/);
  assert.throws(() => estimate([], { taxPercent: "100.001" }), /allowed maximum/);
});
