import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const {
  buildItemMutationBody,
  canMutateEstimate,
  formatCents,
  loadEstimateBuilder,
  nullableDecimalInput,
  DECIMAL_PATTERNS,
  runEstimateBuilderMutation,
  retryRequiredBuilderReload,
  satisfiesRevisionRequirement,
  isBuilderEnvelope,
} = await import("../src/lib/estimate-builder-client.ts");

const estimateId = "11111111-1111-4111-8111-111111111111";
const state = {
  success: true,
  calculationRevision: 4,
  capabilities: { canEditPrices: true, canViewCosts: true, canViewProfit: true },
  estimate: { id: estimateId, title: "Kitchen", status: "draft", calculationPolicyVersion: "structured-estimate-v1", calculationRevision: 4, calculation: {
    policyVersion: "structured-estimate-v1", items: [], itemPriceSubtotalCents: "12345",
    preDiscountCustomerSubtotalCents: "12345", discountCents: "0", postDiscountSubtotalCents: "12345",
    taxableSubtotalCents: "0", taxCents: "0", customerTotalCents: "12345",
  } },
  sections: [{ id: "22222222-2222-4222-8222-222222222222", name: "Demo", customerDescription: null, internalNotes: null, sortOrder: 0 }],
  items: [],
};
const nextState = { ...state, calculationRevision: 5, estimate: { ...state.estimate, calculationRevision: 5 } };

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function stateAtRevision(calculationRevision) {
  return { ...state, calculationRevision, estimate: { ...state.estimate, calculationRevision } };
}

function committedReloadBody(calculationRevision) {
  return {
    success: false,
    error: "mutation_committed_state_reload_required",
    mutationCommitted: true,
    reloadRequired: true,
    calculationRevision,
    nextCalculationRevision: calculationRevision,
  };
}

test("initial loading accepts only a complete authoritative builder envelope", async () => {
  const calls = [];
  const result = await loadEstimateBuilder(async (path, init) => { calls.push([path, init]); return response(200, state); }, estimateId);
  assert.equal(result, state);
  assert.deepEqual(calls, [[`/api/estimates/${estimateId}`, { cache: "no-store" }]]);
  await assert.rejects(loadEstimateBuilder(async () => response(403, { success: false, error: "Forbidden" }), estimateId), /Forbidden/);
});

test("malformed HTTP success uses a stable safe initial-load error", async () => {
  const sensitive = "database password was exposed";
  await assert.rejects(
    loadEstimateBuilder(async () => response(200, { success: true, error: sensitive }), estimateId),
    (error) => error instanceof Error
      && error.message === "The estimate data could not be loaded. Please try again."
      && !error.message.includes(sensitive),
  );
});

test("successful mutation sends the current revision and replaces the complete state", async () => {
  const calls = [];
  const result = await runEstimateBuilderMutation(async (path, init) => {
    calls.push([path, init]); return response(201, nextState);
  }, estimateId, state, { path: `/api/estimates/${estimateId}/sections`, method: "POST", body: { name: "New", customerDescription: null, internalNotes: null, sortOrder: 10 } });
  assert.equal(result.state, nextState);
  assert.equal(result.notice, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1].body), { name: "New", customerDescription: null, internalNotes: null, sortOrder: 10, expectedCalculationRevision: 4 });
});

test("stale mutation is never retried and reloads authoritative state", async () => {
  const calls = [];
  const result = await runEstimateBuilderMutation(async (path, init) => {
    calls.push([path, init]);
    return calls.length === 1
      ? response(409, { success: false, code: "stale_calculation_revision" })
      : response(200, nextState);
  }, estimateId, state, { path: `/api/estimates/${estimateId}/items/x`, method: "PATCH", body: { quantity: "2" } });
  assert.equal(calls.length, 2);
  assert.equal(calls.filter(([, init]) => init?.method === "PATCH").length, 1);
  assert.equal(result.state, nextState);
  assert.match(result.notice, /before your edit was saved/);
  assert.equal(result.committed, false);
});

test("committed reload-required response is never retried and reports the edit saved", async () => {
  const calls = [];
  const result = await runEstimateBuilderMutation(async (path, init) => {
    calls.push([path, init]);
    return calls.length === 1
      ? response(409, committedReloadBody(5))
      : response(200, nextState);
  }, estimateId, state, { path: `/api/estimates/${estimateId}/items/x`, method: "DELETE", body: {} });
  assert.equal(calls.filter(([, init]) => init?.method === "DELETE").length, 1);
  assert.equal(result.state, nextState);
  assert.match(result.notice, /edit was saved/);
  assert.equal(result.committed, true);
});

test("failed recovery preserves state and distinguishes committed from stale", async () => {
  for (const [body, saved] of [
    [{ code: "stale_calculation_revision" }, false],
    [committedReloadBody(5), true],
  ]) {
    let calls = 0;
    const result = await runEstimateBuilderMutation(async () => {
      calls += 1; return calls === 1 ? response(409, body) : response(500, { error: "reload failed" });
    }, estimateId, state, { path: "/mutation", method: "POST", body: {} });
    assert.equal(result.state, state);
    assert.equal(result.recoveryFailed, true);
    assert.equal(result.committed, saved);
    assert.match(result.notice, saved ? /edit was saved/ : /before your edit was saved/);
  }
});

function draft(overrides = {}) {
  return {
    itemType: "standard", sectionId: state.sections[0].id, customerDescription: "Framing", internalDescription: "",
    quantity: "0", unit: "ea", materialUnitCost: "", laborUnitCost: "0", subcontractorUnitCost: "1.2500",
    equipmentUnitCost: "0", otherDirectUnitCost: "0", materialWastePercent: "0", itemMarkupPercent: "0",
    fixedCustomerPrice: "", taxable: true, included: true, sortOrder: "0", showCosts: true, showMarkup: true,
    ...overrides,
  };
}

test("standard payload preserves blank cost, explicit zero, zero quantity and zero markup", () => {
  const body = buildItemMutationBody(draft(), true);
  assert.equal(body.materialUnitCost, null);
  assert.equal(body.laborUnitCost, "0");
  assert.equal(body.quantity, "0");
  assert.equal(body.itemMarkupPercent, "0");
  assert.equal("customerPriceCents" in body, false);
});

test("hidden financial inputs are omitted from standard PATCH payloads", () => {
  const body = buildItemMutationBody(draft({ showCosts: false, showMarkup: false }), false);
  for (const field of ["materialUnitCost", "laborUnitCost", "materialWastePercent", "itemMarkupPercent", "fixedCustomerPrice"]) {
    assert.equal(field in body, false);
  }
});

test("allowance payload is discriminated and preserves explicit zero customer price", () => {
  const body = buildItemMutationBody(draft({ itemType: "allowance", fixedCustomerPrice: "0", showCosts: false, showMarkup: false }), true);
  assert.equal(body.fixedCustomerPrice, "0");
  assert.equal(body.materialWastePercent, "0");
  for (const field of ["materialUnitCost", "laborUnitCost", "itemMarkupPercent"]) assert.equal(field in body, false);
});

test("decimal inputs remain strings and invalid precision fails before submission", () => {
  assert.equal(nullableDecimalInput("", DECIMAL_PATTERNS.unitCost, "Cost"), null);
  assert.equal(nullableDecimalInput("0", DECIMAL_PATTERNS.unitCost, "Cost"), "0");
  assert.throws(() => buildItemMutationBody(draft({ quantity: "1.00000" }), true), /valid nonnegative decimal/);
  assert.equal(formatCents("0"), "$0.00");
  assert.equal(formatCents("12345"), "$123.45");
});

test("builder component keeps permissions, pending lock, confirmations and API-only writes", () => {
  const source = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
  assert.match(source, /pendingRef\.current/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /canMutateEstimate/);
  assert.match(source, /"materialUnitCost" in item/);
  assert.match(source, /"itemMarkupCents" in item/);
  assert.match(source, /buildItemMutationBody/);
  assert.match(source, /Edit estimate setup/);
  assert.match(source, /overheadPercent/);
  assert.match(source, /profitMarkupPercent/);
  assert.match(source, /taxRatePercent/);
  assert.match(source, /discountAmount/);
  assert.match(source, /method: "PATCH"/);
  assert.doesNotMatch(source, /supabase|calculateEstimate|Math\.round|parseFloat/);
});

test("estimate queue can create a draft and route directly to its builder", () => {
  const page = readFileSync("src/app/sales/estimates/page.tsx", "utf8");
  const button = readFileSync("src/components/estimates/start-estimate-button.tsx", "utf8");
  assert.match(page, /StartEstimateButton/);
  assert.match(button, /fetch\("\/api\/estimates"/);
  assert.match(button, /method: "POST"/);
  assert.match(button, /leadId/);
  assert.match(button, /router\.push\(`\/sales\/estimates\/\$\{encodeURIComponent\(estimateId\)\}`\)/);
  assert.doesNotMatch(button, /supabase|service.role|calculateEstimate/i);
});

test("strict envelope validation rejects malformed permissions, estimates, revisions and collections", () => {
  const invalid = [
    { ...state, capabilities: { canEditPrices: true, canViewCosts: true } },
    { ...state, capabilities: { ...state.capabilities, canViewProfit: "yes" } },
    { ...state, estimate: { ...state.estimate, id: "" } },
    { ...state, estimate: { ...state.estimate, status: null } },
    { ...state, estimate: { ...state.estimate, calculation: null } },
    { ...state, estimate: { ...state.estimate, calculation: { ...state.estimate.calculation, taxCents: 0 } } },
    { ...state, estimate: { ...state.estimate, calculationRevision: 3 } },
    { ...state, nextCalculationRevision: 5 },
    { ...state, sections: [{ ...state.sections[0], sortOrder: -1 }] },
    { ...state, sections: [state.sections[0], state.sections[0]] },
    { ...state, items: [{ id: "i", sectionId: state.sections[0].id, itemType: "other", customerDescription: "x", internalDescription: null, quantity: "1", unit: "ea", taxable: false, included: true, sortOrder: 0, customerPriceCents: "0" }] },
  ];
  for (const value of invalid) assert.equal(isBuilderEnvelope(value), false);
});

test("builder envelope requires consistent structured calculation policies", () => {
  assert.equal(isBuilderEnvelope(state), true);
  const { calculationPolicyVersion: _missing, ...estimateWithoutPolicy } = state.estimate;
  const invalid = [
    { ...state, estimate: estimateWithoutPolicy },
    { ...state, estimate: { ...state.estimate, calculationPolicyVersion: "legacy" } },
    { ...state, estimate: { ...state.estimate, calculation: { ...state.estimate.calculation, policyVersion: undefined } } },
    { ...state, estimate: { ...state.estimate, calculation: { ...state.estimate.calculation, policyVersion: "legacy" } } },
    { ...state, estimate: { ...state.estimate, calculationPolicyVersion: "legacy", calculation: { ...state.estimate.calculation, policyVersion: "structured-estimate-v1" } } },
  ];
  for (const value of invalid) assert.equal(isBuilderEnvelope(value), false);
});

test("calculated gross margin accepts signed decimals without loosening canonical inputs", () => {
  for (const grossMarginPercent of ["-12.500", "-0.01", "0", "12.5"]) {
    assert.equal(isBuilderEnvelope({ ...state, estimate: { ...state.estimate, calculation: { ...state.estimate.calculation, grossMarginPercent } } }), true);
  }
  for (const grossMarginPercent of ["", "+1", "1e2", "--1", ".5", 0]) {
    assert.equal(isBuilderEnvelope({ ...state, estimate: { ...state.estimate, calculation: { ...state.estimate.calculation, grossMarginPercent } } }), false);
  }

  const standard = { id: "item-negative", sectionId: state.sections[0].id, itemType: "standard", customerDescription: "x", internalDescription: null, quantity: "1", unit: "ea", taxable: false, included: true, sortOrder: 0, customerPriceCents: "0", materialUnitCost: "0", materialWastePercent: "0", itemMarkupPercent: "0" };
  for (const field of ["quantity", "materialUnitCost", "materialWastePercent", "itemMarkupPercent"]) {
    assert.equal(isBuilderEnvelope({ ...state, items: [{ ...standard, [field]: "-0.01" }] }), false);
  }
  assert.equal(isBuilderEnvelope({ ...state, items: [{ ...standard, itemType: "allowance", fixedCustomerPrice: "-0.01" }] }), false);
});

test("strict item validation rejects duplicate, orphaned and malformed financial state", () => {
  const standard = { id: "item-1", sectionId: state.sections[0].id, itemType: "standard", customerDescription: "x", internalDescription: null, quantity: "0", unit: "ea", taxable: false, included: true, sortOrder: 0, customerPriceCents: "0", materialUnitCost: null, laborUnitCost: "0" };
  const allowance = { ...standard, id: "item-2", itemType: "allowance", fixedCustomerPrice: "0" };
  assert.equal(isBuilderEnvelope({ ...state, items: [standard, allowance] }), true);
  assert.equal(isBuilderEnvelope({ ...state, items: [standard, standard] }), false);
  assert.equal(isBuilderEnvelope({ ...state, items: [{ ...standard, sectionId: "missing" }] }), false);
  assert.equal(isBuilderEnvelope({ ...state, items: [{ ...standard, materialUnitCost: 0 }] }), false);
  assert.equal(isBuilderEnvelope({ ...state, items: [{ ...standard, customerPriceCents: 0 }] }), false);
  assert.equal(isBuilderEnvelope({ ...state, items: [{ ...standard, fixedCustomerPrice: "1" }] }), false);
  assert.equal(isBuilderEnvelope({ ...state, items: [{ ...allowance, itemMarkupPercent: "1" }] }), false);
});

test("malformed HTTP success performs GET recovery without repeating the mutation", async () => {
  const calls = [];
  const result = await runEstimateBuilderMutation(async (path, init) => {
    calls.push([path, init]);
    return calls.length === 1 ? response(200, { success: true }) : response(200, nextState);
  }, estimateId, state, { path: "/mutation", method: "POST", body: {} });
  assert.equal(calls.filter(([, init]) => init?.method === "POST").length, 1);
  assert.equal(result.state, nextState);
  assert.equal(result.outcome, "ambiguous_recovered");
  assert.equal(result.closeSubmittedForm, true);
  assert.match(result.notice, /required a refresh/);
});

test("committed or ambiguous failed recovery locks later mutations until GET succeeds", async () => {
  let mutationCalls = 0;
  const fetcher = async (_path, init) => {
    if (init?.method) mutationCalls += 1;
    return init?.method
      ? response(409, committedReloadBody(5))
      : response(500, { error: "unavailable" });
  };
  const first = await runEstimateBuilderMutation(fetcher, estimateId, state, { path: "/mutation", method: "POST", body: {} });
  assert.equal(first.outcome, "committed_reload_failed");
  assert.equal(first.reloadRequirement.minimumAcceptableRevision, 5);
  assert.equal(first.reloadRequirement.reason, "committed");
  assert.equal(first.closeSubmittedForm, true);
  const blocked = await runEstimateBuilderMutation(fetcher, estimateId, first.state, { path: "/mutation", method: "POST", body: {} }, first.reloadRequirement);
  assert.equal(blocked.outcome, "blocked");
  assert.equal(mutationCalls, 1);

  const failedRetry = await retryRequiredBuilderReload(async () => response(500, {}), estimateId, first.state, first.reloadRequirement);
  assert.equal(failedRetry.reloadRequirement, first.reloadRequirement);
  const successfulRetry = await retryRequiredBuilderReload(async (_path, init) => {
    assert.equal(init?.method, undefined); return response(200, nextState);
  }, estimateId, first.state, first.reloadRequirement);
  assert.equal(successfulRetry.reloadRequirement, null);
  assert.equal(successfulRetry.state, nextState);
});

test("malformed success plus failed GET enters the same persistent mutation lock", async () => {
  let calls = 0;
  const result = await runEstimateBuilderMutation(async () => {
    calls += 1; return calls === 1 ? response(200, { success: true }) : response(500, {});
  }, estimateId, state, { path: "/mutation", method: "DELETE", body: {} });
  assert.equal(calls, 2);
  assert.equal(result.outcome, "ambiguous_reload_failed");
  assert.equal(result.reloadRequirement.minimumAcceptableRevision, 5);
  assert.equal(result.committed, true);
  assert.match(result.notice, /may have saved/);
});

test("mutation eligibility requires permission, draft lifecycle and current state", async () => {
  const requirement = { minimumAcceptableRevision: 5, reason: "stale", mutationCommitted: false, notice: "Reload required." };
  assert.equal(canMutateEstimate(state, null), true);
  assert.equal(canMutateEstimate({ ...state, estimate: { ...state.estimate, status: "sent" } }, null), false);
  assert.equal(canMutateEstimate({ ...state, capabilities: { ...state.capabilities, canEditPrices: false } }, null), false);
  assert.equal(canMutateEstimate(state, requirement), false);
  let calls = 0;
  const result = await runEstimateBuilderMutation(async () => { calls += 1; return response(500, {}); }, estimateId, { ...state, estimate: { ...state.estimate, status: "accepted" } }, { path: "/mutation", method: "POST", body: {} });
  assert.equal(result.outcome, "blocked");
  assert.equal(calls, 0);
});

test("normal mutation success requires a revision newer than the submitted revision", async () => {
  const accepted = await runEstimateBuilderMutation(async () => response(200, stateAtRevision(6)), estimateId, stateAtRevision(5), { path: "/mutation", method: "POST", body: {} });
  assert.equal(accepted.outcome, "success");
  assert.equal(accepted.state.calculationRevision, 6);

  for (const responseRevision of [5, 4]) {
    const calls = [];
    const result = await runEstimateBuilderMutation(async (_path, init) => {
      calls.push(init);
      return calls.length === 1 ? response(200, stateAtRevision(responseRevision)) : response(200, stateAtRevision(6));
    }, estimateId, stateAtRevision(5), { path: "/mutation", method: "POST", body: {} });
    assert.equal(calls.filter((init) => init?.method === "POST").length, 1);
    assert.equal(result.outcome, "ambiguous_recovered");
    assert.equal(result.state.calculationRevision, 6);
  }
});

test("confirmed committed recovery enforces and retains the committed revision floor", async () => {
  for (const recoveredRevision of [5, 6]) {
    let calls = 0;
    const result = await runEstimateBuilderMutation(async () => {
      calls += 1;
      return calls === 1 ? response(409, committedReloadBody(5)) : response(200, stateAtRevision(recoveredRevision));
    }, estimateId, state, { path: "/mutation", method: "DELETE", body: {} });
    assert.equal(result.outcome, "committed_recovered");
    assert.equal(result.state.calculationRevision, recoveredRevision);
    assert.equal(result.reloadRequirement, null);
  }

  let calls = 0;
  const tooOld = await runEstimateBuilderMutation(async () => {
    calls += 1;
    return calls === 1 ? response(409, committedReloadBody(5)) : response(200, stateAtRevision(4));
  }, estimateId, state, { path: "/mutation", method: "DELETE", body: {} });
  assert.equal(tooOld.state, state);
  assert.equal(tooOld.outcome, "committed_reload_failed");
  assert.equal(tooOld.reloadRequirement.minimumAcceptableRevision, 5);
  assert.equal(calls, 2);

  const oldRetry = await retryRequiredBuilderReload(async () => response(200, stateAtRevision(4)), estimateId, state, tooOld.reloadRequirement);
  assert.equal(oldRetry.state, state);
  assert.equal(oldRetry.reloadRequirement, tooOld.reloadRequirement);
  const currentRetry = await retryRequiredBuilderReload(async (_path, init) => {
    assert.equal(init?.method, undefined);
    return response(200, stateAtRevision(5));
  }, estimateId, state, tooOld.reloadRequirement);
  assert.equal(currentRetry.state.calculationRevision, 5);
  assert.equal(currentRetry.reloadRequirement, null);
});

test("ambiguous and stale recovery require a revision newer than the submitted revision", async () => {
  for (const [mutationResponse, expectedOutcome, committed] of [
    [response(200, { success: true }), "ambiguous_reload_failed", true],
    [response(409, { code: "stale_calculation_revision" }), "stale_reload_failed", false],
  ]) {
    let calls = 0;
    const result = await runEstimateBuilderMutation(async () => {
      calls += 1;
      return calls === 1 ? mutationResponse : response(200, stateAtRevision(5));
    }, estimateId, stateAtRevision(5), { path: "/mutation", method: "PATCH", body: {} });
    assert.equal(calls, 2);
    assert.equal(result.outcome, expectedOutcome);
    assert.equal(result.committed, committed);
    assert.equal(result.reloadRequirement.minimumAcceptableRevision, 6);
    assert.equal(result.state.calculationRevision, 5);

    let blockedCalls = 0;
    const blocked = await runEstimateBuilderMutation(async () => {
      blockedCalls += 1;
      return response(500, {});
    }, estimateId, result.state, { path: "/mutation", method: "PATCH", body: {} }, result.reloadRequirement);
    assert.equal(blocked.outcome, "blocked");
    assert.equal(blockedCalls, 0);
  }

  const recovered = await runEstimateBuilderMutation(async (_path, init) =>
    init?.method ? response(200, { success: true }) : response(200, stateAtRevision(6)),
  estimateId, stateAtRevision(5), { path: "/mutation", method: "POST", body: {} });
  assert.equal(recovered.outcome, "ambiguous_recovered");
  assert.equal(recovered.state.calculationRevision, 6);
});

test("malformed committed revision remains potentially committed and uses the submitted revision floor", async () => {
  for (const body of [
    { ...committedReloadBody(5), calculationRevision: undefined, nextCalculationRevision: undefined },
    committedReloadBody(4),
    { ...committedReloadBody(5), nextCalculationRevision: 6 },
  ]) {
    let calls = 0;
    const result = await runEstimateBuilderMutation(async () => {
      calls += 1;
      return calls === 1 ? response(409, body) : response(200, stateAtRevision(5));
    }, estimateId, stateAtRevision(5), { path: "/mutation", method: "POST", body: {} });
    assert.equal(calls, 2);
    assert.equal(result.committed, true);
    assert.equal(result.outcome, "ambiguous_reload_failed");
    assert.equal(result.reloadRequirement.minimumAcceptableRevision, 6);
  }
});

test("revision requirement helper rejects malformed and too-old revisions", () => {
  const requirement = { minimumAcceptableRevision: 5 };
  assert.equal(satisfiesRevisionRequirement(stateAtRevision(4), requirement), false);
  assert.equal(satisfiesRevisionRequirement(stateAtRevision(5), requirement), true);
  assert.equal(satisfiesRevisionRequirement(stateAtRevision(6), requirement), true);
  for (const minimumAcceptableRevision of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(satisfiesRevisionRequirement(stateAtRevision(6), { minimumAcceptableRevision }), false);
  }
});

test("builder wires every operation to the committed API without optimistic state merging", () => {
  const source = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
  assert.match(source, /`\/api\/estimates\/\$\{estimateId\}\/sections`/);
  assert.match(source, /`\/api\/estimates\/\$\{estimateId\}\/sections\/\$\{sectionForm\.id\}`/);
  assert.match(source, /`\/api\/estimates\/\$\{estimateId\}\/items`/);
  assert.match(source, /`\/api\/estimates\/\$\{estimateId\}\/items\/\$\{itemForm\.id\}`/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /setState\(result\.state\)/);
  assert.doesNotMatch(source, /calculationRevision\s*\+|setState\([^)]*\.\.\./);
  assert.match(source, /state\.sections\.map/);
  assert.match(source, /state\.items\.filter\(\(item\) => item\.sectionId === section\.id\)/);
});

test("item move and reorder payload contains only canonical inputs", () => {
  const body = buildItemMutationBody(draft({ sectionId: "33333333-3333-4333-8333-333333333333", sortOrder: "20" }), false);
  assert.equal(body.sectionId, "33333333-3333-4333-8333-333333333333");
  assert.equal(body.sortOrder, 20);
  for (const forbidden of ["id", "calculationRevision", "customerPriceCents", "directCostCents", "estimatedProfit", "line_type"]) {
    assert.equal(forbidden in body, false);
  }
});
