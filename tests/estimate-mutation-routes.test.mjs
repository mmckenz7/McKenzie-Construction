import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const paths = [
  "src/app/api/estimates/[estimateId]/sections/route.ts",
  "src/app/api/estimates/[estimateId]/sections/[sectionId]/route.ts",
  "src/app/api/estimates/[estimateId]/items/route.ts",
  "src/app/api/estimates/[estimateId]/items/[itemId]/route.ts",
];
const sources = paths.map((path) => readFileSync(path, "utf8"));
const all = sources.join("\n");
const mutationHelper = readFileSync("src/lib/estimate-mutations.ts", "utf8");

test("all mutation routes use existing authorization and edit_prices", () => {
  for (const source of sources) {
    assert.match(source, /authorizeEstimateRequest\(request, estimateId\)/);
    assert.match(source, /!auth\.authorization!\.canEditPrices/);
    assert.doesNotMatch(source, /createClient|scopeType|scopeId|x-feature/);
  }
});

test("expected revision and exact request allowlists guard every method", () => {
  assert.equal((all.match(/expectedRevision\(body\.expectedCalculationRevision\)/g) ?? []).length, 4);
  assert.equal((all.match(/assertExactFields\(body,/g) ?? []).length, 4);
  assert.match(all, /ITEM_FIELDS/);
  assert.match(all, /SECTION_CREATE_FIELDS/);
  assert.match(all, /SECTION_PATCH_FIELDS/);
  assert.match(all, /DELETE_FIELDS/);
});

test("item create update and delete recalculate complete proposed state", () => {
  const itemSources = sources.slice(2).join("\n");
  assert.equal((itemSources.match(/calculateMutation\(state\.estimate, state\.items\)/g) ?? []).length, 3);
  assert.equal((itemSources.match(/requested_item_calculations: calculated\.itemCalculations/g) ?? []).length, 3);
  assert.equal((itemSources.match(/requested_estimate_calculation: calculated\.estimateCalculation/g) ?? []).length, 3);
  assert.match(itemSources, /canonicalItemRpcValue\(item\)/);
  assert.match(itemSources, /state\.sections\.some\(\(section\) => section\.id === item\.sectionId\)/);
});

test("routes map stable outcomes without partial success", () => {
  for (const source of sources) {
    assert.match(source, /stale_calculation_revision/);
    assert.match(source, /outcome\.result_code !== "ok"/);
    assert.match(source, /if \(result\.error\) throw new Error/);
    assert.match(source, /nextCalculationRevision/);
    assert.match(source, /completeCommittedMutationState/);
  }
  assert.match(sources[1], /section_not_empty/);
  assert.match(sources[2], /status: 201/);
  assert.match(sources[0], /status: 201/);
});

test("cross-estimate section and item identifiers use the shared 404 body", () => {
  assert.match(sources[1], /index < 0[\s\S]*ESTIMATE_NOT_FOUND_BODY/);
  assert.match(sources[3], /index < 0[\s\S]*ESTIMATE_NOT_FOUND_BODY/);
  assert.match(sources[2], /state\.sections\.some[\s\S]*ESTIMATE_NOT_FOUND_BODY/);
  assert.match(sources[3], /state\.sections\.some[\s\S]*ESTIMATE_NOT_FOUND_BODY/);
});

test("responses are permission-projected and never return RPC or raw rows", () => {
  for (const source of sources) {
    assert.match(source, /completeCommittedMutationState\(/);
    assert.match(source, /\.\.\.builderState/);
    assert.doesNotMatch(source, /NextResponse\.json\([^\n]*result\.data/);
    assert.doesNotMatch(source, /state\.(?:items|sections)\.(?:push|splice)[\s\S]*\.\.\.projection/);
  }
});

test("each successful RPC is executed once and enters the committed reload boundary", () => {
  assert.equal((all.match(/await supabase\.rpc\(/g) ?? []).length, 6);
  assert.equal((all.match(/completeCommittedMutationState\(/g) ?? []).length, 6);
  assert.equal((all.match(/if \(!completion\.ok\) return NextResponse\.json\(completion\.body, \{ status: completion\.status \}\)/g) ?? []).length, 6);
  assert.doesNotMatch(all, /loadPostMutationBuilderState/);
  assert.doesNotMatch(all, /mutationCommitted:\s*true/);
  assert.match(mutationHelper, /mutation_committed_state_reload_required/);
  assert.match(mutationHelper, /mutationCommitted: true/);
  assert.match(mutationHelper, /reloadRequired: true/);
});

test("authoritative state loading uses a revision fence before calculation", () => {
  const loader = mutationHelper.match(/export async function loadMutationState[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(loader, /const estimate = await/);
  assert.match(loader, /const \[items, sections\] = await Promise\.all/);
  assert.match(loader, /const fence = await/);
  assert.match(loader, /fence\.data\.calculation_revision !== estimate\.data\.calculation_revision/);
  assert.match(loader, /throw new MutationStateChangedError/);
  for (const source of sources) assert.match(source, /error instanceof MutationStateChangedError/);
});
