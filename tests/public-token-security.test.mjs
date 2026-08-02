import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PUBLIC_LINK_UNAVAILABLE_MESSAGE,
  PUBLIC_REQUEST_FAILED_MESSAGE,
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  logPublicTokenSupabaseFailure,
  minimizeChangeOrderPayload,
  minimizeMaterialReviewPayload,
  minimizeScheduleRequestPayload,
  minimizeVendorRequestPayload,
  publicTokenJson,
} from "../src/lib/public-token-api.ts";
import {
  createRateLimitFailureDiagnostic,
} from "../src/lib/public-token-rate-limit-core.ts";

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
const rateLimitSource = readFileSync(
  "src/lib/public-token-rate-limit.ts",
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
  assert.deepEqual(failure.headers, { "Cache-Control": "no-store" });
  assert.equal(failure.body.error, PUBLIC_REQUEST_FAILED_MESSAGE);
  assert.equal(JSON.stringify(failure).includes(secretError.message), false);
  assert.equal(JSON.stringify(failure).includes(secretError.details), false);
});

test("Supabase failure logs contain only sanitized operational metadata", () => {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);

  try {
    logPublicTokenSupabaseFailure({
      operation: "get_change_order_by_token",
      routeCategory: "change_order",
      method: "GET",
      status: 500,
      error: {
        code: "23514",
        message: "customer@example.com secret-token",
        details: "authorization=service-role-key",
        body: { customerName: "Private Customer" },
        ip: "203.0.113.10",
      },
      token: "secret-token",
      credential: "service-role-key",
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "public_token_supabase_failure",
    {
      operation: "get_change_order_by_token",
      routeCategory: "change_order",
      method: "GET",
      supabaseErrorCode: "23514",
      statusCategory: "5xx",
    },
  ]);

  const serialized = JSON.stringify(calls);
  for (const sensitiveValue of [
    "secret-token",
    "service-role-key",
    "203.0.113.10",
    "Private Customer",
    "customer@example.com",
  ]) {
    assert.equal(serialized.includes(sensitiveValue), false);
  }
});

test("rate-limit RPC diagnostics include only sanitized failure metadata", () => {
  const previousVercelEnvironment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "test";
  const diagnostic = createRateLimitFailureDiagnostic({
    error: {
      code: "57014",
      status: 504,
      message: "secret-token customer@example.com",
      details: "203.0.113.10 service-role-key",
      body: { customerName: "Private Customer" },
    },
    source: "rpc_error_response",
    routeCategory: "change_order",
    method: "POST",
  });
  if (previousVercelEnvironment === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = previousVercelEnvironment;
  }

  assert.deepEqual(diagnostic, {
    supabaseErrorCode: "57014",
    httpStatus: 504,
    errorCategory: "postgres",
    failureSource: "rpc_error_response",
    routeCategory: "change_order",
    method: "POST",
    runtimeEnvironment: "test",
  });

  const serialized = JSON.stringify(diagnostic);
  for (const sensitiveValue of [
    "secret-token",
    "customer@example.com",
    "203.0.113.10",
    "service-role-key",
    "Private Customer",
  ]) {
    assert.equal(serialized.includes(sensitiveValue), false);
  }
});

test("rate-limit failures stay generic and fail closed without retry", () => {
  assert.match(rateLimitSource, /public_token_rate_limit_check_failed/);
  assert.match(rateLimitSource, /source: "transport_exception"/);
  assert.match(rateLimitSource, /source: error \? "rpc_error_response" : "invalid_rpc_result"/);
  assert.match(
    rateLimitSource,
    /\{ success: false, error: "This request is temporarily unavailable\." \}/,
  );
  assert.match(rateLimitSource, /status: 503/);
  assert.match(rateLimitSource, /"Cache-Control": "no-store"/);
  assert.equal((rateLimitSource.match(/supabase\.rpc/g) ?? []).length, 1);
  assert.match(rateLimitSource, /if \(result\.allowed !== true\)/);
  assert.match(rateLimitSource, /return null;/);
});

test("public-token JSON responses preserve status and headers while enforcing no-store", async () => {
  for (const status of [200, 400, 404, 409, 410, 413, 429, 500, 503]) {
    const body = { success: status === 200, status };
    const response = publicTokenJson(body, {
      status,
      headers: {
        "Cache-Control": "public, max-age=60",
        "Retry-After": "17",
        "X-Test-Header": "preserved",
      },
    });

    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Retry-After"), "17");
    assert.equal(response.headers.get("X-Test-Header"), "preserved");
    assert.deepEqual(await response.json(), body);
  }
});

test("all explicit public-token route JSON responses use the no-store helper", () => {
  for (const source of routes) {
    assert.match(source, /publicTokenJson/);
    assert.doesNotMatch(source, /NextResponse\.json/);
  }
});

test("vendor invalid JSON uses the existing generic 400 response", () => {
  const vendorRoute = routes[1];

  assert.match(
    vendorRoute,
    /try \{[\s\S]*?await request\.json\(\)[\s\S]*?\} catch \{[\s\S]*?publicTokenJson\([\s\S]*?error: "Invalid response\."[\s\S]*?status: 400/,
  );
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
