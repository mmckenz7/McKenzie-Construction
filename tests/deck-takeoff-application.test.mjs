import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/estimates/[estimateId]/deck-takeoff/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260814100000_deck_reviewed_takeoff_application.sql", "utf8");
const ui = readFileSync("src/components/estimates/deck-takeoff-planner.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");

test("preview and apply reconstruct the authoritative field and catalog inputs server-side", () => {
  assert.match(route, /authorizeEstimateRequest\(request, estimateId\)/);
  assert.match(route, /canEditPrices/);
  assert.match(route, /guided_site_visits/);
  assert.match(route, /target_estimate_id/);
  assert.match(route, /status !== "completed"/);
  assert.match(route, /material_supplier_prices/);
  assert.match(route, /buildDeckTakeoffPreview/);
  assert.match(route, /preview\.previewBinding !== body\.previewBinding/);
  assert.match(route, /expectedCalculationRevision/);
  assert.match(route, /apply_reviewed_deck_takeoff/);
});

test("atomic persistence is tenant-scoped, append-only, idempotent, and revision fenced", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /get_effective_user_access/);
  assert.match(migration, /assert_single_company_fence_estimate_scope/);
  assert.match(migration, /company_id = resolved_company_id/);
  assert.match(migration, /target_estimate_id = requested_estimate_id for update/);
  assert.match(migration, /visit_record\.status <> 'completed'/);
  assert.match(migration, /visit_record\.revision <> requested_expected_visit_revision/);
  assert.match(migration, /estimate_record\.calculation_revision <> requested_expected_calculation_revision/);
  assert.match(migration, /deck_takeoff_application_idempotency_unique/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /persist_structured_estimate_outputs/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /insert into public\.material_catalog|update public\.material_catalog/i);
});

test("UI keeps calculation, human plan, price evidence, and customer proposal as separate gates", () => {
  for (const copy of [
    "Draft material takeoff",
    "Planned quantities the photos cannot decide",
    "Calculate draft takeoff",
    "I reviewed the field dimensions",
    "I reviewed the build-plan quantities",
    "I reviewed every true cost and its source",
    "Add reviewed takeoff to estimate",
  ]) assert.match(ui, new RegExp(copy, "i"));
  assert.match(ui, /\/api\/material-catalog\?active=true&includePrices=true/);
  assert.match(ui, /crypto\.randomUUID\(\)/);
  assert.match(ui, /method: "PUT"/);
  assert.match(builder, /onTakeoffApplied/);
  assert.match(builder, /Continue to OH&amp;P/);
  assert.match(builder, /EstimateProposalCard/);
  assert.doesNotMatch(ui, /send.*customer|issue.*proposal/i);
});
