import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPaths = [
  "supabase/migrations/20260801040000_legacy_timestamp_trigger_acl_hardening.sql",
  "supabase/migrations/20260801050000_legacy_activity_trigger_acl_hardening.sql",
  "supabase/migrations/20260801060000_legacy_synchronization_trigger_acl_hardening.sql",
  "supabase/migrations/20260801070000_legacy_validation_trigger_acl_hardening.sql",
];

const migrationSources = migrationPaths.map((path) => ({
  path,
  source: readFileSync(path, "utf8"),
}));

const hardenedFunctions = [
  "apply_installer_schedule_response",
  "assign_project_change_order_number",
  "log_change_order_activity",
  "log_change_order_approval_activity",
  "log_change_order_payment_activity",
  "log_change_order_vendor_request_activity",
  "log_material_issue_activity",
  "log_material_review_activity",
  "log_project_message_activity",
  "log_project_update_activity",
  "log_schedule_request_activity",
  "prevent_locked_change_order_item_changes",
  "prevent_locked_change_order_scope_changes",
  "prevent_schedule_response_overwrite",
  "set_change_order_item_updated_at",
  "set_crm_updated_at",
  "set_customer_updated_at",
  "set_project_costs_updated_at",
  "set_updated_at",
  "sync_change_order_invoice_status",
  "sync_change_order_item_totals",
  "sync_change_order_payment_status",
  "touch_project_message_thread",
  "validate_change_order_supersession",
];

const triggerBindings = new Map([
  ["apply_installer_schedule_response", "apply_installer_schedule_response_after_update"],
  ["assign_project_change_order_number", "assign_project_change_order_number_trigger"],
  ["log_change_order_activity", "log_change_order_activity_trigger"],
  ["log_change_order_approval_activity", "project_change_order_approval_activity_trigger"],
  ["log_change_order_payment_activity", "log_change_order_payment_activity_trigger"],
  ["log_change_order_vendor_request_activity", "log_change_order_vendor_request_activity_trigger"],
  ["log_material_issue_activity", "log_material_issue_activity_trigger"],
  ["log_material_review_activity", "log_material_review_activity_trigger"],
  ["log_project_message_activity", "log_project_message_activity_trigger"],
  ["log_project_update_activity", "log_project_update_activity_trigger"],
  ["log_schedule_request_activity", "log_schedule_request_activity_trigger"],
  ["prevent_locked_change_order_item_changes", "prevent_locked_change_order_item_changes_trigger"],
  ["prevent_locked_change_order_scope_changes", "prevent_locked_change_order_scope_changes_trigger"],
  ["prevent_schedule_response_overwrite", "prevent_schedule_response_overwrite_trigger"],
  ["set_change_order_item_updated_at", "project_change_order_items_updated_at_trigger"],
  ["set_crm_updated_at", "projects_set_updated_at"],
  ["set_customer_updated_at", "set_customers_updated_at"],
  ["set_project_costs_updated_at", "set_project_costs_updated_at"],
  ["set_updated_at", "set_app_users_updated_at"],
  ["sync_change_order_invoice_status", "sync_change_order_invoice_status_trigger"],
  ["sync_change_order_item_totals", "project_change_order_items_totals_trigger"],
  ["sync_change_order_payment_status", "sync_change_order_payment_status_trigger"],
  ["touch_project_message_thread", "touch_project_message_thread_after_message"],
  ["validate_change_order_supersession", "validate_change_order_supersession_trigger"],
]);

const intentionallyExposedRpcs = [
  "get_change_order_by_token",
  "get_change_order_vendor_request_by_token",
  "get_material_review_by_token",
  "get_schedule_request_by_token",
  "submit_change_order_response",
  "submit_change_order_response_v2",
  "submit_change_order_vendor_response",
  "submit_schedule_request_by_token",
];

const executableSql = (source) => source
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const sourceFiles = (directory) => readdirSync(
  directory,
  { withFileTypes: true },
).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : [path];
});

test("all 24 legacy trigger-only functions lose untrusted direct execution", () => {
  const combined = migrationSources.map(({ source }) => source).join("\n");

  assert.equal(hardenedFunctions.length, 24);
  for (const functionName of hardenedFunctions) {
    assert.match(
      combined,
      new RegExp(`revoke execute on function public\\.${functionName}\\(\\)\\s+from public, anon, authenticated;`, "s"),
    );
  }
});

test("hardened trigger helpers have no application callers", () => {
  const paths = sourceFiles("src");
  assert.ok(paths.length > 0);

  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    for (const functionName of hardenedFunctions) {
      assert.equal(
        source.includes(functionName),
        false,
        `${path} must not call trigger-only helper ${functionName}`,
      );
    }
  }
});

test("every hardened helper retains a documented live trigger binding", () => {
  const combined = migrationSources.map(({ source }) => source).join("\n");

  assert.equal(triggerBindings.size, hardenedFunctions.length);
  for (const [functionName, triggerName] of triggerBindings) {
    assert.ok(combined.includes(triggerName), `missing trigger ${triggerName}`);
    assert.ok(combined.includes(functionName), `missing helper ${functionName}`);
  }
});

test("legacy helper migrations contain grants only", () => {
  for (const { path, source } of migrationSources) {
    const sql = executableSql(source);
    assert.match(sql, /^\s*begin;/i, path);
    assert.match(sql, /commit;\s*$/i, path);
    assert.doesNotMatch(sql, /\b(?:create|alter|drop)\b/i, path);
    assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\b/i, path);
    assert.doesNotMatch(sql, /\bgrant\b/i, path);
    assert.doesNotMatch(sql, /\bservice_role\b/i, path);
  }
});

test("intentionally exposed RPC ACLs remain unchanged", () => {
  const sql = migrationSources
    .map(({ source }) => executableSql(source))
    .join("\n");

  for (const functionName of intentionallyExposedRpcs) {
    assert.doesNotMatch(sql, new RegExp(`public\\.${functionName}\\(`, "i"));
  }

  const referencedFunctions = [...sql.matchAll(/on function public\.([a-z0-9_]+)\(/gi)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(referencedFunctions, [...hardenedFunctions].sort());
});
