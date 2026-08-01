import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PUBLIC_LINK_UNAVAILABLE_MESSAGE,
  PUBLIC_REQUEST_FAILED_MESSAGE,
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  minimizeChangeOrderPayload,
  minimizeMaterialReviewPayload,
  minimizeScheduleRequestPayload,
  minimizeVendorRequestPayload,
} from "../src/lib/public-token-api.ts";

const migration = readFileSync(
  "supabase/migrations/20260801080000_public_token_rpc_acl_hardening.sql",
  "utf8",
);
const replayMigration = readFileSync(
  "supabase/migrations/20260801090000_schedule_token_submission_replay_hardening.sql",
  "utf8",
);

const routes = [
  "src/app/api/change-orders/[token]/route.ts",
  "src/app/api/change-order-vendor/[token]/route.ts",
  "src/app/api/material-reviews/[token]/route.ts",
  "src/app/api/schedule-requests/[token]/route.ts",
].map((path) => readFileSync(path, "utf8"));
const materialReviewCreationRoute = readFileSync(
  "src/app/api/material-reviews/route.ts",
  "utf8",
);

test("invalid, expired, and revoked links share one enumeration-safe response", () => {
  const invalid = createPublicTokenFailure("unavailable");
  const expired = createPublicTokenFailure("unavailable");
  const revoked = createPublicTokenFailure("unavailable");

  assert.deepEqual(invalid, expired);
  assert.deepEqual(expired, revoked);
  assert.equal(invalid.status, 404);
  assert.equal(invalid.body.error, PUBLIC_LINK_UNAVAILABLE_MESSAGE);
});

test("unexpected RPC errors never expose database internals", () => {
  const secretError = {
    message: "duplicate key value violates constraint customer_private_data",
    details: "project_id=production-project-id",
  };
  const failure = createPublicTokenFailure("unexpected");

  assert.equal(failure.status, 500);
  assert.equal(failure.body.error, PUBLIC_REQUEST_FAILED_MESSAGE);
  assert.equal(JSON.stringify(failure).includes(secretError.message), false);
  assert.equal(JSON.stringify(failure).includes(secretError.details), false);
});

test("public response minimizers remove tokens, internal IDs, and unrelated metadata", () => {
  const sensitive = {
    id: "internal-id",
    token: "secret-token",
    secure_token: "secret-token",
    audit_metadata: "private",
    customer_email: "customer@example.com",
    employee_id: "employee-id",
    project: { id: "project-id", name: "Project", address: "Address" },
    subcontractor: { id: "person-id", name: "Installer", email: "private@example.com" },
    change_order: { id: "co-id", title: "Title", amount: 99999 },
    items: [],
    line_items: [],
  };

  for (const payload of [
    minimizeChangeOrderPayload(sensitive),
    minimizeVendorRequestPayload(sensitive),
    minimizeMaterialReviewPayload(sensitive),
    minimizeScheduleRequestPayload(sensitive),
  ]) {
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes("secret-token"), false);
    assert.equal(serialized.includes("internal-id"), false);
    assert.equal(serialized.includes("project-id"), false);
    assert.equal(serialized.includes("employee-id"), false);
    assert.equal(serialized.includes("customer@example.com"), false);
    assert.equal(serialized.includes("private@example.com"), false);
  }
});

test("all direct token RPC grants are removed from untrusted roles", () => {
  const rpcNames = [
    "get_change_order_by_token",
    "get_change_order_vendor_request_by_token",
    "get_material_review_by_token",
    "get_schedule_request_by_token",
    "submit_change_order_response",
    "submit_change_order_response_v2",
    "submit_change_order_vendor_response",
    "submit_schedule_request_by_token",
  ];

  for (const name of rpcNames) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`, "i"),
    );
  }
});

test("public mutation routes enforce request-size and duplicate guards", () => {
  for (const source of routes) {
    assert.match(source, /isPublicTokenBodyTooLarge/);
  }

  assert.match(routes[0], /submit_change_order_response_v2/);
  assert.match(routes[2], /\.in\("status", \["pending", "opened"\]\)/);
  assert.match(routes[3], /alreadySubmitted/);
  assert.match(replayMigration, /for update;/i);
  assert.match(replayMigration, /request_record\.status = 'submitted'/i);
  assert.match(replayMigration, /'already_submitted', true/i);
});

test("body-size guard rejects oversized and malformed lengths", () => {
  assert.equal(isPublicTokenBodyTooLarge("32768"), false);
  assert.equal(isPublicTokenBodyTooLarge("32769"), true);
  assert.equal(isPublicTokenBodyTooLarge("not-a-number"), true);
});

test("reissued material reviews rotate the public token", () => {
  assert.match(materialReviewCreationRoute, /secure_token: randomUUID\(\)/);
});
