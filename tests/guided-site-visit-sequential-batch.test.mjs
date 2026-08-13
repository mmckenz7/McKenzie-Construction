import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260813130000_guided_site_visit_sequential_photo_batches.sql",
  "utf8",
);
const batchRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/photo-batches/route.ts",
  "utf8",
);
const uploadRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/photos/upload-session/route.ts",
  "utf8",
);

test("adds immutable actor and item bound sequential batches in a forward migration", () => {
  assert.match(migration, /create table public\.guided_site_visit_photo_batches/);
  assert.match(migration, /created_by_auth_user_id uuid not null/);
  assert.match(migration, /foreign key \(visit_item_id, visit_id, company_id\)/);
  assert.match(migration, /member_count between 1 and 5/);
  assert.match(migration, /before update or delete on public\.guided_site_visit_photo_batches/);
  assert.match(migration, /before update or delete on public\.guided_site_visit_photo_batch_members/);
  assert.match(migration, /alter table public\.guided_site_visit_photo_attempts/);
  assert.match(migration, /drop constraint guided_site_visit_photo_capture_intent_check/);
});

test("batch creation is exact-replay, actor-bound, and tenant-scoped", () => {
  assert.match(migration, /guided_site_visit_actor_company\(requested_auth_user_id\)/);
  assert.match(migration, /company_id = company and idempotency_key/);
  assert.match(migration, /existing\.created_by_auth_user_id = requested_auth_user_id/);
  assert.match(migration, /where id = requested_visit_id and company_id = company for update/);
  assert.match(batchRoute, /create_guided_site_visit_photo_batch/);
  assert.match(batchRoute, /requestFingerprint/);
  assert.match(batchRoute, /stableUuid/);
});

test("batch members reuse the existing reservation invariants serially", () => {
  assert.match(migration, /reserve_guided_site_visit_photo_batch_member/);
  assert.match(migration, /capture_intent in \('initial', 'complement', 'retake', 'batch'\)/);
  assert.match(migration, /requested_capture_intent <> 'batch'/);
  assert.match(migration, /state in \('upload_pending', 'quarantined'\)/);
  assert.match(migration, /active_count >= 5/);
  assert.match(migration, /visit\.revision <> requested_expected_revision/);
  assert.match(migration, /requested_batch_ordinal > batch\.member_count/);
  assert.match(migration, /primary key \(batch_id, batch_ordinal, photo_attempt_id\)/);
  assert.match(migration, /unique \(photo_attempt_id\)/);
  assert.match(uploadRoute, /requested_batch_id: batchId/);
  assert.match(uploadRoute, /requested_batch_ordinal: batchOrdinal/);
  assert.match(uploadRoute, /batch_member_conflict/);
  assert.match(uploadRoute, /captureIntent === "batch"/);
  assert.doesNotMatch(migration, /drop index.*one_inflight/s);
  assert.doesNotMatch(
    migration,
    /from public\.reserve_guided_site_visit_photo_set_member/,
  );
  assert.match(
    migration,
    /prior\.batch_ordinal = requested_batch_ordinal\s+and attempt\.state <> 'failed_validation'/,
  );
});

test("legacy single-photo callers remain supported", () => {
  assert.match(
    uploadRoute,
    /batchId === null\s*\? "reserve_guided_site_visit_photo_set_member"/,
  );
  assert.match(uploadRoute, /\(batchId === null\) !== \(batchOrdinal === null\)/);
  assert.match(uploadRoute, /upsert: false/);
});
