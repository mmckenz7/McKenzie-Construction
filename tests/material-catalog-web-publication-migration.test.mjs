import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path =
  "supabase/migrations/20260810160000_material_catalog_web_lookup_publication.sql";
const migration = readFileSync(path, "utf8");

test("web publication migration is transactional, additive, and narrowly classified", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /import_type in \('csv', 'xlsx', 'xls', 'api', 'web_lookup'\)/);
  assert.match(migration, /source_type in \('manual', 'csv', 'spreadsheet', 'api', 'web_lookup', 'legacy'\)/);
  assert.doesNotMatch(migration, /drop table|drop column|truncate|delete from/i);
});

test("published evidence has defense-in-depth idempotency and remains append-only", () => {
  assert.match(migration, /supplier_offer_observation_evidence_uidx/);
  assert.match(migration, /company_id, raw_record_sha256/);
  assert.match(migration, /idempotency_key = requested_idempotency_key/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idempotentReplay/);
  assert.match(migration, /A correction must use a newly hashed corrected envelope/);
  assert.doesNotMatch(
    migration,
    /update public\.(supplier_offer_observations|supplier_offer_observation_prices|material_import_publications|material_import_publication_rows)/i,
  );
});

test("stage, product review, preview, approval, and publication are separate atomic RPCs", () => {
  for (const rpc of [
    "stage_material_catalog_web_lookup_import",
    "review_material_catalog_web_lookup_import",
    "preview_material_catalog_web_lookup_import",
    "approve_material_catalog_import",
    "publish_material_catalog_import",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`));
  }
  assert.match(migration, /assert_material_catalog_mutation_access/);
  assert.match(migration, /select \* into batch_record[\s\S]*?for update/);
  assert.match(migration, /existing immutable preview is incomplete/i);
  assert.match(migration, /approved pilot requires exactly four/);
  assert.match(migration, /source row numbers must cover 1 through 4 exactly once/i);
  assert.match(migration, /01c14b6ad3536b100bc308126e88bea19658f3406f7e1d6c14f27c196872c9f1/);
  for (const hash of [
    "8587161a760ae10c57253d59c1b42837ebad1d33b11c98ada3543e4a67b55582",
    "9c4d520d25a93ba6cb6d193d3eb00d006e3195d009f4ac6021422d42c024311e",
    "ef0d643798c2d77802ee873b35a90264bf0071e394cfd3ba3cdf2a3e02e86e4a",
    "f5cfd1193c06a950be237a6b8aaa547fc4e831c4f9fdece760b2e50e6bfcb507",
  ]) assert.match(migration, new RegExp(hash));
});

test("atomic publication locks and revalidates tenant, actor, feature, review, and preview", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /get_effective_user_access\(requested_auth_user_id\)/);
  assert.match(migration, /edit_prices/);
  assert.match(migration, /manage_suppliers/);
  assert.match(migration, /material_catalog_price_publication/);
  assert.match(migration, /for update/);
  assert.match(migration, /reviewed_row_revision <> item_record\.row_revision/);
  assert.match(migration, /preview_record\.batch_revision <> batch_record\.batch_revision/);
  assert.match(migration, /revoke all on function[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*?to service_role/);
});

test("the pilot publication contract cannot invent operational facts", () => {
  assert.match(migration, /availabilityStatus' <> 'unknown'/);
  assert.match(migration, /priceType' <> 'retail'/);
  assert.match(migration, /currencyCode' <> 'USD'/);
  assert.match(migration, /confidence' <> 'confirmed'/);
  assert.match(migration, /taxIncluded/);
  assert.match(migration, /https:\/\/www\\\.lowes\\\.com\/pd/);
  assert.match(migration, /localized_search_results/);
  assert.match(migration, /priceSourceReference/);
  assert.match(migration, /identitySourceReference/);
  assert.doesNotMatch(migration, /delivery_cost[\s\S]*?values/i);
});

test("publication does not mutate estimates, proposals, contracts, or legacy prices", () => {
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.(?:material_supplier_prices|estimates|estimate_line_items|estimate_material_price_snapshots|estimate_proposals|estimate_contract_preparations|projects)/i,
  );
});
