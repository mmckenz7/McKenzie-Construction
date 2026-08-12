import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260810145000_core_company_access_reporting_compat.sql";
const migration = readFileSync(migrationPath, "utf8");
const workspaceAccess = readFileSync("src/lib/workspace-access.ts", "utf8");
const sandboxSeed = readFileSync("scripts/local-sandbox-seed.mjs", "utf8");
const sqlRegression = readFileSync(
  "supabase/tests/core_company_access_reporting_compat.sql",
  "utf8",
);

test("Core owns a transactional singleton company access transition", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /company_count <> 1/);
  assert.match(migration, /add column company_id uuid/);
  assert.match(migration, /update public\.app_users[\s\S]*?from public\.company_settings/);
  assert.match(migration, /alter column company_id set not null/);
  assert.match(migration, /app_users_company_id_fkey[\s\S]*?references public\.company_settings\(id\)[\s\S]*?on delete restrict/);
  assert.match(migration, /'company_id', user_record\.company_id/);
  assert.match(migration, /security definer[\s\S]*?set search_path = pg_catalog, public/i);
  assert.match(workspaceAccess, /company_id: string/);
  assert.doesNotMatch(migration, /insert into public\.company_settings|gen_random_uuid\(\)[\s\S]*?company_id/i);
});

test("migration preflight rejects drift in both reporting contracts", () => {
  assert.match(migration, /billing_summary_definition/);
  assert.match(migration, /receivables_definition/);
  for (const marker of [
    "tenant_column_count",
    "get_effective_user_access",
    "view_costs",
    "project_change_order_payments",
    "superseded_by_change_order_id is null",
  ]) {
    assert.match(migration, new RegExp(marker));
  }
  assert.match(migration, /invoice_due_date asc nulls last/);
  assert.match(migration, /does not match the audited singleton reporting contract/);
});

test("reporting permits only the explicit singleton membership exception", () => {
  assert.match(migration, /assert_single_company_change_order_reporting_scope/);
  assert.match(migration, /from public\.app_users[\s\S]*?company_id is distinct from resolved_company_id/);
  assert.match(migration, /table_name = 'app_users'[\s\S]*?'tenant_id'[\s\S]*?'workspace_id'[\s\S]*?'organization_id'/);
  assert.match(migration, /table_name in \([\s\S]*?'team_members'[\s\S]*?'customers'[\s\S]*?'projects'[\s\S]*?'project_change_orders'[\s\S]*?'project_change_order_payments'/);
  assert.doesNotMatch(
    migration.match(/table_name in \([\s\S]*?\);/)?.[0] ?? "",
    /'app_users'/,
  );
  assert.match(migration, /effective_access ->> 'company_id'[\s\S]*?resolved_company_id::text/);
  assert.match(migration, /intentionally unscoped/);
  assert.doesNotMatch(migration, /where change_order\.company_id|where payment\.company_id/);
});

test("browser roles cannot mutate application user company membership", () => {
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.app_users[\s\S]*?from public, anon, authenticated/,
  );
});

test("access and reporting functions remain service-role only", () => {
  for (const signature of [
    "get_effective_user_access\\(uuid\\)",
    "assert_single_company_change_order_reporting_scope\\(\\)",
    "get_company_change_order_billing_summary\\(uuid\\)",
    "get_company_change_order_receivables\\(uuid\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to service_role`, "i"),
    );
  }
});

test("local provisioning supplies the required company membership", () => {
  assert.match(sandboxSeed, /companyRows\.length !== 1/);
  assert.match(sandboxSeed, /const companyId = companyRows\[0\]\.id/);
  assert.match(sandboxSeed, /auth_user_id: owner\.id,[\s\S]*?company_id: companyId/);
});

test("disposable SQL regression covers combined fail-closed states", () => {
  assert.match(sqlRegression, /^begin;/i);
  assert.match(sqlRegression, /rollback;\s*$/i);
  assert.match(sqlRegression, /get_company_change_order_billing_summary/);
  assert.match(sqlRegression, /get_company_change_order_receivables/);
  assert.match(sqlRegression, /'approved_amount', 1500\.00/);
  assert.match(sqlRegression, /'balance_due', 750\.00/);
  assert.match(sqlRegression, /receivables must contain exactly one fixture row/i);
  assert.match(sqlRegression, /no-view-costs billing summary must be denied/i);
  assert.match(sqlRegression, /second company must fail closed for billing summary/i);
  assert.match(sqlRegression, /second company must fail closed for receivables/i);
  assert.match(sqlRegression, /NOT NULL must reject missing app_user company/i);
  assert.match(sqlRegression, /foreign key must reject mismatched app_user company/i);
  assert.match(sqlRegression, /unexpected reporting domain ownership must fail closed for billing summary/i);
  assert.match(sqlRegression, /unexpected reporting domain ownership must fail closed for receivables/i);
  assert.match(sqlRegression, /has_function_privilege/);
  assert.match(sqlRegression, /has_table_privilege/);
  assert.match(sqlRegression, /pg_get_userbyid\(proowner\) = 'postgres'/);
  assert.match(sqlRegression, /search_path=pg_catalog, public/);
});
