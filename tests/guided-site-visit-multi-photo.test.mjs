import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260813103000_guided_site_visit_multi_photo_sets.sql",
  "utf8",
);
const uploadRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/photos/upload-session/route.ts",
  "utf8",
);
const confirmationRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/photo-set-confirmation/route.ts",
  "utf8",
);
const component = readFileSync(
  "src/components/estimates/guided-deck-site-visit.tsx",
  "utf8",
);

test("keeps a bounded active photo set with one in-flight upload", () => {
  assert.match(
    migration,
    /drop index if exists public\.guided_site_visit_one_confirmed_photo_per_item_uidx/,
  );
  assert.match(migration, /guided_site_visit_one_inflight_photo_per_item_uidx/);
  assert.match(migration, /active_count>=5/);
  assert.match(migration, /meaningful_count>=10/);
  assert.match(migration, /total_count>=25/);
});

test("distinguishes additions from targeted replacements", () => {
  assert.match(
    migration,
    /capture_intent in\('initial','complement','retake'\)/,
  );
  assert.match(migration, /requested_from_visible_fact_decision_id/);
  assert.match(migration, /set state='superseded'.*retake_of_attempt_id/s);
  assert.match(migration, /add_complementary_photo/);
  assert.match(component, /Add another view/);
  assert.match(component, /Replace this photo/);
});

test("preserves exact upload retries and private-storage failure recovery", () => {
  assert.match(uploadRoute, /stableUuid/);
  assert.match(uploadRoute, /idempotentReplay/);
  assert.match(uploadRoute, /fail_guided_site_visit_photo_reservation/);
  assert.match(uploadRoute, /upsert: false/);
  assert.match(
    migration,
    /existing\.state='upload_pending'.*source_asset\.status='upload_pending'/s,
  );
  assert.match(migration, /already_confirmed/);
  assert.match(migration, /reservation_failed/);
  assert.doesNotMatch(migration, /return query select 'retry_conflict'/);
});

test("binds AI retakes to the exact selected photo and records manual authority", () => {
  assert.match(
    migration,
    /source_decision\.photo_attempt_id is distinct from requested_retake_of_attempt_id/,
  );
  assert.match(migration, /d\.photo_attempt_id=new\.retake_of_attempt_id/);
  assert.match(
    migration,
    /null source decision is an explicit manual retake authorized by the authenticated actor/,
  );
  assert.doesNotMatch(migration, /retake_evidence_required/);
});

test("photo-attempt identity and reservation provenance are immutable", () => {
  assert.match(
    migration,
    /prevent_guided_site_visit_photo_attempt_provenance_mutation/,
  );
  for (const field of [
    "company_id",
    "visit_id",
    "visit_item_id",
    "asset_id",
    "retake_of_attempt_id",
    "capture_intent",
    "requested_from_visible_fact_decision_id",
    "reservation_idempotency_key",
    "reserved_by_auth_user_id",
    "resulting_reservation_revision",
  ])
    assert.match(
      migration,
      new RegExp(`new\\.${field} is distinct from old\\.${field}`),
    );
  assert.match(migration, /old\.state='confirmed' and new\.state='superseded'/);
  assert.match(
    migration,
    /capture_intent is null or\s+reservation_idempotency_key is not null and reserved_by_auth_user_id is not null and resulting_reservation_revision is not null/,
  );
});

test("requires an immutable human-confirmed source for every visible criterion", () => {
  assert.match(migration, /guided_site_visit_photo_set_confirmations/);
  assert.match(migration, /guided_site_visit_photo_set_confirmation_facts/);
  assert.match(migration, /source_visible_fact_review_id/);
  assert.match(migration, /state='confirmed'/);
  assert.match(migration, /prevent_guided_photo_set_confirmation_mutation/);
  assert.match(confirmationRoute, /confirm_guided_site_visit_photo_set/);
  assert.match(component, /Combined photo coverage/);
  assert.match(
    migration,
    /existing\.confirmed_observation is not distinct from requested_observation/,
  );
});

test("keeps human corrections explicit instead of rewriting AI evidence", () => {
  assert.match(
    migration,
    /human_decision text not null check\(human_decision in\('accepted','corrected'\)\)/,
  );
  assert.match(
    migration,
    /source_status text not null check\(source_status in\('visible','not_visible','unclear'\)\)/,
  );
  assert.match(component, /factOverrides/);
  assert.doesNotMatch(
    migration,
    /update public\.guided_site_visit_ai_visible_fact_reviews/,
  );
});

test("a human-corrected all-visible review can request a complementary photo", () => {
  assert.match(
    component,
    /factOverrides\[entry\.review\.id\]\?\.\[criterion\.criterionKey\]/,
  );
  assert.match(
    component,
    /const effectiveCriteria = source\.review\.criteria\.map/,
  );
  assert.match(component, /finalCriteria: effectiveCriteria/);
  assert.match(component, /JSON\.stringify\(effectiveCriteria\)/);
  assert.match(component, /actionCode: "change_angle" as const/);
  assert.match(component, /factOverrides\[visibleFacts\.reviewId\] \?\?/);
  assert.match(component, /onAccept=\{acceptPhotoSet\}/);
  assert.doesNotMatch(component, /function acceptFacts\(/);
});
