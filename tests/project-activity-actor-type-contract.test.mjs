import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260801110000_project_activity_actor_type_contract.sql",
  "utf8",
);
const changeOrderRoute = readFileSync(
  "src/app/api/change-orders/[token]/route.ts",
  "utf8",
);
const vendorRoute = readFileSync(
  "src/app/api/change-order-vendor/[token]/route.ts",
  "utf8",
);

const approvedActorTypes = [
  "office",
  "system",
  "subcontractor",
  "customer",
  "supplier",
];

test("actor-type migration is transactional and validates existing rows first", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /if exists \([\s\S]*?from public\.project_activity[\s\S]*?actor_type is null[\s\S]*?actor_type not in/i);
  assert.match(migration, /drop constraint if exists project_activity_actor_type_check/i);
  assert.match(migration, /add constraint project_activity_actor_type_check[\s\S]*?not valid;/i);
  assert.match(migration, /validate constraint project_activity_actor_type_check;/i);
  assert.match(migration, /commit;\s*$/i);
});

test("actor-type constraint accepts exactly the five audited values", () => {
  const constraint = migration.match(
    /add constraint project_activity_actor_type_check([\s\S]*?)not valid;/i,
  )?.[1];
  assert.ok(constraint);

  const values = [...constraint.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(values, approvedActorTypes);
  assert.equal(values.includes("vendor"), false);
  assert.equal(values.includes("arbitrary"), false);
});

test("customer approval-open and audited vendor-response actor paths are covered", () => {
  assert.match(changeOrderRoute, /get_change_order_by_token/);
  assert.match(vendorRoute, /submit_change_order_vendor_response/);

  const contract = new Set(approvedActorTypes);
  assert.equal(contract.has("customer"), true);
  assert.equal(contract.has("supplier"), true);
  assert.equal(contract.has("subcontractor"), true);
  assert.equal(contract.has("vendor"), false);
});
