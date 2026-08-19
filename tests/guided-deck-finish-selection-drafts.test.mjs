import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260819100000_guided_deck_finish_selection_drafts.sql",
  "utf8",
);
const route = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/deck-finish-selection/route.ts",
  "utf8",
);
const parser = readFileSync("src/lib/deck-finish-draft.ts", "utf8");
const planner = readFileSync(
  "src/components/estimates/deck-takeoff-planner.tsx",
  "utf8",
);

test("working finish selections are append-only, tenant-scoped, revision-fenced, and service-only", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  assert.match(migration, /create table public\.guided_deck_finish_selection_revisions/);
  assert.match(migration, /unique\(company_id,visit_id,selection_revision\)/);
  assert.match(migration, /unique\(company_id,idempotency_key\)/);
  assert.match(migration, /foreign key\(shape_revision_id,visit_id,company_id\)/);
  assert.match(migration, /foreign key\(structural_plan_revision_id,visit_id,company_id\)/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /guided_site_visit_actor_company\(requested_auth_user_id\)/);
  assert.match(migration, /where id=requested_visit_id and company_id=company/);
  assert.match(migration, /estimate_record\.id is null/);
  assert.match(migration, /status='draft'/);
  assert.match(migration, /shape\.request_sha256<>requested_shape_digest/);
  assert.match(migration, /structural_plan\.id<>requested_structural_plan_revision_id/);
  assert.match(migration, /current_revision<>requested_expected_selection_revision/);
  assert.match(migration, /language plpgsql security definer/);
  assert.match(migration, /existing\.request_sha256=requested_request_sha256/);
  assert.match(migration, /revoke all on table public\.guided_deck_finish_selection_revisions from public,anon,authenticated/);
  assert.match(migration, /grant select on table public\.guided_deck_finish_selection_revisions to service_role/);
  assert.match(migration, /revoke all on function public\.create_guided_deck_finish_selection_revision[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.create_guided_deck_finish_selection_revision[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
});

test("finish selection schema is exact and stores incomplete working costs without inventing values", () => {
  assert.match(parser, /custom-deck-finish-draft-v2/);
  assert.match(parser, /custom-deck-finish-draft-v1/);
  assert.match(parser, /custom_decking/);
  assert.match(parser, /custom_decking_square_edge/);
  assert.match(parser, /custom_railing/);
  assert.match(parser, /quantity: number \| null/);
  assert.match(parser, /unitCost: number \| null/);
  assert.match(parser, /catalogMaterialId: string \| null/);
  assert.match(parser, /Number\.isFinite/);
  assert.match(parser, /saved finish lines are incomplete/i);
  assert.match(migration, /jsonb_array_length\(requested->'lines'\)<>2/);
  assert.match(migration, /count\(distinct value->>'key'\)/);
});

test("authenticated route binds every save to the latest shape and structural concept", () => {
  assert.match(route, /authorizeGuidedSiteVisit/);
  assert.match(route, /authorizeEstimateRequest/);
  assert.match(route, /canViewCosts/);
  assert.match(route, /canEditPrices/);
  assert.match(route, /estimateAuth\.authorization!\.companyId !== companyId/);
  assert.match(route, /exactObject\(await request\.json\(\), BODY_FIELDS\)/);
  assert.match(route, /guided_deck_shape_revisions/);
  assert.match(route, /guided_deck_structural_plan_revisions/);
  assert.match(route, /guided_deck_finish_selection_revisions/);
  assert.match(route, /parseDeckFinishDraftSnapshot/);
  assert.match(route, /create_guided_deck_finish_selection_revision/);
  assert.match(route, /staleDesign: true/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("custom takeoff restores and explicitly saves working materials before customer-ready application", () => {
  assert.match(planner, /Saved finish selections and working costs restored/);
  assert.match(planner, /saveWorkingFinishSelection/);
  assert.match(planner, /custom_decking_square_edge/);
  assert.match(planner, /Square-edge border and divider boards/);
  assert.match(planner, /customSquareEdgeEstimate\.dividerCount/);
  assert.match(planner, /Save working materials and costs/);
  assert.match(planner, /Save updated working costs/);
  assert.match(planner, /Saving keeps these selections and working prices available after a[\s\S]*refresh/);
  assert.match(planner, /not customer-ready estimate lines yet/);
  assert.match(planner, /expectedSelectionRevision: finishDraftRevision/);
  assert.match(planner, /structuralPlanRevisionId: savedCustomPlan\.id/);
  assert.match(planner, /shapeDigest: savedCustomPlan\.shapeDigest/);
  assert.match(planner, /parseDeckFinishDraftSnapshot/);
});
