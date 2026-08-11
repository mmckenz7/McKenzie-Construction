import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/company-branding/route.ts", "utf8");

test("company branding writes require authenticated management access", () => {
  assert.match(route, /getAuthenticatedAccess\(\)/);
  assert.match(route, /hasManagementAccess\(access\.teamMember\.roles\)/);
  assert.match(route, /createUnauthorizedApiResponse/);
  assert.match(route, /createForbiddenApiResponse/);
});

test("company branding failures do not return raw database messages", () => {
  assert.match(route, /Company branding settings could not be loaded\./);
  assert.doesNotMatch(route, /error:\s*existing\.error\.message/);
});
