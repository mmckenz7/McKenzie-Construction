import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260819150000_estimating_cost_book_assemblies.sql", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../src/app/api/estimating-assemblies/route.ts", import.meta.url),
  "utf8",
);
const component = fs.readFileSync(
  new URL("../src/components/estimating-assembly-builder.tsx", import.meta.url),
  "utf8",
);

test("assemblies remain tenant-owned and material rows reference the existing catalog", () => {
  assert.match(migration, /company_id uuid not null references public\.company_settings/);
  assert.match(migration, /material_catalog_id uuid references public\.material_catalog/);
  assert.match(migration, /foreign key \(assembly_id, company_id\)/);
  assert.doesNotMatch(migration, /insert into public\.material_catalog/i);
});

test("assembly writes are service-only, authorized, revision-fenced, and atomic", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /edit_prices/);
  assert.match(migration, /manage_suppliers/);
  assert.match(migration, /row_revision <> requested_expected_revision/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revoke all on function public\.save_estimating_assembly[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.save_estimating_assembly[\s\S]*to service_role/);
});

test("component rules cover reusable estimating cost classes without inventing quantities", () => {
  assert.match(migration, /'material', 'labor', 'subcontractor', 'equipment', 'other'/);
  assert.match(migration, /'fixed_each', 'per_linear_foot', 'per_square_foot', 'per_count', 'manual_review'/);
  assert.match(migration, /quantity_basis = 'manual_review' and quantity_factor is null/);
  assert.match(migration, /waste_percent between 0 and 100/);
  assert.match(migration, /compatibility_group text/);
});

test("API uses the existing Material Catalog authorization and exact company scope", () => {
  assert.match(route, /getMaterialCatalogAuthorizationDecision\("view_supplier_comparisons"\)/);
  assert.match(route, /getMaterialCatalogMutationAuthorizationDecision\("edit_catalog"\)/);
  assert.match(route, /\.eq\("company_id", decision\.authorization\.companyId\)/);
  assert.match(route, /requested_company_id: decision\.authorization\.companyId/);
  assert.match(route, /Cache-Control", "no-store/);
});

test("cost-book UI separates reusable quantity logic from the product catalog", () => {
  assert.match(component, /Cost book assemblies/);
  assert.match(component, /future reviewed takeoff supplies the square feet, linear feet, or count/);
  assert.match(component, /Choose an approved product/);
  assert.match(component, /effective_unit_cost \?\? material\.unit_cost/);
  assert.match(component, /Price not set/);
  assert.match(component, /Compatibility group/);
  assert.match(component, /Per square foot/);
  assert.match(component, /Per linear foot/);
  assert.match(component, /Labor/);
  assert.match(component, /Equipment/);
});
