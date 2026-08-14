import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lookup = readFileSync(
  "src/app/api/estimates/[estimateId]/guided-site-visits/route.ts",
  "utf8",
);
const component = readFileSync(
  "src/components/estimates/guided-deck-site-visit.tsx",
  "utf8",
);
const estimates = readFileSync("src/app/sales/estimates/page.tsx", "utf8");
const intakeAccess = readFileSync(
  "src/lib/internal-deck-intake-access.ts",
  "utf8",
);

test("active visit lookup is authenticated, tenant scoped, and read only", () => {
  const get =
    lookup.match(
      /export async function GET[\s\S]*?export async function POST/,
    )?.[0] ?? "";
  assert.match(get, /authorizeGuidedSiteVisit\(request\)/);
  assert.match(get, /\.eq\("company_id",\s*auth\.authorization!\.companyId\)/);
  assert.match(get, /\.eq\("target_estimate_id",\s*estimateId\)/);
  assert.match(get, /\.eq\("status",\s*"in_progress"\)/);
  assert.match(get, /"Cache-Control":\s*"private, no-store"/);
  assert.doesNotMatch(get, /\.from\("estimates"\)/);
  assert.doesNotMatch(
    get,
    /\.insert\(|\.update\(|\.delete\(|storage_path|signedUrl|photo_url/,
  );
});

test("lookup returns bounded durable progress and completed field observations", () => {
  const get =
    lookup.match(
      /export async function GET[\s\S]*?export async function POST/,
    )?.[0] ?? "";
  assert.match(get, /const summary = \{/);
  assert.match(get, /activeVisit: visit\.data \? summary : null/);
  for (const field of [
    "id",
    "status",
    "revision",
    "startedAt",
    "updatedAt",
    "completedItems",
    "totalItems",
    "items",
    "itemKey",
    "observation",
  ]) {
    assert.match(get, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(get, /asset_id|photo_attempt|mime_type|storage/);
  assert.match(get, /\.select\("item_key,title,ordinal,state,observation"\)/);
  assert.match(get, /latestCompletedVisit/);
});

test("guided component discovers unfinished visits from the server on every device", () => {
  assert.match(
    component,
    /fetch\(\s*`\/api\/estimates\/\$\{encodeURIComponent\(estimateId\)\}\/guided-site-visits`/,
  );
  assert.match(component, /await loadVisit\(visitId\)/);
  assert.match(component, /Checking for an unfinished site visit/);
  assert.doesNotMatch(component, /sessionStorage|localStorage/);
});

test("estimate list includes both structured policies and exposes resume action", () => {
  assert.match(estimates, /STRUCTURED_ESTIMATE_CALCULATION_POLICY_VERSIONS/);
  assert.match(
    estimates,
    /\.in\(\s*"calculation_policy_version",\s*STRUCTURED_ESTIMATE_CALCULATION_POLICY_VERSIONS,/,
  );
  assert.match(estimates, /guided_site_visits/);
  assert.match(
    estimates,
    /\.eq\("company_id", intakeAccess\.access\.company_id\)/,
  );
  assert.match(estimates, /Site visit in progress/);
  assert.match(estimates, /activeVisitId\s*\?\s*"Resume"/);
  assert.match(estimates, /\?workflow=deck/);
});

test("quick intake and resume share the RPC permission and feature boundary", () => {
  for (const permission of ["edit_prices", "capture_site_visits"]) {
    assert.match(intakeAccess, new RegExp(`permissions\\?\\.${permission}`));
  }
  for (const feature of ["estimates", "ai_estimator", "guided_site_visits"]) {
    assert.match(intakeAccess, new RegExp(`features\\.${feature}`));
  }
  assert.match(estimates, /intakeAccess\.enabled/);
});
