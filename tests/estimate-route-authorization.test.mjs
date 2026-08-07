import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access = readFileSync("src/lib/estimate-access.ts", "utf8");
const collection = readFileSync("src/app/api/estimates/route.ts", "utf8");
const detail = readFileSync("src/app/api/estimates/[estimateId]/route.ts", "utf8");
const featureTypes = readFileSync("src/lib/features/types.ts", "utf8");
const featureServer = readFileSync("src/lib/features/server.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260806010000_estimates_feature_default.sql", "utf8");
const draftInvariantMigration = readFileSync("supabase/migrations/20260806020000_estimate_draft_invariants.sql", "utf8");

test("authorization requires active authentication, Sales access, and fixed-scope feature", () => {
  assert.match(access, /getAuthenticatedAccess\(\)/);
  assert.match(access, /createUnauthorizedApiResponse/);
  assert.match(access, /get_effective_user_access/);
  assert.match(access, /portal_access\?\.sales !== true/);
  assert.match(access, /getServerFeatureMap\(\{ scopeType: "global", scopeId: "default" \}\)/);
  assert.match(access, /if \(!features\.estimates\)/);
  assert.doesNotMatch(access, /getFeatureScopeFromRequest|x-feature-scope|scopeType.*searchParams/);
});

test("feature key and default are additive", () => {
  assert.match(featureTypes, /\| "estimates"/);
  assert.match(featureTypes, /estimates: true/);
  assert.match(featureServer, /record\.estimates !== false/);
  assert.match(migration, /'global',[\s\S]*?'default',[\s\S]*?'estimates',[\s\S]*?true/);
  assert.match(migration, /on conflict \(scope_type, scope_id, feature_key\) do nothing/);
  assert.doesNotMatch(migration, /role_permission_defaults|app_users/);
});

test("create and patch require edit_prices while reads do not", () => {
  assert.match(access, /canEditPrices: hasEstimatePermission\(effectiveAccess, "edit_prices"\)/);
  assert.match(collection, /export async function POST[\s\S]*?!auth\.authorization!\.canEditPrices/);
  assert.match(detail, /export async function PATCH[\s\S]*?!auth\.authorization!\.canEditPrices/);
  assert.doesNotMatch(collection.match(/export async function GET[\s\S]*$/)?.[0] ?? "", /canEditPrices/);
  assert.doesNotMatch(detail.match(/export async function GET[\s\S]*?export async function PATCH/)?.[0] ?? "", /canEditPrices/);
});

test("routes create only structured drafts and reuse an active lead draft", () => {
  assert.match(collection, /status: "draft"/);
  assert.match(collection, /calculation_policy_version: ESTIMATE_CALCULATION_POLICY_VERSION/);
  assert.match(collection, /calculation_revision: 0/);
  assert.match(collection, /\.eq\("lead_id", leadId\)\.eq\("status", "draft"\)/);
  assert.match(collection, /\.eq\("calculation_policy_version", ESTIMATE_CALCULATION_POLICY_VERSION\)/);
  assert.match(collection, /verifyRelationships/);
  assert.match(collection, /projectCustomer\.source_lead_id !== leadId/);
  assert.match(collection, /linkedCustomerId !== customerId/);
});

test("database enforces exactly one structured draft per non-null lead", () => {
  assert.match(draftInvariantMigration, /create unique index estimates_one_structured_draft_per_lead_uidx/);
  assert.match(draftInvariantMigration, /on public\.estimates \(lead_id\)/);
  assert.match(draftInvariantMigration, /where lead_id is not null\s+and status = 'draft'\s+and calculation_policy_version = 'structured-estimate-v1'/);
  assert.doesNotMatch(draftInvariantMigration, /customer_id|project_id|feature_settings|\bgrant\b|\brevoke\b/i);
  assert.doesNotMatch(draftInvariantMigration, /\bupdate\s+public\.estimates|\bdelete\s+from|\bcalculateEstimate\b|profit_markup_amount\s*:=/i);
  assert.match(draftInvariantMigration, /having count\(\*\) > 1/);
});

test("POST recovers only the intended lead-draft unique race", () => {
  assert.match(collection, /if \(leadId && isStructuredLeadDraftUniqueViolation\(inserted\.error\)\)/);
  assert.match(collection, /const winning = await loadStructuredLeadDraft\(supabase, leadId\)/);
  assert.match(collection, /return NextResponse\.json\(\{ success: true, estimate \}\)/);
  assert.match(collection, /throw new Error\(inserted\.error\.message\)/);
  const loader = collection.match(/async function loadStructuredLeadDraft[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(loader, /\.eq\("lead_id", leadId\)\.eq\("status", "draft"\)/);
  assert.match(loader, /\.eq\("calculation_policy_version", ESTIMATE_CALCULATION_POLICY_VERSION\)/);
  for (const inactive of ["sent", "accepted", "converted", "declined", "expired", "void"]) {
    assert.doesNotMatch(loader, new RegExp(`"${inactive}"`));
  }
});

test("client totals and lifecycle fields are rejected", () => {
  assert.match(collection, /CREATE_FIELDS/);
  assert.match(detail, /PATCH_FIELDS/);
  for (const forbidden of ["status", "totalPrice", "subtotalCost", "taxAmount", "estimatedProfit", "estimatedMargin", "calculationPolicyVersion", "leadId", "customerId", "projectId"]) {
    assert.doesNotMatch(detail.match(/const PATCH_FIELDS[\s\S]*?\]\);/)?.[0] ?? "", new RegExp(`"${forbidden}"`));
  }
  assert.match(collection, /request contains unsupported fields/);
  assert.match(detail, /request contains unsupported fields/);
});

test("patch is draft-only, revision guarded, and recalculated server-side", () => {
  assert.match(detail, /loaded\.estimate\.status !== "draft"/);
  assert.match(detail, /expectedCalculationRevision is required/);
  assert.match(detail, /stale_calculation_revision/);
  assert.match(detail, /loadMutationState\(supabase, estimateId\)/);
  assert.match(detail, /calculateMutation\(calculationRecord, loaded\.items\)/);
  assert.match(detail, /calculation_revision: expectedRevision \+ 1/);
  assert.match(detail, /\.eq\("calculation_revision", expectedRevision\)/);
  assert.match(detail, /completeCommittedMutationState\(/);
  assert.match(detail, /nextCalculationRevision: completion\.state\.calculationRevision/);
  assert.match(detail, /\.\.\.completion\.state/);
});

test("cost and profit capabilities are independently server projected", () => {
  assert.match(access, /canViewCosts: hasEstimatePermission\(effectiveAccess, "view_costs"\)/);
  assert.match(access, /canViewProfit: hasEstimatePermission\(effectiveAccess, "view_profit"\)/);
  assert.match(collection, /projectPersistedEstimate/);
  assert.match(detail, /loadBuilderState/);
  assert.match(detail, /completeCommittedMutationState/);
});

test("GET routes are read-only and collection item failures are structured", () => {
  const collectionGet = collection.match(/export async function GET[\s\S]*$/)?.[0] ?? "";
  const detailGet = detail.match(/export async function GET[\s\S]*?export async function PATCH/)?.[0] ?? "";
  for (const source of [collectionGet, detailGet]) {
    assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|calculation_revision\s*:/);
  }
  assert.match(collectionGet, /try \{[\s\S]*?Promise\.all[\s\S]*?catch \{[\s\S]*?Estimates could not be loaded\.[\s\S]*?status: 500/);
  assert.match(detailGet, /loadBuilderState/);
  assert.match(readFileSync("src/lib/estimate-mutations.ts", "utf8"), /loadBuilderState[\s\S]*?calculateMutation\(state\.estimate, state\.items\)/);
});

test("POST and PATCH use strict calendar-date validation", () => {
  assert.match(collection, /defaultEstimateValidUntil\(\)/);
  assert.match(collection, /optionalIsoCalendarDate\(body\.validUntil\)/);
  assert.match(detail, /valid_until: optionalIsoCalendarDate\(body\.validUntil\)/);
  assert.doesNotMatch(collection, /new Date|Date\.parse/);
  assert.doesNotMatch(detail, /new Date|Date\.parse/);
});
