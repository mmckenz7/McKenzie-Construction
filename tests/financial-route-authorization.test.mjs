import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access = readFileSync("src/lib/financial-access.ts", "utf8");
const route = readFileSync("src/app/api/financials/route.ts", "utf8");
const layout = readFileSync("src/app/admin/financials/layout.tsx", "utf8");
const navigation = readFileSync("src/components/platform-sidebar-navigation.tsx", "utf8");

test("financial API requires active authentication and effective profit access", () => {
  assert.match(access, /getAuthenticatedAccess\(\)/);
  assert.match(access, /createUnauthorizedApiResponse/);
  assert.match(access, /get_effective_user_access/);
  assert.match(access, /portal_access\?\.admin === true/);
  assert.match(access, /permissions\?\.view_profit === true/);
  assert.match(route, /authorizeFinancialsRequest/);
  assert.doesNotMatch(route, /getAuthenticatedApiUser/);
});

test("financial page and navigation use the same effective permission", () => {
  assert.match(layout, /portal_access\?\.admin !== true/);
  assert.match(layout, /permissions\?\.view_profit !== true/);
  assert.match(layout, /redirect\("\/admin"\)/);
  assert.match(navigation, /\["Financials", "\/admin\/financials", "view_profit"\]/);
});

test("financial authorization fails closed before service-role reporting queries", () => {
  const authorizationIndex = route.indexOf("authorizeFinancialsRequest");
  const reportingClientIndex = route.indexOf("createAdminServerClient()", authorizationIndex);
  assert.ok(authorizationIndex >= 0);
  assert.ok(reportingClientIndex > authorizationIndex);
  assert.match(access, /Financial access could not be verified\./);
  assert.match(access, /status: 403/);
});
