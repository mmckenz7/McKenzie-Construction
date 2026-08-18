import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260817100000_guided_deck_shape_revisions.sql",
  "utf8",
);
const geometryMigration = readFileSync(
  "supabase/migrations/20260818100000_guided_deck_shape_site_geometry.sql",
  "utf8",
);
const permissionMigration = readFileSync(
  "supabase/migrations/20260818110000_fix_guided_deck_shape_revision_approval_permissions.sql",
  "utf8",
);
const route = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/deck-shape-revisions/route.ts",
  "utf8",
);
const estimateVisitRoute = readFileSync(
  "src/app/api/estimates/[estimateId]/guided-site-visits/route.ts",
  "utf8",
);
const shapeReview = readFileSync(
  "src/components/estimates/deck-shape-review.tsx",
  "utf8",
);
const builder = readFileSync(
  "src/components/estimates/estimate-builder.tsx",
  "utf8",
);

test("shape approvals are append-only and tenant/visit scoped", () => {
  assert.match(migration, /^begin;\n/);
  assert.match(migration, /\ncommit;\n$/);
  assert.match(migration, /create table public\.guided_deck_shape_revisions/);
  assert.match(migration, /foreign key\(visit_id,company_id\)/);
  assert.match(migration, /foreign key\(supersedes_shape_revision_id,visit_id,company_id\)/);
  assert.match(migration, /prevent_guided_deck_shape_revision_mutation/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.guided_deck_shape_revisions from public,anon,authenticated/);
});

test("server validation rejects collapsed and self-intersecting outlines", () => {
  assert.match(migration, /jsonb_array_length\(requested_outline\)/);
  assert.match(migration, /n < 3 or n > 24/);
  assert.match(migration, /abs\(area_twice\) < 2/);
  assert.match(migration, /guided_deck_shape_segments_intersect/);
  assert.match(migration, /ax < 0 or ay < 0 or ax > 200 or ay > 200/);
  assert.match(route, /isValidDeckOutline\(points\)/);
  assert.match(route, /point\.x > 200/);
  assert.match(route, /point\.y > 200/);
});

test("approval requires a completed visit and editable estimate with exact replay", () => {
  assert.match(migration, /guided_site_visit_actor_company/);
  assert.match(migration, /visit\.status<>'completed'/);
  assert.match(migration, /status='draft'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /current_revision<>requested_expected_shape_revision/);
  assert.match(migration, /idempotency_conflict/);
  assert.match(migration, /request_sha256=requested_request_sha256/);
});

test("route exposes only the latest company-scoped approved shape", () => {
  assert.match(route, /\.eq\("company_id", auth\.authorization!\.companyId\)/);
  assert.match(route, /\.eq\("visit_id", visitId\)/);
  assert.match(route, /\.order\("shape_revision", \{ ascending: false \}\)/);
  assert.match(route, /exactObject\(await request\.json\(\), BODY_FIELDS\)/);
  assert.match(route, /approve_guided_deck_shape_revision/);
  assert.match(route, /requested_auth_user_id: auth\.authorization!\.authUserId/);
  assert.match(route, /Cache-Control": "private, no-store/);
});

test("mobile shape review saves before structural planning and reload restores it", () => {
  assert.match(shapeReview, /expectedShapeRevision: shapeRevision/);
  assert.match(shapeReview, /deck-shape-revisions/);
  assert.match(shapeReview, /Saving approved shape/);
  assert.match(shapeReview, /Save this shape — continue to structure/);
  assert.match(estimateVisitRoute, /guided_deck_shape_revisions/);
  assert.match(estimateVisitRoute, /latestApprovedShape/);
  assert.match(builder, /setFinalizedDeckShape\(summary\?\.latestApprovedShape \?\? null\)/);
  assert.match(builder, /initialShape=\{finalizedDeckShape\}/);
  assert.match(builder, /finalizedDeckShape \? "structure" : "shape"/);
});

test("stair placement and four grade heights are immutable shape-revision evidence", () => {
  assert.match(geometryMigration, /^begin;\n/);
  assert.match(geometryMigration, /add column stair_placement jsonb/);
  assert.match(geometryMigration, /add column grade_heights jsonb/);
  assert.match(geometryMigration, /is_valid_guided_deck_site_geometry/);
  assert.match(geometryMigration, /stair_offset>=stair_width\/2/);
  assert.match(geometryMigration, /existing\.stair_placement is not distinct from requested_stair_placement/);
  assert.match(geometryMigration, /revoke all on function public\.approve_guided_deck_shape_revision\(.+\) from service_role/);
  assert.match(geometryMigration, /grant execute on function public\.approve_guided_deck_shape_revision_v2/);
  assert.match(route, /parseStairPlacement/);
  assert.match(route, /parseGradeHeights/);
  assert.match(route, /requested_stair_placement: stairPlacement/);
  assert.match(route, /requested_grade_heights: gradeHeights/);
  assert.match(estimateVisitRoute, /stair_placement,grade_heights/);
});

test("shape approval has the table-owner privilege needed for its guarded append", () => {
  assert.match(permissionMigration, /^begin;\n/);
  assert.match(permissionMigration, /alter function public\.approve_guided_deck_shape_revision_v2\([\s\S]+\) security definer/);
  assert.match(permissionMigration, /revoke all on function public\.approve_guided_deck_shape_revision_v2\([\s\S]+\) from public,anon,authenticated/);
  assert.match(permissionMigration, /grant execute on function public\.approve_guided_deck_shape_revision_v2\([\s\S]+\) to service_role/);
  assert.match(permissionMigration, /validates the authenticated actor company/);
  assert.match(permissionMigration, /\ncommit;\n$/);
});
