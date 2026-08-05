import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260806000000_structured_estimate_core.sql";
const migration = readFileSync(migrationPath, "utf8");

test("migration has the exact filename and transactional additive boundary", () => {
  assert.equal(migrationPath, "supabase/migrations/20260806000000_structured_estimate_core.sql");
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(migration, /drop\s+table|drop\s+column|rename\s+(?:column|table)/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.|\bdelete\s+from\s+public\.|\btruncate\b/i);
});

test("migration fails closed against the full audited estimate contract before DDL", () => {
  const assertionEnd = migration.indexOf("create table public.estimate_sections");
  const assertions = migration.slice(0, assertionEnd);
  assert.ok(assertionEnd > 0);
  for (const table of [
    "estimates",
    "estimate_line_items",
    "estimate_options",
    "estimate_material_price_snapshots",
    "material_catalog",
  ]) {
    assert.match(assertions, new RegExp(`'${table}'`));
  }
  for (const marker of [
    "to_regclass",
    "pg_attribute",
    "format_type",
    "attnotnull",
    "pg_constraint",
    "pg_get_constraintdef",
    "pg_get_expr",
    "pg_get_functiondef",
    "relrowsecurity",
    "pg_trigger",
    "pg_get_triggerdef",
    "to_regprocedure('public.set_updated_at()')",
  ]) assert.ok(assertions.includes(marker), `missing assertion marker ${marker}`);
  assert.match(assertions, /regexp_replace\(actual_definition,'\\s\+',' ','g'\)[\s\S]*?regexp_replace\(expected\.constraint_definition,'\\s\+',' ','g'\)/);
  assert.match(assertions, /estimates_status_check[\s\S]*?'draft'[\s\S]*?'void'/);
  assert.match(assertions, /raise exception/);
  assert.match(assertions, /Audited default for public\.%\.% differs from required contract/);
  assert.match(assertions, /t\.tgfoid = 'public\.set_updated_at\(\)'::regprocedure/);
  assert.match(assertions, /t\.tgtype = 19/);
  assert.match(
    assertions,
    /expected_set_updated_at_definition text := \$definition\$CREATE OR REPLACE FUNCTION public\.set_updated_at\(\)[\s\S]*?RETURNS trigger[\s\S]*?LANGUAGE plpgsql[\s\S]*?new\.updated_at = now\(\);[\s\S]*?return new;[\s\S]*?\$function\$[\s\S]*?\$definition\$/i,
  );
  assert.match(
    assertions,
    /select pg_get_functiondef\('public\.set_updated_at\(\)'::regprocedure\)[\s\S]*?regexp_replace\(btrim\(actual_definition\), '\\s\+', ' ', 'g'\)[\s\S]*?regexp_replace\(btrim\(expected_set_updated_at_definition\), '\\s\+', ' ', 'g'\)[\s\S]*?raise exception 'Complete definition for audited public\.set_updated_at\(\) differs from required contract\.'/,
  );
});

test("preexisting foreign keys use stable ordered catalog assertions", () => {
  const assertionEnd = migration.indexOf("create table public.estimate_sections");
  const assertions = migration.slice(0, assertionEnd);
  const foreignKeyStart = assertions.indexOf(") as foreign_keys(");
  const foreignKeyEnd = assertions.indexOf("for expected in", foreignKeyStart + 1);
  const foreignKeyAssertions = assertions.slice(foreignKeyStart, foreignKeyEnd);

  assert.ok(foreignKeyStart > 0);
  assert.ok(foreignKeyEnd > foreignKeyStart);
  assert.match(foreignKeyAssertions, /pc\.contype = 'f'/);
  assert.match(foreignKeyAssertions, /pc\.conrelid = to_regclass\('public\.' \|\| expected\.source_table\)/);
  assert.match(foreignKeyAssertions, /pc\.confrelid = to_regclass\('public\.' \|\| expected\.target_table\)/);
  assert.match(foreignKeyAssertions, /unnest\(pc\.conkey\) with ordinality as key\(attnum, position\)/);
  assert.match(foreignKeyAssertions, /select array_agg\(a\.attname::text order by key\.position\)[\s\S]*?unnest\(pc\.conkey\)[\s\S]*?a\.attrelid = pc\.conrelid/);
  assert.match(foreignKeyAssertions, /unnest\(pc\.confkey\) with ordinality as key\(attnum, position\)/);
  assert.match(foreignKeyAssertions, /select array_agg\(a\.attname::text order by key\.position\)[\s\S]*?unnest\(pc\.confkey\)[\s\S]*?a\.attrelid = pc\.confrelid/);
  assert.match(foreignKeyAssertions, /pc\.confupdtype::text = expected\.update_action/);
  assert.match(foreignKeyAssertions, /pc\.confdeltype::text = expected\.delete_action/);
  assert.match(foreignKeyAssertions, /pc\.confmatchtype::text = expected\.match_type/);
  assert.match(foreignKeyAssertions, /pc\.condeferrable = expected\.is_deferrable/);
  assert.match(foreignKeyAssertions, /pc\.condeferred = expected\.is_deferred/);
  assert.match(foreignKeyAssertions, /pc\.convalidated = expected\.is_validated/);
  assert.doesNotMatch(foreignKeyAssertions, /pg_get_constraintdef|REFERENCES public\./i);

  for (const action of ["'a','n','s'", "'a','c','s'"]) {
    assert.ok(assertions.includes(action), `missing audited FK action tuple ${action}`);
  }

  const exactDefinitionLoop = assertions.slice(foreignKeyEnd);
  assert.match(exactDefinitionLoop, /estimates_status_check[\s\S]*?pg_get_constraintdef/);
  assert.match(exactDefinitionLoop, /estimate_line_items_waste_range[\s\S]*?pg_get_constraintdef/);
  assert.match(exactDefinitionLoop, /material_catalog_waste_percent_range[\s\S]*?pg_get_constraintdef/);
  assert.doesNotMatch(exactDefinitionLoop, /FOREIGN KEY .* REFERENCES public\./i);

  assert.match(assertions, /select pg_get_functiondef\('public\.set_updated_at\(\)'::regprocedure\)/);
  assert.match(assertions, /expected_set_updated_at_definition/);
});

test("estimate sections are ordered, constrained, updated, and server-only", () => {
  assert.match(migration, /create table public\.estimate_sections \([\s\S]*?id uuid primary key default gen_random_uuid\(\)[\s\S]*?estimate_id uuid not null references public\.estimates\(id\) on delete cascade/i);
  assert.match(migration, /name text not null/);
  assert.match(migration, /customer_description text/);
  assert.match(migration, /internal_notes text/);
  assert.match(migration, /sort_order integer not null default 0/);
  assert.match(migration, /check \(btrim\(name\) <> ''\)/);
  assert.match(migration, /check \(sort_order >= 0\)/);
  assert.match(migration, /unique index estimate_sections_id_estimate_uidx[\s\S]*?\(id, estimate_id\)/);
  assert.match(migration, /estimate_sections_estimate_order_idx[\s\S]*?\(estimate_id, sort_order, id\)/);
  assert.match(migration, /create trigger set_estimate_sections_updated_at[\s\S]*?public\.set_updated_at\(\)/);
  assert.match(migration, /alter table public\.estimate_sections enable row level security/);
  assert.match(migration, /revoke all on table public\.estimate_sections from public, anon, authenticated/);
});

test("structured estimate policy is explicit and does not classify legacy rows", () => {
  for (const column of [
    "overhead_percent", "profit_markup_percent", "tax_rate_percent",
    "discount_type", "discount_value", "scope_notes", "exclusions",
    "calculation_policy_version", "calculation_revision", "costs_complete",
    "prices_complete", "item_markup_amount", "overhead_amount",
    "pre_profit_subtotal", "profit_markup_amount", "pre_discount_subtotal",
    "post_discount_subtotal", "taxable_item_price_subtotal",
    "taxable_overhead_amount", "taxable_profit_amount",
    "taxable_discount_amount", "taxable_subtotal",
  ]) assert.match(migration, new RegExp(`add column ${column}\\b`));
  assert.match(migration, /add column calculation_policy_version text[,;]/);
  assert.doesNotMatch(migration, /calculation_policy_version text default/i);
  assert.match(migration, /calculation_policy_version is distinct from 'structured-estimate-v1' or/);
  assert.match(migration, /overhead_percent is not null[\s\S]*?costs_complete is not null and prices_complete is not null/);
  assert.match(migration, /overhead_percent between 0 and 1000/);
  assert.match(migration, /profit_markup_percent between 0 and 1000/);
  assert.match(migration, /tax_rate_percent between 0 and 100/);
  assert.match(migration, /discount_type = 'fixed_amount'/);
  assert.match(migration, /calculation_revision is null or calculation_revision >= 0/);
});

test("line items preserve nullable component inputs and enforce standard and allowance contracts", () => {
  for (const component of [
    "material_unit_cost", "labor_unit_cost", "subcontractor_unit_cost",
    "equipment_unit_cost", "other_direct_unit_cost",
  ]) {
    assert.match(migration, new RegExp(`add column ${component} numeric\\(12,4\\)[,;]`));
    assert.doesNotMatch(migration, new RegExp(`${component} numeric\\(12,4\\) default`, "i"));
  }
  assert.match(migration, /add column item_type text/);
  assert.match(migration, /item_type is null or item_type in \('standard','allowance'\)/);
  assert.match(migration, /section_id is not null/);
  assert.match(migration, /costs_complete = \([\s\S]*?material_unit_cost is not null[\s\S]*?other_direct_unit_cost is not null/);
  for (const component of [
    "material_unit_cost", "labor_unit_cost", "subcontractor_unit_cost",
    "equipment_unit_cost", "other_direct_unit_cost",
  ]) {
    assert.match(
      migration,
      new RegExp(`estimate_line_items_structured_cost_completeness[\\s\\S]*?${component} is not null`),
    );
  }
  assert.match(migration, /null component costs mean unknown/i);
  assert.match(migration, /known non-applicable component must be stored explicitly as 0\.0000/i);
  assert.match(migration, /zero is a known zero cost, not a missing value/i);
  assert.match(migration, /item_type = 'standard'[\s\S]*?fixed_customer_price is null[\s\S]*?prices_complete = costs_complete/);
  assert.match(migration, /item_type = 'allowance'[\s\S]*?fixed_customer_price is not null[\s\S]*?item_markup_percent is null[\s\S]*?prices_complete = true/);
  assert.match(migration, /material_waste_percent between 0 and 100/);
  assert.match(migration, /item_markup_percent between 0 and 1000/);
});

test("same-estimate composite constraints protect sections, options, lines, and snapshots", () => {
  assert.match(migration, /estimate_sections_id_estimate_uidx[\s\S]*?\(id, estimate_id\)/);
  assert.match(migration, /estimate_options_id_estimate_uidx[\s\S]*?\(id, estimate_id\)/);
  assert.match(migration, /estimate_line_items_id_estimate_uidx[\s\S]*?\(id, estimate_id\)/);
  assert.match(migration, /foreign key \(section_id, estimate_id\)[\s\S]*?estimate_sections\(id, estimate_id\)[\s\S]*?not valid/);
  assert.match(migration, /foreign key \(estimate_option_id, estimate_id\)[\s\S]*?estimate_options\(id, estimate_id\)[\s\S]*?not valid/);
  assert.match(migration, /foreign key \(estimate_line_item_id, estimate_id\)[\s\S]*?estimate_line_items\(id, estimate_id\)[\s\S]*?not valid/);
  assert.match(migration, /create or replace function public\.enforce_estimate_snapshot_consistency\(\)/);
  assert.match(migration, /line_option_id is distinct from new\.estimate_option_id/);
  assert.match(migration, /before insert or update on public\.estimate_material_price_snapshots/);
  assert.doesNotMatch(migration, /estimate_line_item_id\s+set not null|unique\s*\(estimate_line_item_id\)/i);
  assert.match(migration, /Consistency under later line-option reassignment must be addressed before estimate options are activated/i);
});

test("new structured checks and composite foreign keys remain unvalidated", () => {
  const structuredConstraints = [
    ...migration.matchAll(/add constraint (estimates_structured_[a-z_]+|estimate_line_items_structured_[a-z_]+)\s+check\s*\([\s\S]*?\)\s+not valid/gi),
  ].map((match) => match[1]);
  assert.deepEqual(new Set(structuredConstraints), new Set([
    "estimates_structured_overhead_range",
    "estimates_structured_profit_markup_range",
    "estimates_structured_tax_range",
    "estimates_structured_discount_type",
    "estimates_structured_discount_nonnegative",
    "estimates_structured_revision_nonnegative",
    "estimates_structured_policy_version",
    "estimates_structured_contract",
    "estimate_line_items_structured_item_type",
    "estimate_line_items_structured_required",
    "estimate_line_items_structured_component_costs",
    "estimate_line_items_structured_waste_range",
    "estimate_line_items_structured_markup_range",
    "estimate_line_items_structured_fixed_price_nonnegative",
    "estimate_line_items_structured_cost_completeness",
    "estimate_line_items_structured_kind_contract",
  ]));

  for (const name of [
    "estimate_line_items_section_estimate_fkey",
    "estimate_line_items_option_estimate_fkey",
    "estimate_snapshots_line_estimate_fkey",
    "estimate_snapshots_option_estimate_fkey",
  ]) {
    assert.match(migration, new RegExp(`add constraint ${name} foreign key \\([\\s\\S]*?on delete cascade not valid`, "i"));
  }
});

test("new PostgreSQL identifiers fit the 63-byte identifier limit", () => {
  const identifiers = [...migration.matchAll(
    /(?:add constraint|create (?:unique )?index|create trigger|create (?:or replace )?function)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
  )].map((match) => match[1]);
  assert.ok(identifiers.length > 0);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, `${identifier} exceeds 63 bytes`);
  }
});

test("legacy mirrors are documented and deferred workflows remain inactive", () => {
  for (const mirror of [
    "base_unit_cost", "waste_percent", "markup_percent", "pricing_method",
    "estimated_cost", "total_price", "subtotal_cost", "subtotal_price",
    "contingency_amount",
  ]) assert.match(migration, new RegExp(`comment on column public\\.[\\s\\S]*?\\.${mirror} is`));
  assert.doesNotMatch(migration, /create table public\.(?:estimate_versions|estimate_templates|estimate_assemblies)/i);
  assert.doesNotMatch(migration, /feature_settings|send_proposals|superseded|artificial intelligence|\bai\b|takeoff/i);
  assert.doesNotMatch(migration, /target_margin_percent\s*=|pricing_method\s*=\s*'target_margin'/i);
});

test("estimate-domain grants are hardened without changing material catalog access", () => {
  assert.match(migration, /revoke all on table public\.estimates, public\.estimate_sections, public\.estimate_line_items,[\s\S]*?public\.estimate_options, public\.estimate_material_price_snapshots from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.estimates[\s\S]*?to service_role/);
  assert.doesNotMatch(migration, /(?:grant|revoke|alter table)\s+[\s\S]{0,80}public\.material_catalog/i);
  assert.doesNotMatch(migration, /(?:enable|disable|force|no force) row level security[\s\S]{0,80}public\.material_catalog|alter table\s+public\.material_catalog[\s\S]{0,80}row level security/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*?material_catalog|alter policy[\s\S]*?material_catalog|drop policy[\s\S]*?material_catalog/i);
  assert.doesNotMatch(migration, /create policy/i);
});
