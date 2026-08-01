import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createRateLimitResponse,
  createRateLimitTelemetry,
  getPublicTokenRateLimitPolicy,
  isRateLimitAllowed,
  PUBLIC_TOKEN_RATE_LIMIT_MESSAGE,
} from "../src/lib/public-token-rate-limit-core.ts";

const getPolicy = getPublicTokenRateLimitPolicy("GET");
const postPolicy = getPublicTokenRateLimitPolicy("POST");

test("valid traffic is allowed through both durable counter limits", () => {
  assert.equal(isRateLimitAllowed({
    networkCount: getPolicy.networkLimit,
    tokenCount: getPolicy.tokenLimit,
    policy: getPolicy,
  }), true);
});

test("either exceeded counter denies the request", () => {
  assert.equal(isRateLimitAllowed({
    networkCount: getPolicy.networkLimit + 1,
    tokenCount: 1,
    policy: getPolicy,
  }), false);
  assert.equal(isRateLimitAllowed({
    networkCount: 1,
    tokenCount: getPolicy.tokenLimit + 1,
    policy: getPolicy,
  }), false);
});

test("POST limits are stricter than GET limits", () => {
  assert.ok(postPolicy.networkLimit < getPolicy.networkLimit);
  assert.ok(postPolicy.tokenLimit < getPolicy.tokenLimit);
  assert.ok(postPolicy.windowSeconds > getPolicy.windowSeconds);
});

test("limit response is generic and contains no request data", () => {
  const response = createRateLimitResponse(42);
  const serialized = JSON.stringify(response);

  assert.equal(response.status, 429);
  assert.equal(response.headers["Retry-After"], "42");
  assert.equal(response.body.error, PUBLIC_TOKEN_RATE_LIMIT_MESSAGE);
  for (const sensitive of [
    "00000000-0000-4000-8000-000000000001",
    "customer@example.com",
    "project-id",
    "secure_token",
  ]) assert.equal(serialized.includes(sensitive), false);
});

test("telemetry omits token paths, payloads, and raw network identifiers", () => {
  const telemetry = createRateLimitTelemetry({
    routeCategory: "schedule_request",
    method: "POST",
    statusClass: "4xx",
    networkIdentifier: "a".repeat(64),
    userAgent: "Mozilla/5.0 (iPhone)",
    outcome: "denied",
    timestamp: "2026-08-01T00:00:00.000Z",
    path: "/api/schedule-requests/secret-token",
    body: { customerEmail: "customer@example.com" },
    token: "secret-token",
  });
  const serialized = JSON.stringify(telemetry);

  assert.equal(telemetry.networkIdentifier, "a".repeat(12));
  assert.equal(telemetry.userAgentCategory, "mobile");
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("customer@example.com"), false);
  assert.equal(serialized.includes("/api/"), false);
});

test("every public token handler enforces GET and POST limits before token validation", () => {
  const routePaths = [
    "src/app/api/change-orders/[token]/route.ts",
    "src/app/api/change-order-vendor/[token]/route.ts",
    "src/app/api/material-reviews/[token]/route.ts",
    "src/app/api/schedule-requests/[token]/route.ts",
  ];

  for (const routePath of routePaths) {
    const source = readFileSync(routePath, "utf8");
    assert.equal(
      source.match(/enforcePublicTokenRateLimit\(/g)?.length,
      2,
      routePath,
    );
    assert.ok(source.indexOf("enforcePublicTokenRateLimit({") < source.indexOf("if (!isUuid(token))"));
    assert.match(source, /method: "GET"/);
    assert.match(source, /method: "POST"/);
  }
});

test("database limiter is atomic, durable, and service-role only", () => {
  const migration = readFileSync(
    "supabase/migrations/20260801100000_public_token_rate_limiting.sql",
    "utf8",
  );

  assert.match(migration, /on conflict[\s\S]*do update[\s\S]*request_count =/i);
  assert.match(migration, /revoke all on function public\.check_public_token_rate_limit\([\s\S]*from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function public\.check_public_token_rate_limit\([\s\S]*to service_role;/i);
  assert.doesNotMatch(migration, /secure_token|customer|project_id/i);
});
