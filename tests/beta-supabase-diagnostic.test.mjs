import assert from "node:assert/strict";
import test from "node:test";

import {
  betaDiagnosticIsAvailable,
  runBetaSupabaseDiagnostic,
} from "../src/lib/beta-supabase-diagnostic.ts";

const stagingUrl =
  "https://iiofljulghibantfzlim.supabase.co";

test("beta diagnostic is restricted to the estimating preview branch", () => {
  assert.equal(
    betaDiagnosticIsAvailable({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF:
        "beta/estimating-core",
    }),
    true,
  );

  assert.equal(
    betaDiagnosticIsAvailable({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF:
        "beta/estimating-core",
    }),
    false,
  );

  assert.equal(
    betaDiagnosticIsAvailable({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    false,
  );
});

test("diagnostic reports matching staging configuration without disclosing values", async () => {
  const publishableKey =
    "test-publishable-secret-value";
  const serviceRoleKey =
    "test-service-role-secret-value";
  const requests = [];

  const diagnostic =
    await runBetaSupabaseDiagnostic(
      {
        NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          publishableKey,
        SUPABASE_SERVICE_ROLE_KEY:
          serviceRoleKey,
      },
      async (input, init) => {
        requests.push({ input, init });
        return new Response(null, {
          status: 200,
        });
      },
    );

  assert.deepEqual(diagnostic, {
    url: "MATCH",
    projectRef: "iiofljulghibantfzlim",
    publishableKey: "MATCH",
    serviceRoleKey: "MATCH",
    betaConfiguration: "CORRECT",
  });

  const serialized = JSON.stringify(diagnostic);
  assert.equal(
    serialized.includes(publishableKey),
    false,
  );
  assert.equal(
    serialized.includes(serviceRoleKey),
    false,
  );
  assert.equal(requests.length, 2);
});

test("diagnostic distinguishes missing and mismatched configuration", async () => {
  const diagnostic =
    await runBetaSupabaseDiagnostic(
      {
        NEXT_PUBLIC_SUPABASE_URL:
          "https://another-project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "wrong-key",
      },
      async () =>
        new Response(null, {
          status: 401,
        }),
    );

  assert.deepEqual(diagnostic, {
    url: "MISMATCH",
    projectRef: "another-project",
    publishableKey: "MISMATCH",
    serviceRoleKey: "MISSING",
    betaConfiguration: "INCORRECT",
  });
});

test("diagnostic classifies network failures without exposing error details", async () => {
  const diagnostic =
    await runBetaSupabaseDiagnostic(
      {
        NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "publishable-key",
        SUPABASE_SERVICE_ROLE_KEY:
          "service-role-key",
      },
      async () => {
        throw new Error("sensitive network detail");
      },
    );

  assert.deepEqual(diagnostic, {
    url: "MATCH",
    projectRef: "iiofljulghibantfzlim",
    publishableKey: "UNVERIFIED",
    serviceRoleKey: "UNVERIFIED",
    betaConfiguration: "UNVERIFIED",
  });
});
