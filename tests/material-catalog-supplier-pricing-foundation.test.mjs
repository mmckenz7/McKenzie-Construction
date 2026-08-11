import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260810080000_material_catalog_supplier_pricing_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");

function tableDefinition(tableName) {
  const start = migration.indexOf(`create table public.${tableName} (`);
  assert.ok(start >= 0, `missing ${tableName}`);
  const end = migration.indexOf("\n);", start);
  assert.ok(end > start, `unterminated ${tableName}`);
  return migration.slice(start, end + 3);
}

test("material catalog foundation is transactional, additive, and fail-closed", () => {
  assert.equal(
    migrationPath,
    "supabase/migrations/20260810080000_material_catalog_supplier_pricing_foundation.sql",
  );
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(migration, /drop\s+(?:table|column|constraint|index)|rename\s+(?:column|table)/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.|\bdelete\s+from\s+public\.|\btruncate\b/i);

  const firstCreate = migration.indexOf("create table public.material_manufacturers");
  const audit = migration.slice(0, firstCreate);
  assert.ok(firstCreate > 0);
  for (const table of [
    "company_settings",
    "material_catalog",
    "material_price_imports",
    "suppliers",
    "supplier_locations",
  ]) {
    assert.match(audit, new RegExp(`'${table}'`));
  }
  for (const marker of [
    "to_regclass",
    "pg_attribute",
    "format_type",
    "attnotnull",
    "to_regprocedure('public.set_updated_at()')",
    "raise exception",
  ]) {
    assert.ok(audit.includes(marker), `missing audit marker ${marker}`);
  }
});

test("canonical identity is additive and does not classify legacy products", () => {
  const alteration = migration.match(
    /alter table public\.material_catalog\s+add column mckenzie_product_code[\s\S]*?add column row_revision integer not null default 0;/i,
  )?.[0];
  assert.ok(alteration);

  for (const nullableIdentityColumn of [
    "mckenzie_product_code",
    "manufacturer_id",
    "manufacturer_part_number_normalized",
    "category_id",
    "canonical_name",
    "stocking_unit_id",
    "lifecycle_status",
    "superseded_by_product_id",
    "identity_fingerprint",
    "identity_version",
  ]) {
    assert.doesNotMatch(
      alteration,
      new RegExp(`add column ${nullableIdentityColumn}[^,;]*\\bnot null\\b`, "i"),
    );
  }

  assert.match(migration, /material_catalog_product_code_uidx/);
  assert.match(migration, /material_catalog_manufacturer_mpn_uidx/);
  assert.match(migration, /material_catalog_supersession_contract[\s\S]*?not valid/i);
  assert.match(migration, /comment on column public\.material_catalog\.unit_cost[\s\S]*?New supplier imports must not update this field/i);
  assert.match(migration, /comment on column public\.material_catalog\.sku[\s\S]*?supplier_product_offers/i);
});

test("identity, attributes, aliases, and units are supplier-neutral", () => {
  for (const table of [
    "material_manufacturers",
    "material_categories",
    "units_of_measure",
    "unit_aliases",
    "product_attribute_definitions",
    "product_attribute_values",
    "product_aliases",
    "product_unit_conversions",
  ]) {
    tableDefinition(table);
  }

  assert.match(
    tableDefinition("units_of_measure"),
    /dimension in \('count', 'length', 'area', 'volume', 'mass', 'package'\)/,
  );
  assert.match(
    tableDefinition("units_of_measure"),
    /base_numerator numeric\(24,8\)[\s\S]*?base_denominator numeric\(24,8\)/,
  );
  for (const unitCode of ["EA", "LF", "SF", "PACK", "BUNDLE"]) {
    assert.match(migration, new RegExp(`\\('${unitCode}',`));
  }
  assert.match(
    tableDefinition("product_unit_conversions"),
    /package_contents[\s\S]*?length_per_each[\s\S]*?coverage_per_each[\s\S]*?coverage_per_package[\s\S]*?yield/,
  );
  assert.doesNotMatch(migration, /\btrex\b|lowe'?s/i);
});

test("supplier offers separate stable mappings from observations", () => {
  const offers = tableDefinition("supplier_product_offers");
  for (const field of [
    "supplier_id",
    "supplier_location_id",
    "material_catalog_id",
    "supplier_sku_normalized",
    "sell_unit_id",
    "product_unit_conversion_id",
    "minimum_order_quantity",
    "order_increment",
    "mapping_status",
    "row_revision",
  ]) {
    assert.match(offers, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(offers, /\bunit_cost\b|\blist_price\b|\bcontractor_price\b/);
  assert.match(offers, /foreign key \(supplier_location_id, supplier_id\)[\s\S]*?supplier_locations\(id, supplier_id\)/);
  assert.match(migration, /supplier_product_offers_supplier_sku_uidx[\s\S]*?supplier_location_id is null/);
  assert.match(migration, /supplier_product_offers_location_sku_uidx[\s\S]*?supplier_location_id is not null/);
});

test("price and availability observations are company-scoped append-only evidence", () => {
  const observations = tableDefinition("supplier_offer_observations");
  const prices = tableDefinition("supplier_offer_observation_prices");

  for (const field of [
    "supplier_product_offer_id",
    "company_id",
    "company_supplier_account_id",
    "supplier_location_id",
    "observed_at",
    "effective_from",
    "availability_status",
    "inventory_quantity",
    "lead_time_min",
    "lead_time_max",
    "delivery_cost",
    "raw_record_sha256",
    "corrects_observation_id",
  ]) {
    assert.match(observations, new RegExp(`\\b${field}\\b`));
  }
  assert.match(observations, /foreign key \(company_supplier_account_id, company_id, supplier_id\)/);
  assert.match(observations, /foreign key \(supplier_product_offer_id, supplier_id\)/);
  assert.match(prices, /price_type text not null[\s\S]*?'list'[\s\S]*?'contractor'[\s\S]*?'negotiated'/);
  assert.match(prices, /price_quantity numeric\(24,8\) not null default 1/);
  assert.match(prices, /tax_included boolean/);

  assert.match(migration, /create or replace function public\.prevent_material_price_history_mutation\(\)/);
  for (const table of [
    "supplier_offer_observations",
    "supplier_offer_observation_prices",
    "material_import_publications",
  ]) {
    assert.match(
      migration,
      new RegExp(`before update or delete on public\\.${table}[\\s\\S]*?prevent_material_price_history_mutation`),
    );
  }
});

test("imports stage rows through review, preview, and immutable publication", () => {
  for (const table of [
    "supplier_import_profiles",
    "material_catalog_import_batches",
    "material_price_import_rows",
    "material_import_match_candidates",
    "material_import_review_decisions",
    "material_import_change_previews",
    "material_import_change_items",
    "material_import_publications",
    "material_import_publication_rows",
  ]) {
    tableDefinition(table);
  }

  const batches = tableDefinition("material_catalog_import_batches");
  for (const state of [
    "uploaded",
    "mapping_required",
    "normalizing",
    "matching",
    "review_required",
    "preview_ready",
    "approved",
    "publishing",
    "published",
    "published_with_exclusions",
    "failed",
    "cancelled",
  ]) {
    assert.match(batches, new RegExp(`'${state}'`));
  }
  assert.match(batches, /approved_preview_sha256/);
  assert.match(batches, /batch_revision integer not null default 0/);

  const rows = tableDefinition("material_price_import_rows");
  assert.match(rows, /raw_row jsonb not null/);
  assert.match(rows, /raw_row_sha256 text not null/);
  assert.match(rows, /normalized_row jsonb not null/);
  assert.match(rows, /validation_errors jsonb not null/);
  assert.match(rows, /row_revision integer not null default 0/);

  const candidates = tableDefinition("material_import_match_candidates");
  assert.match(candidates, /confidence_score numeric\(6,5\) not null check \(confidence_score between 0 and 1\)/);
  assert.match(candidates, /score_components jsonb/);
  assert.match(candidates, /has_hard_conflict boolean/);

  const decisions = tableDefinition("material_import_review_decisions");
  assert.match(decisions, /reviewed_row_revision integer not null/);
  assert.match(decisions, /decided_by_auth_user_id uuid not null/);
  assert.match(migration, /material_import_active_decision_uidx[\s\S]*?where invalidated_at is null/);

  const publications = tableDefinition("material_import_publications");
  assert.match(publications, /preview_sha256 text not null/);
  assert.match(publications, /idempotency_key text not null/);
  assert.match(publications, /published_observation_count integer not null/);
  assert.match(publications, /excluded_row_count integer not null/);
  assert.match(publications, /unique \(import_id\)/);
  assert.match(publications, /unique \(company_id, idempotency_key\)/);

  const publicationRows = tableDefinition("material_import_publication_rows");
  assert.match(publicationRows, /outcome text not null check \(outcome in \('published', 'excluded'\)\)/);
  assert.match(publicationRows, /foreign key \(publication_id, import_id, company_id\)/);
  assert.match(publicationRows, /foreign key \(import_row_id, import_id, company_id\)/);
  assert.match(publicationRows, /foreign key \(supplier_offer_observation_id, company_id\)/);
  assert.doesNotMatch(publications, /uuid\[\]/);
});

test("new catalog tables are server-only and RLS-enabled", () => {
  const securityBlock = migration.match(/do \$security\$[\s\S]*?\$security\$;/)?.[0];
  assert.ok(securityBlock);

  for (const table of [
    "material_manufacturers",
    "material_categories",
    "units_of_measure",
    "unit_aliases",
    "product_attribute_definitions",
    "product_attribute_values",
    "product_aliases",
    "product_unit_conversions",
    "company_supplier_accounts",
    "supplier_product_offers",
    "supplier_offer_observations",
    "supplier_offer_observation_prices",
    "supplier_import_profiles",
    "material_catalog_import_batches",
    "material_price_import_rows",
    "material_import_match_candidates",
    "material_import_review_decisions",
    "material_import_change_previews",
    "material_import_change_items",
    "material_import_publications",
    "material_import_publication_rows",
  ]) {
    assert.match(securityBlock, new RegExp(`'${table}'`));
  }

  assert.match(securityBlock, /enable row level security/);
  assert.match(securityBlock, /revoke all on table[\s\S]*?from public, anon, authenticated/);
  assert.match(securityBlock, /grant select, insert, update, delete[\s\S]*?to service_role/);
  assert.doesNotMatch(migration, /create policy/i);

  assert.match(
    migration,
    /revoke update, delete on table[\s\S]*?supplier_offer_observations[\s\S]*?supplier_offer_observation_prices[\s\S]*?material_import_change_previews[\s\S]*?material_import_change_items[\s\S]*?material_import_publications[\s\S]*?material_import_publication_rows[\s\S]*?from service_role/,
  );
});

test("foundation does not change estimate or purchasing workflows", () => {
  assert.doesNotMatch(migration, /alter table public\.(?:estimates|estimate_line_items|estimate_material_price_snapshots|projects|project_costs|project_material_phases|project_procurement_settings)/i);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.(?:create_structured_estimate_item|update_structured_estimate_item|issue_estimate_proposal)/i);
  assert.doesNotMatch(migration, /purchase_orders|purchase_order_lines/i);
  assert.doesNotMatch(migration, /material_supplier_prices\s+(?:set|values)|insert into public\.material_supplier_prices|update public\.material_supplier_prices/i);
});

test("new PostgreSQL identifiers fit the 63-byte limit", () => {
  const identifiers = [...migration.matchAll(
    /(?:add constraint|create (?:unique )?index|create trigger|create (?:or replace )?function)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
  )].map((match) => match[1]);
  assert.ok(identifiers.length > 0);
  for (const identifier of identifiers) {
    assert.ok(
      Buffer.byteLength(identifier, "utf8") <= 63,
      `${identifier} exceeds 63 bytes`,
    );
  }
});
