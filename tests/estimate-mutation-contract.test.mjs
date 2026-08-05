import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260806030000_estimate_transactional_mutations.sql", "utf8");

const rpcNames = [
  "create_structured_estimate_section", "update_structured_estimate_section", "delete_structured_estimate_section",
  "create_structured_estimate_item", "update_structured_estimate_item", "delete_structured_estimate_item",
];

test("migration creates six explicit transactional RPCs with stable signatures", () => {
  for (const name of rpcNames) assert.equal((migration.match(new RegExp(`create function public\\.${name}\\(`, "g")) ?? []).length, 1);
  assert.match(migration, /create_structured_estimate_section\(\s*requested_estimate_id uuid, requested_expected_revision integer, requested_section_id uuid,[\s\S]*?requested_sort_order integer/);
  assert.match(migration, /create_structured_estimate_item\(\s*requested_estimate_id uuid, requested_expected_revision integer, requested_item_id uuid,[\s\S]*?requested_item jsonb, requested_item_calculations jsonb, requested_estimate_calculation jsonb/);
  assert.match(migration, /delete_structured_estimate_item\(\s*requested_estimate_id uuid, requested_expected_revision integer, requested_item_id uuid,[\s\S]*?requested_item_calculations jsonb, requested_estimate_calculation jsonb/);
  assert.doesNotMatch(migration, /requested_operation|operation_selector|case\s+requested_/i);
});

test("every writer locks and checks the shared revision, draft, and policy", () => {
  assert.equal((migration.match(/for update;/g) ?? []).length, 6);
  assert.equal((migration.match(/current_policy is distinct from 'structured-estimate-v1'/g) ?? []).length, 6);
  assert.equal((migration.match(/current_status <> 'draft'/g) ?? []).length, 6);
  assert.equal((migration.match(/current_revision <> requested_expected_revision/g) ?? []).length, 6);
  assert.equal((migration.match(/calculation_revision\s*=\s*requested_expected_revision\s*\+\s*1/g) ?? []).length, 4);
});

test("section changes preserve totals and refuse hidden cascade deletion", () => {
  const sectionSql = migration.slice(migration.indexOf("create function public.create_structured_estimate_section"), migration.indexOf("-- Item mutation functions"));
  assert.doesNotMatch(sectionSql, /subtotal_|estimated_|tax_amount|jsonb|estimate_line_items\s+set|delete from public\.estimate_line_items/i);
  assert.match(sectionSql, /exists\(select 1 from public\.estimate_line_items where estimate_id=requested_estimate_id and section_id=requested_section_id\)/);
  assert.match(sectionSql, /section_not_empty/);
});

test("item bundles enforce complete ID and canonical correspondence", () => {
  assert.equal((migration.match(/jsonb_typeof\(requested_item_calculations\) <> 'array'/g) ?? []).length, 3);
  assert.match(migration, /requested_estimate_calculation \?& array\[/);
  assert.match(migration, /entry \?& array\[/);
  assert.match(migration, /bundle_count <> row_count/);
  assert.match(migration, /group by \(entry->>'id'\)::uuid/);
  assert.match(migration, /duplicates\.count <> 1/);
  for (const field of ["section_id", "item_type", "quantity", "unit", "customer_description", "internal_description", "material_unit_cost", "labor_unit_cost", "subcontractor_unit_cost", "equipment_unit_cost", "other_direct_unit_cost", "material_waste_percent", "item_markup_percent", "taxable", "is_included", "fixed_customer_price", "sort_order"]) {
    assert.match(migration, new RegExp(`entry->>'${field}'`));
  }
  assert.match(migration, /is not distinct from line\.material_unit_cost/);
  assert.match(migration, /is not distinct from line\.item_markup_percent/);
});

test("migration fails closed if obsolete or overloaded mutation RPCs exist", () => {
  assert.match(migration, /from pg_proc p[\s\S]*?join pg_namespace n/);
  for (const name of [...rpcNames, "persist_structured_estimate_outputs"]) {
    assert.match(migration, new RegExp(`'${name}'`));
  }
  assert.match(migration, /obsolete or overloaded structured estimate mutation function already exists/);
});

test("cross-estimate resources are non-disclosing and failures roll back provisional writes", () => {
  assert.match(migration, /where id=requested_item_id and estimate_id=requested_estimate_id/);
  assert.match(migration, /where id=requested_section_id and estimate_id=requested_estimate_id/);
  assert.match(migration, /return query select 'not_found'/);
  assert.equal((migration.match(/when sqlstate 'P0001'/g) ?? []).length, 3);
  assert.equal((migration.match(/return query select 'invalid_calculation'/g) ?? []).length >= 3, true);
});

test("RPCs are service-role-only and SQL contains no calculation engine", () => {
  for (const name of rpcNames) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^)]+\\) from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]+\\) to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/i);
  assert.doesNotMatch(migration, /calculateEstimate\s*\(|profit\s*:=|tax\s*:=|margin\s*:=|round\s*\(|power\s*\(/i);
  assert.match(migration, /TypeScript calculateEstimate is the sole financial formula source/);
});

test("migration is additive, guarded, and transactional", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /Required B2a structured lead draft invariant is missing/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /\btruncate\b|\bbackfill\b|\bdelete\s+from\s+public\.estimates/i);
});
