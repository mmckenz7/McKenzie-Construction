import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const {
  calculateMutation,
  completeCommittedMutationState,
  loadBuilderState,
  loadPostMutationBuilderState,
  MutationStateChangedError,
  projectBuilderState,
} = await import("../src/lib/estimate-mutations.ts");

const estimateId = "44444444-4444-4444-8444-444444444444";
const firstSectionId = "11111111-1111-4111-8111-111111111111";
const secondSectionId = "55555555-5555-4555-8555-555555555555";
const standardId = "22222222-2222-4222-8222-222222222222";
const allowanceId = "33333333-3333-4333-8333-333333333333";
const estimate = {
  id: estimateId, title: "Kitchen", status: "draft",
  calculation_policy_version: "structured-estimate-v1", calculation_revision: 7,
  overhead_percent_text: "0.000", profit_markup_percent_text: "0.000",
  tax_rate_percent_text: "0.000", discount_value_text: "0.00",
};
const standard = {
  id: standardId, sectionId: secondSectionId, itemType: "standard",
  quantity: "0", unit: "ea", customerDescription: "Framing", internalDescription: "Crew note",
  materialUnitCost: null, laborUnitCost: "0", subcontractorUnitCost: "1.25",
  equipmentUnitCost: "0", otherDirectUnitCost: "0", materialWastePercent: "5",
  itemMarkupPercent: "10", taxable: true, included: true, fixedCustomerPrice: null, sortOrder: 0,
};
const allowance = {
  id: allowanceId, sectionId: firstSectionId, itemType: "allowance",
  quantity: "1", unit: "allowance", customerDescription: "Tile", internalDescription: null,
  materialUnitCost: null, laborUnitCost: null, subcontractorUnitCost: null,
  equipmentUnitCost: null, otherDirectUnitCost: null, materialWastePercent: "0",
  itemMarkupPercent: null, taxable: false, included: true, fixedCustomerPrice: "2500", sortOrder: 4,
};
const sections = [
  { id: secondSectionId, name: "Second", customer_description: "Later", internal_notes: "B", sort_order: 2 },
  { id: firstSectionId, name: "First", customer_description: null, internal_notes: "A", sort_order: 0 },
];
const state = { estimate, items: [standard, allowance], sections };
const calculation = calculateMutation(estimate, state.items).calculation;

function project(canEditPrices, canViewCosts, canViewProfit) {
  return projectBuilderState(state, calculation, { canEditPrices, canViewCosts, canViewProfit });
}

test("builder state is ordered, camelCase, revisioned, and capability explicit", () => {
  const result = project(false, true, true);
  assert.equal(result.calculationRevision, 7);
  assert.deepEqual(result.capabilities, { canEditPrices: false, canViewCosts: true, canViewProfit: true });
  assert.deepEqual(result.sections.map((section) => section.id), [firstSectionId, secondSectionId]);
  assert.deepEqual(result.items.map((item) => item.id), [allowanceId, standardId]);
  assert.deepEqual(result.sections[0], { id: firstSectionId, name: "First", customerDescription: null, internalNotes: "A", sortOrder: 0 });
  assert.equal(result.items[1].sectionId, secondSectionId);
  assert.equal(result.items[1].sortOrder, 0);
  assert.equal(result.items[1].internalDescription, "Crew note");
  assert.equal(result.estimate.calculationRevision, result.calculationRevision);
});

test("visible costs preserve unknown null separately from explicit zero", () => {
  const item = project(true, true, true).items.find((entry) => entry.id === standardId);
  assert.equal(item.materialUnitCost, null);
  assert.equal(item.laborUnitCost, "0");
  assert.equal(item.equipmentUnitCost, "0");
  assert.equal(item.materialWastePercent, "5");
  assert.equal(item.itemMarkupPercent, "10");
  assert.equal("fixedCustomerPrice" in item, false);
});

test("hidden financial canonical inputs are omitted rather than replaced with null", () => {
  for (const permissions of [[false, false], [false, true], [true, false]]) {
    const [canViewCosts, canViewProfit] = permissions;
    const result = project(true, canViewCosts, canViewProfit);
    const item = result.items.find((entry) => entry.id === standardId);
    if (!canViewCosts) {
      for (const key of ["materialUnitCost", "laborUnitCost", "subcontractorUnitCost", "equipmentUnitCost", "otherDirectUnitCost", "materialWastePercent"]) {
        assert.equal(key in item, false);
      }
    }
    assert.equal("itemMarkupPercent" in item, canViewCosts && canViewProfit);
    if (!(canViewCosts && canViewProfit)) {
      assert.equal("itemMarkupCents" in item, false);
      assert.equal("itemMarkupTotalCents" in result.estimate.calculation, false);
    }
  }
});

test("allowances expose authoritative fixed price but no standard-only markup", () => {
  const item = project(false, false, false).items.find((entry) => entry.id === allowanceId);
  assert.equal(item.itemType, "allowance");
  assert.equal(item.fixedCustomerPrice, "2500");
  assert.equal("itemMarkupPercent" in item, false);
  assert.equal("materialUnitCost" in item, false);
});

test("cost and profit calculated outputs remain independently projected", () => {
  const costsOnly = project(false, true, false).estimate.calculation;
  assert.equal("directCostCents" in costsOnly, true);
  assert.equal("grossProfitCents" in costsOnly, false);
  const profitOnly = project(false, false, true).estimate.calculation;
  assert.equal("directCostCents" in profitOnly, false);
  assert.equal("grossProfitCents" in profitOnly, true);
  const neither = project(false, false, false).estimate.calculation;
  assert.equal("directCostCents" in neither, false);
  assert.equal("grossProfitCents" in neither, false);
});

function storedItem(item) {
  return {
    id: item.id, section_id: item.sectionId, item_type: item.itemType,
    quantity_text: item.quantity, unit: item.unit, customer_description: item.customerDescription,
    internal_description: item.internalDescription, material_unit_cost_text: item.materialUnitCost,
    labor_unit_cost_text: item.laborUnitCost, subcontractor_unit_cost_text: item.subcontractorUnitCost,
    equipment_unit_cost_text: item.equipmentUnitCost, other_direct_unit_cost_text: item.otherDirectUnitCost,
    material_waste_percent_text: item.materialWastePercent, item_markup_percent_text: item.itemMarkupPercent,
    taxable: item.taxable, is_included: item.included, fixed_customer_price_text: item.fixedCustomerPrice,
    sort_order: item.sortOrder,
  };
}

function supabaseForRevisions(revisions) {
  let estimateRead = 0;
  const resultFor = (table, selection) => {
    if (table === "estimate_line_items") return { data: [storedItem(standard), storedItem(allowance)], error: null };
    if (table === "estimate_sections") return { data: sections, error: null };
    const revision = revisions[estimateRead++];
    return selection.startsWith("status,")
      ? { data: { status: "draft", calculation_policy_version: "structured-estimate-v1", calculation_revision: revision }, error: null }
      : { data: { ...estimate, calculation_revision: revision }, error: null };
  };
  return {
    get estimateReads() { return estimateRead; },
    from(table) {
      let selection = "";
      const query = {
        select(value) { selection = value.trim(); return query; },
        eq() { return query; },
        order() { return query; },
        maybeSingle() { return Promise.resolve(resultFor(table, selection)); },
        then(resolve, reject) { return Promise.resolve(resultFor(table, selection)).then(resolve, reject); },
      };
      return query;
    },
  };
}

test("revision-fenced builder loading retries only the read and returns one stable revision", async () => {
  const supabase = supabaseForRevisions([7, 8, 8, 8]);
  const result = await loadBuilderState(supabase, estimateId, { canEditPrices: true, canViewCosts: true, canViewProfit: true });
  assert.equal(result.calculationRevision, 8);
  assert.equal(result.estimate.calculationRevision, 8);
  assert.equal(supabase.estimateReads, 4);
});

test("revision-fenced builder loading rejects two mixed-revision reads", async () => {
  const supabase = supabaseForRevisions([7, 8, 8, 9]);
  await assert.rejects(
    loadBuilderState(supabase, estimateId, { canEditPrices: true, canViewCosts: true, canViewProfit: true }),
    MutationStateChangedError,
  );
});

test("post-mutation loading rejects a state older than the completed RPC revision", async () => {
  const supabase = supabaseForRevisions([7, 7]);
  await assert.rejects(
    loadPostMutationBuilderState(supabase, estimateId, { canEditPrices: true, canViewCosts: true, canViewProfit: true }, 8),
    MutationStateChangedError,
  );
});

test("committed mutation completion converts older state into a safe section reload response", async () => {
  const result = await completeCommittedMutationState(
    supabaseForRevisions([7, 7]), estimateId,
    { canEditPrices: true, canViewCosts: true, canViewProfit: true },
    8, "sectionId", firstSectionId,
  );
  assert.deepEqual(result, {
    ok: false,
    status: 409,
    body: {
      success: false,
      error: "mutation_committed_state_reload_required",
      mutationCommitted: true,
      calculationRevision: 8,
      nextCalculationRevision: 8,
      reloadRequired: true,
      sectionId: firstSectionId,
      message: "The mutation was committed, but the latest estimate state must be reloaded with GET.",
    },
  });
});

test("committed mutation completion handles null and unexpected reload failures without leaking details", async () => {
  const permissions = { canEditPrices: true, canViewCosts: true, canViewProfit: true };
  const missing = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); } }; } };
  const broken = { from() { throw new Error("secret database detail"); } };
  for (const [client, field, identifier] of [
    [missing, "deletedSectionId", firstSectionId],
    [broken, "itemId", standardId],
    [broken, "deletedItemId", allowanceId],
  ]) {
    const result = await completeCommittedMutationState(client, estimateId, permissions, 8, field, identifier);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "mutation_committed_state_reload_required");
    assert.equal(result.body.mutationCommitted, true);
    assert.equal(result.body.reloadRequired, true);
    assert.equal(result.body.calculationRevision, 8);
    assert.equal(result.body.nextCalculationRevision, 8);
    assert.equal(result.body[field], identifier);
    assert.equal(JSON.stringify(result).includes("secret database detail"), false);
    assert.equal(JSON.stringify(result).includes("stale_calculation_revision"), false);
  }
});

test("all seven mutation operation contracts preserve their committed resource identifier", async () => {
  const permissions = { canEditPrices: true, canViewCosts: false, canViewProfit: false };
  const operations = [
    ["estimate setup update", "estimateId", estimateId],
    ["section create", "sectionId", firstSectionId],
    ["section update", "sectionId", secondSectionId],
    ["section delete", "deletedSectionId", firstSectionId],
    ["item create", "itemId", standardId],
    ["item update", "itemId", allowanceId],
    ["item delete", "deletedItemId", standardId],
  ];
  for (const [operation, field, identifier] of operations) {
    const missing = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); } }; } };
    const result = await completeCommittedMutationState(missing, estimateId, permissions, 12, field, identifier);
    assert.equal(result.ok, false, operation);
    assert.equal(result.status, 409, operation);
    assert.equal(result.body[field], identifier, operation);
    assert.equal(result.body.calculationRevision, 12, operation);
    assert.equal(result.body.nextCalculationRevision, 12, operation);
    assert.equal(result.body.mutationCommitted, true, operation);
    assert.equal(result.body.reloadRequired, true, operation);
  }
});

test("committed mutation completion returns a complete authoritative state after a successful reload", async () => {
  const result = await completeCommittedMutationState(
    supabaseForRevisions([8, 8]), estimateId,
    { canEditPrices: true, canViewCosts: true, canViewProfit: true },
    8, "itemId", standardId,
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.calculationRevision, 8);
  assert.equal(result.state.estimate.calculationRevision, 8);
  assert.equal(result.state.sections.length, 2);
  assert.equal(result.state.items.length, 2);
});

test("all seven routes use the same authoritative builder-state envelope", () => {
  const routePaths = [
    "src/app/api/estimates/[estimateId]/route.ts",
    "src/app/api/estimates/[estimateId]/sections/route.ts",
    "src/app/api/estimates/[estimateId]/sections/[sectionId]/route.ts",
    "src/app/api/estimates/[estimateId]/items/route.ts",
    "src/app/api/estimates/[estimateId]/items/[itemId]/route.ts",
  ];
  const sources = routePaths.map((path) => readFileSync(path, "utf8"));
  assert.equal((sources[0].match(/loadBuilderState\(/g) ?? []).length, 1);
  assert.equal((sources[0].match(/completeCommittedMutationState\(/g) ?? []).length, 1);
  assert.equal((sources.slice(1).join("\n").match(/completeCommittedMutationState\(/g) ?? []).length, 6);
  assert.match(sources[0], /nextCalculationRevision: completion\.state\.calculationRevision/);
  assert.match(sources[0], /\.\.\.completion\.state/);
  assert.equal((sources.slice(1).join("\n").match(/nextCalculationRevision: builderState\.calculationRevision/g) ?? []).length, 6);
  assert.equal((sources.slice(1).join("\n").match(/\.\.\.builderState/g) ?? []).length, 6);
  assert.doesNotMatch(sources.slice(1).join("\n"), /projectMutationState|nextCalculationRevision: outcome/);
});

test("builder projection contains no persistence or compatibility mirror keys", () => {
  const serialized = JSON.stringify(project(true, true, true));
  for (const forbidden of ["section_id", "sort_order", "line_type", "base_unit_cost", "estimated_profit", "requested_item_calculations", "metadata", "material_catalog_id"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
