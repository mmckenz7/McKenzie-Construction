import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "supabase/migrations/20260812130000_structured_estimate_policy_v2.sql";
const migration = readFileSync(path, "utf8");
const transactionTest = readFileSync("tests/estimate-policy-v2-transaction.sql", "utf8");

test("policy migration is additive, transactional, and does not reclassify estimates", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.estimates|\bdelete\s+from|\btruncate\b|drop\s+table|drop\s+column/i);
  assert.match(migration, /drop constraint estimates_structured_policy_version/);
  assert.match(migration, /calculation_policy_version in \([\s\S]*?'structured-estimate-v1',[\s\S]*?'structured-estimate-v2-material-tax'/);
});

test("one active lead draft is enforced across both calculation policies", () => {
  assert.match(migration, /drop index public\.estimates_one_structured_draft_per_lead_uidx/);
  assert.match(migration, /create unique index estimates_one_structured_draft_per_lead_uidx/);
  assert.match(migration, /status = 'draft'[\s\S]*?calculation_policy_version in/);
  assert.match(migration, /having count\(\*\) > 1/);
});

test("all mutation RPCs admit both policies and verify bundle policy equality", () => {
  for (const name of [
    "create_structured_estimate_section", "update_structured_estimate_section", "delete_structured_estimate_section",
    "create_structured_estimate_item", "update_structured_estimate_item", "delete_structured_estimate_item",
  ]) assert.match(migration, new RegExp(`public\\.${name}\\(`));
  assert.match(migration, /\(current_policy is null or current_policy not in \(''structured-estimate-v1'', ''structured-estimate-v2-material-tax''\)\)/);
  assert.match(migration, /current_policy is distinct from requested_estimate_calculation ->> ''calculation_policy_version''/);
  assert.match(migration, /message = ''invalid_calculation''/);
});

test("function rewrites target audited exact signatures", () => {
  assert.match(migration, /to_regprocedure\(function_signature\)/);
  assert.match(migration, /public\.create_structured_estimate_section\(uuid,integer,uuid,text,text,text,integer\)/);
  assert.match(migration, /public\.delete_structured_estimate_item\(uuid,integer,uuid,jsonb,jsonb\)/);
  assert.match(migration, /public\.persist_structured_estimate_outputs\(uuid,integer,jsonb,jsonb\)/);
});

test("migration fails closed if audited constraints or function bodies drift", () => {
  assert.match(migration, /The audited structured estimate policy constraints are missing/);
  assert.match(migration, /The audited % policy guard has changed/);
  assert.match(migration, /The audited estimate calculation persistence helper has changed/);
  assert.match(migration, /policy guard was not replaced/);
  assert.match(migration, /bundle policy guard was not replaced/);
});

test("rollback transaction verifies matching, mismatched, and NULL-policy rejection", () => {
  assert.match(transactionTest, /structured-estimate-v2-material-tax/);
  assert.match(transactionTest, /persist_structured_estimate_outputs/);
  assert.match(transactionTest, /Mismatched calculation policy was accepted/);
  assert.match(transactionTest, /Rejected bundle changed the estimate revision/);
  assert.match(transactionTest, /NULL-policy section mutation was accepted/);
  assert.match(transactionTest, /NULL-policy calculation persistence was accepted/);
  assert.match(transactionTest, /rollback;\s*$/i);
});
