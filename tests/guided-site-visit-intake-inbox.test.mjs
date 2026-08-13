import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql = readFileSync(
    "supabase/migrations/20260813140000_guided_deck_visit_intake_inbox.sql",
    "utf8",
  ),
  criterionFix = readFileSync(
    "supabase/migrations/20260813141000_fix_guided_deck_intake_criterion_membership.sql",
    "utf8",
  ),
  batch = readFileSync(
    "src/app/api/guided-site-visits/[visitId]/intake-batches/route.ts",
    "utf8",
  ),
  upload = readFileSync(
    "src/app/api/guided-site-visits/[visitId]/intake-batches/[batchId]/members/[ordinal]/upload-session/route.ts",
    "utf8",
  ),
  classification = readFileSync(
    "src/app/api/guided-site-visits/[visitId]/intake-photos/[attemptId]/classification-reviews/route.ts",
    "utf8",
  ),
  assignment = readFileSync(
    "src/app/api/guided-site-visits/[visitId]/intake-photos/[attemptId]/assignment-events/route.ts",
    "utf8",
  );
test("adds a Deck whole-visit inbox after the applied item batch migration", () => {
  assert.match(sql, /member_count between 1 and 30/);
  assert.match(sql, /declared_byte_size between 1 and 15728640/);
  assert.match(batch, /GUIDED_INTAKE_TOTAL_WARNING_BYTES/);
  assert.doesNotMatch(sql, /project_activity/i);
});
test("manifest and evidence provenance are immutable and tenant scoped", () => {
  assert.match(sql, /foreign key\(visit_id,company_id\)/);
  assert.match(
    sql,
    /before update or delete on public\.guided_site_visit_intake_batches/,
  );
  assert.match(
    sql,
    /before update or delete on public\.guided_site_visit_intake_members/,
  );
  assert.match(
    sql,
    /before update or delete on public\.guided_site_visit_intake_classification_reviews/,
  );
  assert.match(
    sql,
    /guided_site_visit_actor_company\(requested_auth_user_id\)/,
  );
  assert.match(
    batch,
    /company_id.*authorization.*companyId|company_id",auth\.authorization!\.companyId/s,
  );
});
test("sequential uploads preserve revisions, exact replay, and private no-upsert storage", () => {
  assert.match(sql, /guided_visit_intake_one_inflight_per_batch_uidx/);
  assert.match(sql, /out_of_sequence/);
  assert.match(sql, /visit\.revision<>requested_expected_revision/);
  assert.match(sql, /reservation_idempotency_key/);
  assert.match(upload, /createSignedUploadUrl/);
  assert.match(upload, /upsert:false/);
  assert.match(upload, /requested_expected_revision:revision/);
});
test("failed transport is append-only recoverable and the same ordinal may retry", () => {
  assert.match(sql, /fail_guided_site_visit_intake_member/);
  assert.match(sql, /set state='abandoned'/);
  assert.match(sql, /set status='failed_validation'/);
  assert.match(
    sql,
    /coalesce\(max\(member_ordinal\),0\)\+1.*state='confirmed'/,
  );
  assert.match(
    sql,
    /existing\.state='upload_pending'.*'ok'.*existing\.state='confirmed'.*'member_confirmed'.*'reservation_failed'/s,
  );
  assert.match(upload, /fail_guided_site_visit_intake_member/);
  assert.match(upload, /requested_expected_revision:row\.next_revision/);
  assert.match(upload, /if\(!row\.idempotent_replay\)/);
});
test("exact replay binds storage and every immutable member declaration", () => {
  assert.match(sql, /existing\.asset_id=requested_asset_id/);
  assert.match(sql, /a\.storage_path=requested_storage_path/);
  assert.match(sql, /a\.original_filename=m\.original_filename/);
  assert.match(sql, /a\.mime_type=m\.mime_type/);
  assert.match(sql, /a\.declared_byte_size=m\.declared_byte_size/);
  assert.match(sql, /a\.declared_sha256=m\.declared_sha256/);
});
test("AI only proposes and humans append assignment decisions", () => {
  assert.match(
    sql,
    /diagnostic_class in \('classified','retake_recommended','review_unavailable','unsupported_media'\)/,
  );
  assert.match(sql, /decision in \('accepted','corrected','excluded'\)/);
  assert.match(sql, /AI proposals never confirm evidence/);
  assert.match(sql, /count\(distinct asset_id\)/);
  assert.match(sql, /active_count>=5/);
  assert.match(classification, /safeDiagnostic/);
  assert.doesNotMatch(
    classification,
    /responseText|Authorization|OPENAI_API_KEY/,
  );
  assert.match(assignment, /active_evidence_limit/);
});
test("unavailable and unclassified photos cannot become accepted evidence", () => {
  assert.match(sql, /review\.id is null.*invalid_assignment/s);
  assert.match(sql, /classification_review_id/);
  assert.doesNotMatch(batch, /missing/i);
});
test("usability gates classification and assignment", () => {
  assert.match(classification, /usabilityVerdict/);
  assert.match(
    classification,
    /result\.usabilityVerdict\s*===\s*"usable"\s*\?\s*result\.proposals\s*:\s*\[\]/,
  );
  assert.match(sql, /review\.diagnostic_class<>'classified'/);
  assert.match(
    sql,
    /diagnostic_class<>'classified' and requested_proposals<>'\[\]'::jsonb/,
  );
});
test("forward fix uses PostgreSQL array membership for AI criteria", () => {
  assert.match(
    criterionFix,
    /create or replace function public\.record_guided_site_visit_intake_classification/,
  );
  assert.match(
    criterionFix,
    /create or replace function public\.decide_guided_site_visit_intake_assignment/,
  );
  assert.match(
    criterionFix,
    /\(p->>'criterionKey'\)=any\(public\.guided_site_visit_visible_fact_keys\(i\.item_key\)\)/,
  );
  assert.match(
    criterionFix,
    /requested_criterion_key=any\(public\.guided_site_visit_visible_fact_keys\(item\.item_key\)\)/,
  );
  assert.doesNotMatch(criterionFix, /visible_fact_keys\([^)]*\)\?/);
});
