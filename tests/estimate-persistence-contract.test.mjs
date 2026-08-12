import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { calculateEstimate } = await import("../src/lib/estimate-calculations.ts");
const {
  buildEstimateCalculationPersistence,
  centsToPostgresNumeric,
  defaultEstimateValidUntil,
  isStructuredLeadDraftUniqueViolation,
  legacySentinelToNullable,
  milliPercentToPostgresNumeric,
  optionalIsoCalendarDate,
  postgresNumericToDecimalString,
  projectPersistedEstimate,
  storedLineItemToCalculationInput,
} = await import("../src/lib/estimate-persistence.ts");

const persistenceSource = readFileSync("src/lib/estimate-persistence.ts", "utf8");

test("exact numeric conversion never passes through Number", () => {
  assert.equal(postgresNumericToDecimalString("9007199254740993.1200", "value"), "9007199254740993.12");
  assert.equal(centsToPostgresNumeric(123456789012345678901n), "1234567890123456789.01");
  assert.equal(centsToPostgresNumeric(-1n), "-0.01");
  assert.equal(milliPercentToPostgresNumeric(12345n), "12.345");
  assert.throws(() => postgresNumericToDecimalString(1.25, "value"), /exact PostgreSQL numeric string/);
  assert.doesNotMatch(persistenceSource, /\bNumber\s*\(|parseFloat|toFixed|Math\.round/);
});

test("calendar dates are validated without locale-dependent parsing", () => {
  assert.equal(optionalIsoCalendarDate("2024-02-29"), "2024-02-29");
  assert.equal(optionalIsoCalendarDate("2026-12-31"), "2026-12-31");
  assert.equal(optionalIsoCalendarDate(null), null);
  assert.throws(() => optionalIsoCalendarDate("2026-02-30"), /real calendar date/);
  assert.throws(() => optionalIsoCalendarDate("2026-13-01"), /real calendar date/);
  assert.throws(() => optionalIsoCalendarDate("2026-2-01"), /YYYY-MM-DD/);
  assert.throws(() => optionalIsoCalendarDate("0000-01-01"), /real calendar date/);
});

test("new estimates default to 30 company-calendar days", () => {
  assert.equal(
    defaultEstimateValidUntil(new Date("2026-08-07T01:30:00.000Z")),
    "2026-09-05",
  );
  assert.equal(
    defaultEstimateValidUntil(new Date("2026-12-20T17:00:00.000Z")),
    "2027-01-19",
  );
});

test("draft race recovery recognizes only the intended unique index", () => {
  const intended = "estimates_one_structured_draft_per_lead_uidx";
  assert.equal(isStructuredLeadDraftUniqueViolation({ code: "23505", details: `Key violates ${intended}` }), true);
  assert.equal(isStructuredLeadDraftUniqueViolation({ code: "23505", message: `duplicate key on ${intended}` }), true);
  assert.equal(isStructuredLeadDraftUniqueViolation({ code: "23505", message: "estimates_pkey" }), false);
  assert.equal(isStructuredLeadDraftUniqueViolation({ code: "23503", message: intended }), false);
  assert.equal(isStructuredLeadDraftUniqueViolation(null), false);
});

test("stored items preserve unknown costs and exact decimal strings", () => {
  const item = storedLineItemToCalculationInput({
    id: "item-1", item_type: "standard", customer_description: "Framing",
    quantity_text: "2.5000", unit: "ea", material_waste_percent_text: "5.000",
    item_markup_percent_text: "20.000", taxable: true, is_included: true,
    material_unit_cost_text: "10.2500", labor_unit_cost_text: null,
    subcontractor_unit_cost_text: "0.0000", equipment_unit_cost_text: "0.0000",
    other_direct_unit_cost_text: "0.0000", fixed_customer_price_text: null,
  });
  assert.equal(item.quantity, "2.5");
  assert.equal(item.costs.materialUnitCost, "10.25");
  assert.equal(item.costs.laborUnitCost, null);
});

test("compatibility persistence uses zero sentinels only with completeness flags", () => {
  const calculation = calculateEstimate({
    items: [{
      id: "unknown", kind: "standard", customerDescription: "Unknown", quantity: "1", unit: "ea",
      wastePercent: "0", taxable: true, included: true,
      costs: { materialUnitCost: null, laborUnitCost: "0", subcontractorUnitCost: "0", equipmentUnitCost: "0", otherDirectUnitCost: "0" },
      itemMarkupPercent: "10",
    }],
    overheadPercent: "0", profitMarkupPercent: "0", discountAmount: "0", taxPercent: "0",
  });
  const stored = buildEstimateCalculationPersistence(calculation);
  assert.equal(stored.costs_complete, false);
  assert.equal(stored.subtotal_cost, "0.00");
  assert.equal(legacySentinelToNullable("0.00", false), null);
  assert.equal(legacySentinelToNullable("0.00", true), "0");
});

test("all four permission projections are immutable and JSON safe", () => {
  const calculation = calculateEstimate({ items: [], overheadPercent: "10", profitMarkupPercent: "5", discountAmount: "0", taxPercent: "8" });
  const record = {
    id: "estimate", title: "Kitchen", status: "draft", calculation_policy_version: "structured-estimate-v1",
    calculation_revision: 0, overhead_percent_text: "10.000", profit_markup_percent_text: "5.000",
    tax_rate_percent_text: "8.000", discount_value_text: "0.00",
  };
  for (const permissions of [
    { canViewCosts: true, canViewProfit: true },
    { canViewCosts: true, canViewProfit: false },
    { canViewCosts: false, canViewProfit: true },
    { canViewCosts: false, canViewProfit: false },
  ]) {
    const projected = projectPersistedEstimate(record, calculation, permissions);
    assert.doesNotThrow(() => JSON.stringify(projected));
    assert.equal("directCostCents" in projected.calculation, permissions.canViewCosts);
    assert.equal("overheadPercent" in projected, permissions.canViewProfit);
    assert.equal("grossProfitCents" in projected.calculation, permissions.canViewProfit);
    assert.equal(projected.calculation.customerTotalCents, "0");
    assert.equal(Object.isFrozen(projected), true);
  }
});

test("client-calculated fields are never persistence inputs", () => {
  assert.doesNotMatch(persistenceSource, /input\.(?:total|tax|profit|margin|subtotal|directCost)/);
  assert.match(persistenceSource, /calculateEstimateForStoredPolicy\(/);
  assert.match(persistenceSource, /policyVersion !== "structured-estimate-v1"/);
  assert.match(persistenceSource, /policyVersion !== "structured-estimate-v2-material-tax"/);
  assert.match(persistenceSource, /calculation_policy_version: calculation\.policyVersion/);
});
