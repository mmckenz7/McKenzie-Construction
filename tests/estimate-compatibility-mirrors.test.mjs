import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const {
  assertExactFields,
  buildItemCalculationBundle,
  calculateMutation,
  ITEM_FIELDS,
  parseCanonicalItem,
  projectBuilderState,
  verifyCalculationBundleCorrespondence,
} = await import("../src/lib/estimate-mutations.ts");

const sectionId = "11111111-1111-4111-8111-111111111111";
const standardId = "22222222-2222-4222-8222-222222222222";
const allowanceId = "33333333-3333-4333-8333-333333333333";
const estimate = {
  id: "44444444-4444-4444-8444-444444444444", status: "draft",
  calculation_policy_version: "structured-estimate-v1", calculation_revision: 7,
  overhead_percent_text: "0.000", profit_markup_percent_text: "0.000",
  tax_rate_percent_text: "0.000", discount_value_text: "0.00",
};

function itemBody(overrides = {}) {
  return {
    sectionId, itemType: "standard", quantity: "1.0000", unit: "ea",
    customerDescription: "Framing", internalDescription: "Internal",
    materialUnitCost: "0.0100", laborUnitCost: "0.0000",
    subcontractorUnitCost: "0.0000", equipmentUnitCost: "0.0000",
    otherDirectUnitCost: "0.0000", materialWastePercent: "0.000",
    itemMarkupPercent: "100.000", taxable: false, included: true,
    fixedCustomerPrice: null, sortOrder: 0, expectedCalculationRevision: 7,
    ...overrides,
  };
}

test("standard and allowance parsing preserves null versus explicit zero", () => {
  const standard = parseCanonicalItem(standardId, itemBody({ materialUnitCost: null, laborUnitCost: "0.0000" }));
  assert.equal(standard.materialUnitCost, null);
  assert.equal(standard.laborUnitCost, "0.0000");
  assert.equal(standard.fixedCustomerPrice, null);
  assert.throws(() => parseCanonicalItem(standardId, itemBody({ itemMarkupPercent: null })), /Standard items/);

  const allowance = parseCanonicalItem(allowanceId, itemBody({ itemType: "allowance", itemMarkupPercent: null, fixedCustomerPrice: "25.00", materialUnitCost: null }));
  assert.equal(allowance.fixedCustomerPrice, "25.00");
  assert.equal(allowance.itemMarkupPercent, null);
  assert.equal(allowance.materialUnitCost, null);
  assert.throws(() => parseCanonicalItem(allowanceId, itemBody({ itemType: "allowance", fixedCustomerPrice: null })), /Allowance items/);
});

test("compatibility mirrors come only from the exact server calculation", () => {
  const standard = parseCanonicalItem(standardId, itemBody());
  const result = calculateMutation(estimate, [standard]);
  const mirror = result.itemCalculations[0];
  assert.deepEqual({
    line_type: mirror.line_type, category: mirror.category, description: mirror.description,
    base_unit_cost: mirror.base_unit_cost, waste_percent: mirror.waste_percent,
    pricing_method: mirror.pricing_method, markup_percent: mirror.markup_percent,
    target_margin_percent: mirror.target_margin_percent, fixed_price: mirror.fixed_price,
    estimated_cost: mirror.estimated_cost, total_price: mirror.total_price,
    estimated_profit: mirror.estimated_profit, estimated_margin: mirror.estimated_margin,
    is_optional: mirror.is_optional, metadata: mirror.metadata,
  }, {
    line_type: "other", category: "structured", description: "Framing",
    base_unit_cost: "0.0100", waste_percent: "0.000", pricing_method: "markup",
    markup_percent: "100.000", target_margin_percent: null, fixed_price: null,
    estimated_cost: "0.01", total_price: "0.02", estimated_profit: "0.01",
    estimated_margin: "50.000", is_optional: false, metadata: {},
  });
});

test("incomplete costs use sentinels while completeness remains false", () => {
  const item = parseCanonicalItem(standardId, itemBody({ materialUnitCost: null }));
  const mirror = calculateMutation(estimate, [item]).itemCalculations[0];
  assert.equal(mirror.costs_complete, false);
  assert.equal(mirror.base_unit_cost, "0.0000");
  assert.equal(mirror.estimated_cost, "0.00");
  assert.equal(mirror.estimated_profit, "0.00");
  assert.equal(mirror.estimated_margin, null);
});

test("unit price uses exact half-away rounding and zero-quantity sentinel", () => {
  const allowance = parseCanonicalItem(allowanceId, itemBody({ itemType: "allowance", quantity: "8.0000", itemMarkupPercent: null, fixedCustomerPrice: "0.01" }));
  assert.equal(calculateMutation(estimate, [allowance]).itemCalculations[0].unit_price, "0.0013");
  const zero = parseCanonicalItem(allowanceId, itemBody({ itemType: "allowance", quantity: "0.0000", itemMarkupPercent: null, fixedCustomerPrice: "10.00" }));
  assert.equal(calculateMutation(estimate, [zero]).itemCalculations[0].unit_price, "0.0000");
});

test("item margin rounds half away from zero to three decimal places", () => {
  const item = parseCanonicalItem(standardId, itemBody({
    materialUnitCost: "0.6300", itemMarkupPercent: "1.587",
  }));
  const mirror = calculateMutation(estimate, [item]).itemCalculations[0];
  assert.equal(mirror.estimated_cost, "0.63");
  assert.equal(mirror.total_price, "0.64");
  assert.equal(mirror.estimated_margin, "1.563");
});

test("calculated fields are rejected and projections omit mirrors and permissions", () => {
  assert.throws(() => assertExactFields({ ...itemBody(), total_price: "1.00" }, ITEM_FIELDS), /unsupported fields/);
  const item = parseCanonicalItem(standardId, itemBody());
  const calculation = calculateMutation(estimate, [item]).calculation;
  const projected = projectBuilderState({ estimate, items: [item], sections: [{ id: sectionId, name: "Base", customer_description: null, internal_notes: null, sort_order: 0 }] }, calculation, { canEditPrices: true, canViewCosts: false, canViewProfit: false });
  assert.equal("directCostCents" in projected.estimate.calculation, false);
  assert.equal("grossProfitCents" in projected.estimate.calculation, false);
  for (const forbidden of ["estimated_cost", "estimated_profit", "base_unit_cost", "costs_complete", "metadata"]) {
    assert.equal(forbidden in projected.items[0], false);
  }
  assert.equal(projected.estimate.calculation.customerTotalCents, "2");
});

test("bundle builder rejects calculations missing an authoritative item", () => {
  const item = parseCanonicalItem(standardId, itemBody());
  assert.throws(() => buildItemCalculationBundle([item], { items: [] }), /Missing calculation/);
});

test("bundle correspondence rejects duplicate, missing, extra, and changed canonical inputs", () => {
  const item = parseCanonicalItem(standardId, itemBody());
  const bundle = calculateMutation(estimate, [item]).itemCalculations;
  assert.doesNotThrow(() => verifyCalculationBundleCorrespondence([item], bundle));
  assert.throws(() => verifyCalculationBundleCorrespondence([item, { ...item, id: allowanceId }], [bundle[0], bundle[0]]), /duplicate item ID/);
  assert.throws(() => verifyCalculationBundleCorrespondence([item], []), /complete item set/);
  assert.throws(() => verifyCalculationBundleCorrespondence([item], [...bundle, { ...bundle[0], id: allowanceId }]), /complete item set/);
  assert.throws(() => verifyCalculationBundleCorrespondence([item], [{ ...bundle[0], material_unit_cost: "0.0000" }]), /material_unit_cost/);
});

test("create update and delete proposed models recalculate exact totals", () => {
  const standard = parseCanonicalItem(standardId, itemBody());
  const created = calculateMutation(estimate, [standard]);
  assert.equal(created.estimateCalculation.total_price, "0.02");
  const updatedItem = parseCanonicalItem(standardId, { quantity: "2.0000" }, standard);
  const updated = calculateMutation(estimate, [updatedItem]);
  assert.equal(updated.estimateCalculation.total_price, "0.04");
  const deleted = calculateMutation(estimate, []);
  assert.equal(deleted.estimateCalculation.total_price, "0.00");
  assert.equal(deleted.itemCalculations.length, 0);
});
