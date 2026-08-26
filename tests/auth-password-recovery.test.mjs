import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getRecoveryCallbackUrl,
  getRecoveryErrorMessage,
} from "../src/lib/auth/recovery.ts";
import { getSafeInternalRedirectPath } from "../src/lib/auth/redirect.ts";

const callbackRoute = readFileSync("src/app/auth/callback/route.ts", "utf8");
const recoveryAction = readFileSync("src/app/forgot-password/actions.ts", "utf8");
const updateAction = readFileSync("src/app/reset-password/actions.ts", "utf8");
const resetPage = readFileSync("src/app/reset-password/page.tsx", "utf8");
const redirectPolicy = readFileSync("src/lib/auth/recovery.ts", "utf8");

test("recovery callback URLs keep local and Production same-origin semantics", () => {
  assert.equal(
    getRecoveryCallbackUrl("https://staging.example.com", {}),
    "https://staging.example.com/auth/callback",
  );
  assert.equal(
    getRecoveryCallbackUrl("http://localhost:3000", {}),
    "http://localhost:3000/auth/callback",
  );
  assert.equal(
    getRecoveryCallbackUrl("https://app.example.com", {
      VERCEL_ENV: "production",
      VERCEL_BRANCH_URL: "ignored-git-branch.vercel.app",
      VERCEL_URL: "ignored-deployment.vercel.app",
    }),
    "https://app.example.com/auth/callback",
  );
  assert.equal(getRecoveryCallbackUrl("javascript:alert(1)", {}), null);
});

test("login destinations remain same-origin after URL normalization", () => {
  assert.equal(getSafeInternalRedirectPath("/sales?view=open"), "/sales?view=open");
  assert.equal(getSafeInternalRedirectPath("/sales/../portal"), "/portal");
  assert.equal(getSafeInternalRedirectPath("https://attacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("//attacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/\\attacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/\\\\attacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/%5c%5cattacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/%2f%2fattacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/%255c%255cattacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/%252f%252fattacker.example"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/portal\n"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/%0aportal"), "/admin");
  assert.equal(getSafeInternalRedirectPath("/%zz"), "/admin");
});

test("the stable Vercel branch URL wins for Preview recovery callbacks", () => {
  assert.equal(
    getRecoveryCallbackUrl("https://attacker.example", {
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "mckenzie-git-shared-auth.vercel.app",
      VERCEL_URL: "mckenzie-qa-123.vercel.app",
    }),
    "https://mckenzie-git-shared-auth.vercel.app/auth/callback",
  );
});

test("Preview recovery callbacks retain the validated deployment URL fallback", () => {
  assert.equal(
    getRecoveryCallbackUrl("https://attacker.example", {
      VERCEL_ENV: "preview",
      VERCEL_URL: "mckenzie-qa-123.vercel.app",
    }),
    "https://mckenzie-qa-123.vercel.app/auth/callback",
  );
  assert.equal(
    getRecoveryCallbackUrl("https://attacker.example", {
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "not-an-approved-preview.example",
      VERCEL_URL: "mckenzie-qa-456.vercel.app",
    }),
    "https://mckenzie-qa-456.vercel.app/auth/callback",
  );
});

test("Preview recovery callbacks reject malformed and untrusted hosts", () => {
  assert.equal(
    getRecoveryCallbackUrl("https://attacker.example", {
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "https://preview.vercel.app.evil.example",
      VERCEL_URL: "https://preview.vercel.app@evil.example",
    }),
    null,
  );
  assert.equal(
    getRecoveryCallbackUrl("https://attacker.example", {
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "javascript:alert(1)",
      VERCEL_URL: "http://preview.vercel.app",
    }),
    null,
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
  assert.match(redirectPolicy, /environment\.VERCEL_BRANCH_URL/);
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

test("recovered passwords require only eight characters", () => {
  assert.match(updateAction, /password\.length < 8/);
  assert.match(resetPage, /minLength=\{8\}/);
  assert.match(resetPage, /Use at least 8 characters/);
  assert.doesNotMatch(updateAction, /[A-Z].*required|symbol.*required|digit.*required/i);
});

test("invalid and expired links have a safe recovery path", () => {
  assert.match(redirectPolicy, /This recovery link is invalid or has expired/);
  assert.match(resetPage, /href="\/forgot-password"/);
  assert.match(resetPage, /Request another recovery email/);
  assert.equal(
    getRecoveryErrorMessage("too-short", false),
    "This recovery link is invalid or has expired.",
  );
  assert.equal(
    getRecoveryErrorMessage("mismatch", false),
    "This recovery link is invalid or has expired.",
  );
  assert.equal(
    getRecoveryErrorMessage("update-failed", false),
    "This recovery link is invalid or has expired.",
  );
  assert.equal(
    getRecoveryErrorMessage("too-short", true),
    "Use at least 8 characters for your new password.",
  );
});
