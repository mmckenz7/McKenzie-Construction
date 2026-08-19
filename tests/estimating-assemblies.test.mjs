import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260819150000_estimating_cost_book_assemblies.sql", import.meta.url),
  "utf8",
);
const productMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260819160000_deck_cost_book_curated_products.sql", import.meta.url),
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
  assert.match(component, /Compatible railing systems/);
  assert.match(component, /Use an assembly only when one manufacturer&apos;s components must work together/);
  assert.match(component, /Choose an approved product/);
  assert.match(component, /effective_unit_cost \?\? material\.unit_cost/);
  assert.match(component, /Price not set/);
  assert.match(component, /Compatibility group/);
  assert.match(component, /Per square foot/);
  assert.match(component, /Per linear foot/);
  assert.match(component, /Labor/);
  assert.match(component, /Equipment/);
});

test("cost-book UI limits onboarding assemblies to compatible manufacturer systems", () => {
  assert.match(component, /Manufacturer-system starters/);
  assert.match(component, /Ordinary deck materials do not need an assembly/);
  assert.match(component, /Aluminum railing — complete compatible system/);
  assert.match(component, /Vinyl railing — complete compatible system/);
  assert.match(component, /const STARTER_TEMPLATES: readonly StarterTemplate\[\] = \[[\s\S]*ALUMINUM_RAILING_TEMPLATE,[\s\S]*VINYL_RAILING_TEMPLATE/);
  assert.doesNotMatch(component, /LEGACY_STARTER_TEMPLATES/);
  assert.match(component, /materialCatalogId: null/);
  assert.match(component, /missingProductCount/);
  assert.match(component, /Choose \{missingProductCount\} approved catalog product/);
});

test("system assemblies preserve manufacturer and stair-side compatibility", () => {
  assert.match(component, /aluminum_railing_product_line/);
  assert.match(component, /vinyl_railing_product_line/);
  assert.match(component, /confirm one side or both sides/i);
  assert.match(component, /quantityBasis: "manual_review"/);
  assert.match(component, /Review notes/);
});

test("curated deck products publish exact identities without inventing prices", () => {
  assert.match(productMigration, /MCK-DECK-PT-BOARD-16/);
  assert.match(productMigration, /MCK-DECK-DECKPLUS-625/);
  assert.match(productMigration, /MCK-DECK-TREX-SELECT-WHISKEY-GROOVED-16/);
  assert.match(productMigration, /MCK-DECK-TREX-SELECT-WHISKEY-SQUARE-16/);
  assert.match(productMigration, /MCK-RAIL-DECKORATORS-CONTEMP-LEVEL-8/);
  assert.match(productMigration, /MCK-RAIL-DECKORATORS-CABLE-PACK-10/);
  assert.match(productMigration, /MCK-FRAMING-PT-2X8X16/);
  assert.match(productMigration, /MCK-FRAMING-PT-2X10X16/);
  assert.match(productMigration, /MCK-FRAMING-PT-2X12X16/);
  assert.match(productMigration, /MCK-FRAMING-PT-6X6X12/);
  assert.match(productMigration, /MCK-HARDWARE-SIMPSON-LUS210Z/);
  assert.match(productMigration, /MCK-HARDWARE-SIMPSON-ABA66Z/);
  assert.match(productMigration, /MCK-HARDWARE-SIMPSON-PB66Z/);
  assert.match(productMigration, /'deck_board_grooved'/);
  assert.match(productMigration, /'deck_board_square_edge'/);
  assert.match(productMigration, /'framing_lumber'/);
  assert.match(productMigration, /'structural_hardware'/);
  assert.match(productMigration, /'price_status', 'not_verified'/);
  assert.match(productMigration, /seed\.unit,[\s\S]*?0,[\s\S]*?seed\.waste_percent/);
  assert.doesNotMatch(productMigration, /material_supplier_prices|supplier_offer_observation_prices/);
  assert.match(productMigration, /metadata = public\.material_catalog\.metadata \|\| excluded\.metadata/);
  assert.match(productMigration, /on conflict \(mckenzie_product_code\) where mckenzie_product_code is not null/);
});
