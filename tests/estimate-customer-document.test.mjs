import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { calculateEstimate } = await import("../src/lib/estimate-calculations.ts");
const { buildEstimateCustomerDocument } = await import("../src/lib/estimate-customer-document.ts");
const presentationRoute = readFileSync("src/app/api/estimates/[estimateId]/presentation/route.ts", "utf8");
const previewComponent = readFileSync("src/components/estimates/estimate-customer-preview.tsx", "utf8");

function fixture(detailLevel = "lump_sum", ohpMode = "distributed") {
  const items = [{
    id: "00000000-0000-4000-8000-000000000001", sectionId: "00000000-0000-4000-8000-000000000010",
    itemType: "standard", quantity: "2", unit: "package", customerDescription: "Deck materials",
    internalDescription: "Private supplier detail", materialUnitCost: "1000", laborUnitCost: "0",
    subcontractorUnitCost: "0", equipmentUnitCost: "0", otherDirectUnitCost: "0",
    materialWastePercent: "0", itemMarkupPercent: "0", taxable: false, included: true,
    fixedCustomerPrice: null, sortOrder: 0,
  }];
  const calculation = calculateEstimate({ items: [{
    id: items[0].id, kind: "standard", customerDescription: items[0].customerDescription,
    quantity: items[0].quantity, unit: items[0].unit, wastePercent: "0", taxable: false, included: true,
    costs: { materialUnitCost: "1000", laborUnitCost: "0", subcontractorUnitCost: "0", equipmentUnitCost: "0", otherDirectUnitCost: "0" }, itemMarkupPercent: "0",
  }], overheadPercent: "20", profitMarkupPercent: "0", discountAmount: "0", taxPercent: "0" });
  return { state: { estimate: {
    id: "00000000-0000-4000-8000-000000000100", title: "Deck estimate", description: null,
    property_address: "123 Main Street", valid_until: "2026-09-08", scope_notes: "Build the described deck",
    exclusions: "Permit fees", customer_notes: null, presentation_version: "estimate-presentation-v1",
    presentation_detail_level: detailLevel, presentation_ohp_mode: ohpMode,
    presentation_lump_sum_label: "Complete deck construction",
  }, items, sections: [{ id: items[0].sectionId, name: "Deck construction" }] }, calculation };
}

test("customer document exposes a clean lump sum without internal pricing fields", () => {
  const { state, calculation } = fixture();
  const document = buildEstimateCustomerDocument(state, calculation);
  assert.deepEqual(document.presentation.rows, [{ id: "lump-sum", kind: "item", description: "Complete deck construction", totalCents: "240000" }]);
  assert.equal("quantity" in document.presentation.rows[0], false);
  const forbiddenKeys = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (/cost|profit|markup|internal/i.test(key)) forbiddenKeys.push(key);
      visit(child);
    }
  };
  visit(document);
  assert.deepEqual(forbiddenKeys, []);
});

test("itemized customer document can show a separate OH&P line and reconciles", () => {
  const { state, calculation } = fixture("itemized", "separate_line_item");
  const document = buildEstimateCustomerDocument(state, calculation);
  assert.deepEqual(document.presentation.rows.map(({ description, totalCents }) => ({ description, totalCents })), [
    { description: "Deck materials", totalCents: "200000" },
    { description: "Overhead & profit", totalCents: "40000" },
  ]);
  assert.equal(document.presentation.rows.reduce((sum, row) => sum + BigInt(row.totalCents), 0n), BigInt(document.presentation.totalCents));
});

test("customer document fails closed for unsupported or incomplete snapshots", () => {
  const { state, calculation } = fixture();
  assert.throws(() => buildEstimateCustomerDocument({ ...state, estimate: { ...state.estimate, presentation_version: null } }, calculation), /supported customer presentation snapshot/);
  assert.throws(() => buildEstimateCustomerDocument({ ...state, estimate: { ...state.estimate, presentation_detail_level: "private_cost_sheet" } }, calculation), /supported customer detail level/);
});

test("printable preview is authenticated, projected, and never cached", () => {
  assert.match(presentationRoute, /authorizeEstimateRequest\(request, estimateId\)/);
  assert.match(presentationRoute, /buildEstimateCustomerDocument\(state, calculation\)/);
  assert.match(presentationRoute, /"Cache-Control": "no-store"/);
  assert.match(presentationRoute, /status: error instanceof TypeError \? 422 : 500/);
  assert.doesNotMatch(presentationRoute, /document:\s*state|estimate:\s*state\.estimate|items:\s*state\.items/);
  assert.match(previewComponent, /\/presentation`, \{ cache: "no-store" \}/);
  assert.doesNotMatch(previewComponent, /internalDescription|directCost|grossProfit|markupPercent|overheadPercent/);
});
