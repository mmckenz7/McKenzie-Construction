import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260810150000_material_catalog_access_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const workspaceAccess = readFileSync("src/lib/workspace-access.ts", "utf8");
const featureTypes = readFileSync("src/lib/features/types.ts", "utf8");
const featureServer = readFileSync("src/lib/features/server.ts", "utf8");
const catalogAccess = readFileSync("src/lib/material-catalog-access.ts", "utf8");

test("access foundation is transactional, ordered, and fail-closed", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /to_regclass\('public\.app_users'\)/);
  assert.match(migration, /to_regprocedure\('public\.get_effective_user_access\(uuid\)'\)/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /company_count <> 1/);
  assert.match(migration, /requires exactly one company_settings row/);
  assert.doesNotMatch(migration, /drop\s+(?:table|column|constraint|index)|truncate/i);
});

test("app users receive an authoritative evidence-based company scope", () => {
  assert.match(migration, /alter table public\.app_users[\s\S]*?add column company_id uuid/);
  assert.match(migration, /update public\.app_users[\s\S]*?select id[\s\S]*?from public\.company_settings/);
  assert.match(migration, /alter column company_id set not null/);
  assert.match(migration, /app_users_company_id_fkey[\s\S]*?references public\.company_settings\(id\)[\s\S]*?on delete restrict/);
  assert.match(migration, /create index app_users_company_id_idx/);
  assert.match(workspaceAccess, /company_id: string/);
  assert.doesNotMatch(migration, /gen_random_uuid\(\)[\s\S]*?company_id|insert into public\.company_settings/i);
});

test("effective access returns company scope and is server-only", () => {
  assert.match(migration, /create or replace function public\.get_effective_user_access/);
  assert.match(migration, /'company_id', user_record\.company_id/);
  assert.match(migration, /revoke all on function public\.get_effective_user_access\(uuid\)[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_effective_user_access\(uuid\)[\s\S]*?to service_role/);
  assert.match(catalogAccess, /^import "server-only";/);
  assert.match(catalogAccess, /getAuthenticatedAccess\(\)/);
  assert.match(catalogAccess, /get_effective_user_access/);
  assert.match(catalogAccess, /isUuid\(effectiveAccess\.company_id\)/);
  assert.match(catalogAccess, /companyId: effectiveAccess\.company_id/);
  assert.doesNotMatch(catalogAccess, /loadSingletonCompanyId|from\("company_settings"\)/);
});

test("three catalog controls default off and children require their parent", () => {
  for (const key of [
    "material_catalog",
    "material_catalog_price_publication",
    "material_catalog_estimate_pricing",
  ]) {
    assert.match(featureTypes, new RegExp(`\\| "${key}"`));
    assert.match(featureTypes, new RegExp(`${key}: false`));
    assert.match(migration, new RegExp(`'${key}',[\\s\\S]*?false`));
  }
  assert.match(featureServer, /const materialCatalog =[\s\S]*?record\.material_catalog === true/);
  assert.match(featureServer, /material_catalog_price_publication:[\s\S]*?materialCatalog &&/);
  assert.match(featureServer, /material_catalog_estimate_pricing:[\s\S]*?materialCatalog &&/);
  assert.match(migration, /feature_key like 'material_catalog_%'/);
  assert.match(migration, /where parent\.feature_key = 'material_catalog'/);
  assert.match(migration, /on conflict \(scope_type, scope_id, feature_key\) do nothing/);
});

test("server authorization uses fixed feature scope and explicit capabilities", () => {
  assert.match(catalogAccess, /getServerFeatureMap\(\{[\s\S]*?scopeType: "global",[\s\S]*?scopeId: "default"/);
  assert.doesNotMatch(catalogAccess, /getFeatureScopeFromRequest|x-feature-scope|searchParams/);
  assert.match(catalogAccess, /deriveCatalogCapabilities\(effectiveAccess/);
  assert.match(catalogAccess, /catalogFeatureEnabled: features\.material_catalog/);
  assert.match(catalogAccess, /pricePublicationEnabled: features\.material_catalog_price_publication/);
  assert.match(catalogAccess, /estimatePriceApplicationEnabled: features\.material_catalog_estimate_pricing/);
  assert.match(catalogAccess, /Cache-Control", "no-store"/);
});

test("access foundation does not touch catalog history or commercial workflows", () => {
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.(?:material_catalog|supplier_product_offers|supplier_offer_observations|supplier_offer_observation_prices|estimates|estimate_line_items|estimate_material_price_snapshots|projects|project_costs)/i,
  );
  assert.doesNotMatch(catalogAccess, /from\("estimates"\)|from\("material_catalog"\)|\.insert\(|\.update\(|\.delete\(/);
});
