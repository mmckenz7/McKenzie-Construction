import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260818120000_guided_deck_structural_plan_revisions.sql",
  "utf8",
);
const route = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/deck-structural-plan-revisions/route.ts",
  "utf8",
);
const takeoffRoute = readFileSync(
  "src/app/api/estimates/[estimateId]/deck-takeoff/route.ts",
  "utf8",
);
const planner = readFileSync(
  "src/components/estimates/deck-takeoff-planner.tsx",
  "utf8",
);

test("structural concepts are append-only, tenant-scoped, revision-fenced, and service-only", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  assert.match(migration, /create table public\.guided_deck_structural_plan_revisions/);
  assert.match(migration, /unique\(company_id,visit_id,plan_revision\)/);
  assert.match(migration, /unique\(company_id,idempotency_key\)/);
  assert.match(migration, /foreign key\(shape_revision_id,visit_id,company_id\)/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /guided_site_visit_actor_company\(requested_auth_user_id\)/);
  assert.match(migration, /where id=requested_visit_id and company_id=company/);
  assert.match(migration, /where company_id=company and visit_id=visit\.id order by shape_revision desc limit 1/);
  assert.match(migration, /shape\.request_sha256<>requested_shape_digest/);
  assert.match(migration, /current_revision<>requested_expected_plan_revision/);
  assert.match(migration, /language plpgsql security definer/);
  assert.match(migration, /'stale_plan_revision'/);
  assert.match(migration, /'stale_shape_revision'/);
  assert.match(migration, /existing\.request_sha256=requested_request_sha256/);
  assert.match(migration, /revoke all on table public\.guided_deck_structural_plan_revisions from public,anon,authenticated/);
  assert.match(migration, /grant select on table public\.guided_deck_structural_plan_revisions to service_role/);
  assert.match(migration, /revoke all on function public\.create_guided_deck_structural_plan_revision[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.create_guided_deck_structural_plan_revision[\s\S]*to service_role/);
});

test("route rebuilds canonical concept from latest shape and rehydrates only an exact current binding", () => {
  assert.match(route, /authorizeGuidedSiteVisit/);
  assert.match(route, /exactObject\(await request\.json\(\), BODY_FIELDS\)/);
  assert.match(route, /guided_deck_shape_revisions/);
  assert.match(route, /request_sha256/);
  assert.match(route, /buildCustomDeckEstimatingConcept/);
  assert.match(route, /isCanonicalCustomDeckEstimatingConcept/);
  assert.match(route, /create_guided_deck_structural_plan_revision/);
  assert.match(route, /staleShape: true/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("takeoff binds preliminary geometry to latest canonical plan and UI keeps safety gates visible", () => {
  assert.match(takeoffRoute, /customStructuralPlanRevisionId/);
  assert.match(takeoffRoute, /customDeckStructuralPlanBindingMatches/);
  assert.match(takeoffRoute, /guided_deck_structural_plan_revisions/);
  assert.match(takeoffRoute, /isCanonicalCustomDeckEstimatingConcept/);
  assert.match(takeoffRoute, /customDeckEstimatingConceptJoistLine/);
  assert.match(takeoffRoute, /joists\.description !== expected\.description/);
  assert.match(planner, /Use preliminary geometry in Takeoff/);
  assert.match(planner, /customStructuralPlanRevisionId: body\.id/);
  assert.match(planner, /PRELIMINARY ESTIMATING PLAN — NOT FOR CONSTRUCTION/);
  assert.match(planner, /all listed structural,[\s\S]*hardware, ordering, and permit packages remain blocked/);
  assert.match(planner, /Reviewed-plan evidence is required before Takeoff/);
  assert.doesNotMatch(planner, /Approve reviewed structural plan and continue/);
});

test("generated concept has an explicit non-promotable source type and parent stages stay preliminary", () => {
  const builder = readFileSync(
    "src/components/estimates/estimate-builder.tsx",
    "utf8",
  );
  assert.match(migration, /source_type text not null check \(source_type = 'generated_estimating_concept'\)/);
  assert.match(migration, /requested_payload->>'sourceType'<>'generated_estimating_concept'/);
  assert.match(builder, /type DeckStructureReadiness = "not_ready" \| "preliminary_geometry" \| "approved_plan"/);
  assert.match(builder, /structureReadiness === "preliminary_geometry" \? "Preliminary"/);
  assert.match(builder, /structureReadiness === "preliminary_geometry" \? "Ready for finishes"/);
  assert.match(builder, /exact footprint and preliminary quantities are saved/);
  assert.match(builder, /Choose decking and railing finishes for the saved footprint/);
  assert.doesNotMatch(builder, /structureReady \? "Approved"/);
});
