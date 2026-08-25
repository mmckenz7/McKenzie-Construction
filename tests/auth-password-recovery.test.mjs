import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getRecoveryCallbackUrl } from "../src/lib/auth/recovery.ts";

const callbackRoute = readFileSync("src/app/auth/callback/route.ts", "utf8");
const recoveryAction = readFileSync("src/app/forgot-password/actions.ts", "utf8");
const updateAction = readFileSync("src/app/reset-password/actions.ts", "utf8");
const resetPage = readFileSync("src/app/reset-password/page.tsx", "utf8");
const redirectPolicy = readFileSync("src/lib/auth/recovery.ts", "utf8");

test("recovery callback URLs use the request origin outside Preview", () => {
  assert.equal(
    getRecoveryCallbackUrl("https://staging.example.com", {}),
    "https://staging.example.com/auth/callback",
  );
  assert.equal(getRecoveryCallbackUrl("javascript:alert(1)", {}), null);
});

test("the current Vercel Preview deployment overrides an untrusted request origin", () => {
  assert.equal(
    getRecoveryCallbackUrl("https://attacker.example", {
      VERCEL_ENV: "preview",
      VERCEL_URL: "mckenzie-qa-123.vercel.app",
    }),
    "https://mckenzie-qa-123.vercel.app/auth/callback",
  );
});

test("the callback accepts only a completed Supabase recovery exchange", () => {
  assert.match(callbackRoute, /exchangeCodeForSession\(code\)/);
  assert.match(callbackRoute, /event === "PASSWORD_RECOVERY"/);
  assert.match(callbackRoute, /error \|\| !isRecoveryExchange/);
  assert.match(callbackRoute, /httpOnly: true/);
  assert.match(callbackRoute, /maxAge: 60 \* 15/);
  assert.doesNotMatch(callbackRoute, /console\.|access_token|refresh_token/i);
});

test("recovery redirects remain same-origin or on the Vercel Preview deployment", () => {
  assert.match(redirectPolicy, /environment\.VERCEL_ENV === "preview"/);
  assert.match(redirectPolicy, /environment\.VERCEL_URL/);
  assert.match(redirectPolicy, /return url\.origin/);
  assert.match(callbackRoute, /new URL\("\/reset-password/);
  assert.doesNotMatch(callbackRoute, /searchParams\.get\("next"\)/);
  assert.match(recoveryAction, /redirectTo: callbackUrl/);
});

test("password mutation requires both recovery state and an authenticated user", () => {
  assert.match(updateAction, /get\(recoverySessionCookie\)\?\.value !== "active"/);
  assert.match(updateAction, /supabase\.auth\.getUser\(\)/);
  assert.match(updateAction, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.doesNotMatch(updateAction, /createAdminServerClient|service.role|updateUserById/i);
  assert.doesNotMatch(updateAction, /console\.|localStorage|sessionStorage/);
});

test("invalid and expired links have a safe recovery path", () => {
  assert.match(resetPage, /This recovery link is invalid or has expired/);
  assert.match(resetPage, /href="\/forgot-password"/);
  assert.match(resetPage, /Request another recovery email/);
});
