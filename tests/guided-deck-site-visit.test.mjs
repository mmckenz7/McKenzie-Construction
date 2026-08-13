import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const migration = readFileSync(
  "supabase/migrations/20260812150000_guided_deck_site_visit_manual_capture.sql",
  "utf8",
);
const recoveryMigration = readFileSync(
  "supabase/migrations/20260812152000_guided_site_visit_photo_attempt_recovery_limit.sql",
  "utf8",
);
const multiPhotoMigration = readFileSync(
  "supabase/migrations/20260813103000_guided_site_visit_multi_photo_sets.sql",
  "utf8",
);
const files = [
  "src/app/api/estimates/[estimateId]/guided-site-visits/route.ts",
  "src/app/api/guided-site-visits/[visitId]/route.ts",
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/route.ts",
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/photos/upload-session/route.ts",
  "src/app/api/guided-site-visits/[visitId]/photos/[photoId]/complete/route.ts",
  "src/app/api/guided-site-visits/[visitId]/photos/[photoId]/abandon/route.ts",
  "src/app/api/guided-site-visits/[visitId]/complete/route.ts",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
test("seeds Maxwell's exact nine-step Deck V0 order", () => {
  const expected = [
    "property_context",
    "full_deck_yard",
    "house_ledger",
    "underside_framing",
    "supports_footings",
    "stairs_landings",
    "guards_railings",
    "access_demolition",
    "utilities_obstructions",
  ];
  let at = -1;
  for (const key of expected) {
    const next = migration.indexOf(`'key','${key}'`);
    assert.ok(next > at, key);
    at = next;
  }
  assert.match(migration, /jsonb_array_length\(definition\)=9/);
});
test("preserves conditional human measurement requirements without engineering conclusions", () => {
  for (const field of [
    "length",
    "width",
    "height_from_grade",
    "ledger_length",
    "joist_spacing",
    "joist_depth",
    "beam_depth",
    "post_dimensions",
    "support_spacing",
    "exposed_footing_dimensions",
    "stair_width",
    "total_rise",
    "tread_depth",
    "representative_riser",
    "landing_dimensions",
    "guard_height",
    "opening",
    "rail_lengths_by_area",
    "handrail_height",
    "narrow_access_width",
    "gate_width",
    "clearance",
    "obstruction_clearances",
  ])
    assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /confirm_no_stairs/);
  assert.match(migration, /confirm_no_rail/);
  assert.match(migration, /confirm_no_utilities_or_obstructions/);
  assert.doesNotMatch(
    `${migration}\n${files}`,
    /code compliance|engineering verdict|quantity calculation|estimate_line_items/i,
  );
});
test("documented follow-up is terminal and distinct from all passed", () => {
  assert.match(migration, /documented_follow_up/);
  assert.match(migration, /documented_with_office_follow_up/);
  assert.match(migration, /all_passed/);
  assert.match(
    migration,
    /unsafe_access.*inaccessible.*concealed.*customer_declined.*site_condition.*office_verification_required/s,
  );
});
test("database validates conditional measurements instead of trusting a client flag", () => {
  assert.match(migration, /is_valid_guided_site_visit_observation/);
  assert.match(migration, /conditionStatus/);
  assert.match(migration, /measurements/);
  assert.match(migration, /->>'value'/);
  assert.match(migration, /->>'unit'/);
  assert.doesNotMatch(migration, /requirementSatisfied/);
});
test("component measurement UX remains backward compatible with visit snapshots", () => {
  assert.match(migration, /post_dimensions/);
  assert.match(migration, /exposed_footing_dimensions/);
  assert.match(
    migration,
    /where not \(requested_requirement->'fields' \? key\)/,
  );
  assert.match(migration, /key not in \('value','unit'\)/);
});
test("private photo attempts are append-only retakes with approved limits", () => {
  assert.match(migration, /guided_site_visit_photo_attempts/);
  assert.match(migration, /retake_of_attempt_id/);
  assert.match(`${migration}\n${multiPhotoMigration}`, /state='superseded'/);
  assert.match(migration, /15728640/);
  for (const mime of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ])
    assert.match(`${migration}\n${files}`, new RegExp(mime));
  assert.match(files, /upsert:\s*false/);
  assert.doesNotMatch(files, /\.remove\(|storage\.objects/);
});
test("capture races, retries, and signed URL failures fail closed", () => {
  assert.match(
    migration,
    /guided_site_visit_one_in_progress_per_estimate_uidx/,
  );
  assert.match(
    multiPhotoMigration,
    /guided_site_visit_one_inflight_photo_per_item_uidx/,
  );
  assert.match(multiPhotoMigration, /active_count>=5/);
  assert.match(multiPhotoMigration, /upload_in_progress/);
  assert.match(files, /fail_guided_site_visit_photo_reservation/);
  assert.match(migration, /coalesce\(storage\.buckets\.allowed_mime_types/);
});
test("interrupted browser uploads have an authenticated append-only recovery route", () => {
  assert.match(files, /photos.*abandon|Incomplete photo could not be released/);
  assert.match(files, /fail_guided_site_visit_photo_reservation/);
  assert.match(migration, /set state='failed_validation'/);
  assert.doesNotMatch(files, /\.delete\(|\.remove\(/);
});
test("failed uploads preserve evidence without consuming the five meaningful-photo allowance", () => {
  assert.match(
    recoveryMigration,
    /count\(\*\) filter\(where state in \('confirmed','superseded'\)\)/,
  );
  assert.match(recoveryMigration, /meaningful_attempt_count>=5/);
  assert.match(recoveryMigration, /reservation_count>=25/);
  assert.match(recoveryMigration, /recovery_limit_reached/);
  assert.doesNotMatch(recoveryMigration, /delete from|on delete cascade/i);
});
test("beta is owner admin estimator only and retention deletion is gated", () => {
  assert.match(
    migration,
    /where role in \('owner','administrator','estimator'\)/,
  );
  assert.match(
    migration,
    /retention_policy_status text not null default 'pending_approval'/,
  );
  assert.match(migration, /Pre-Production gate/);
  assert.doesNotMatch(
    `${migration}\n${files}`,
    /retention_deadline\s*=|deleted_at\s*=|deletion_pending/,
  );
});
