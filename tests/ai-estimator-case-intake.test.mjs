import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseAiEstimatorCaseCreateInput,
  projectAiEstimatorCase,
} from "../src/lib/ai-estimator/case-core.ts";

const access = readFileSync("src/lib/ai-estimator/case-access.ts", "utf8");
const core = readFileSync("src/lib/ai-estimator/case-core.ts", "utf8");
const collection = readFileSync("src/app/api/ai-estimator/cases/route.ts", "utf8");
const detail = readFileSync("src/app/api/ai-estimator/cases/[caseId]/route.ts", "utf8");
const featureTypes = readFileSync("src/lib/features/types.ts", "utf8");
const featureServer = readFileSync("src/lib/features/server.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260810120000_ai_estimator_case_intake.sql", "utf8");

test("AI Estimator intake is fixed-scope, Sales-only, and default-off", () => {
  assert.match(access, /getAuthenticatedAccess\(\)/);
  assert.match(access, /get_effective_user_access/);
  assert.match(access, /portal_access\?\.sales !== true/);
  assert.match(access, /getServerFeatureMap\(\{[\s\S]*?scopeType: "global",[\s\S]*?scopeId: "default"/);
  assert.match(access, /if \(!features\.ai_estimator\)/);
  assert.doesNotMatch(access, /getFeatureScopeFromRequest|x-feature-scope|searchParams/);
  assert.match(featureTypes, /\| "ai_estimator"/);
  assert.match(featureTypes, /ai_estimator: false/);
  assert.match(featureServer, /record\.ai_estimator === true/);
  assert.match(migration, /'ai_estimator',[\s\S]*?false/);
  assert.match(migration, /on conflict \(scope_type, scope_id, feature_key\) do nothing/);
});

test("case creation accepts only lead, title, and explicit recording permission", () => {
  assert.match(core, /CREATE_FIELDS/);
  for (const field of ["leadId", "title", "recordingPermissionAcknowledged"]) {
    assert.match(core, new RegExp(`"${field}"`));
  }
  assert.match(core, /recordingPermissionAcknowledged !== true/);
  assert.match(collection, /recording_permission_acknowledged_at: acknowledgedAt/);
  assert.match(collection, /recording_permission_acknowledged_by_auth_user_id:[\s\S]*?auth\.authorization!\.authUserId/);
  assert.match(migration, /ai_estimator_cases_recording_permission_check/);
});

test("case input parsing trims safe fields and rejects authority-shaped additions", () => {
  const parsed = parseAiEstimatorCaseCreateInput({
    leadId: "87fbb355-f9ad-4efe-8b68-7e4e3c369be0",
    title: "  Rear deck narration  ",
    recordingPermissionAcknowledged: true,
  });
  assert.deepEqual(parsed, {
    leadId: "87fbb355-f9ad-4efe-8b68-7e4e3c369be0",
    title: "Rear deck narration",
    recordingPermissionAcknowledged: true,
  });
  assert.throws(
    () => parseAiEstimatorCaseCreateInput({ ...parsed, totalPrice: "1200.00" }),
    /unsupported fields/,
  );
  assert.throws(
    () => parseAiEstimatorCaseCreateInput({ ...parsed, recordingPermissionAcknowledged: false }),
    /Recording permission must be acknowledged/,
  );
});

test("case projection omits tenant and actor identifiers", () => {
  const projected = projectAiEstimatorCase({
    id: "case-id",
    company_id: "company-id",
    lead_id: "lead-id",
    status: "intake",
    title: "Deck walkthrough",
    retention_policy_version: "policy-v0",
    recording_permission_acknowledged_at: "2026-08-11T10:00:00.000Z",
    created_by_auth_user_id: "auth-user-id",
    created_at: "2026-08-11T10:00:00.000Z",
    updated_at: "2026-08-11T10:00:00.000Z",
  });
  assert.equal(projected.leadId, "lead-id");
  assert.equal("companyId" in projected, false);
  assert.equal("createdByAuthUserId" in projected, false);
});

test("case creation remains shadow-only and does not create authoritative records", () => {
  assert.match(collection, /from\("ai_estimator_cases"\)/);
  assert.match(collection, /from\("leads"\)[\s\S]*?\.select\("id"\)/);
  assert.doesNotMatch(collection, /from\("estimates"\)|from\("projects"\)|from\("customers"\)/);
  assert.doesNotMatch(collection, /issue|proposal|contract|material_order|activation|lead_status/);
  assert.match(collection, /retention_policy_version: AI_ESTIMATOR_RETENTION_POLICY_VERSION/);
  assert.match(collection, /status,[\s\S]*?title/);
});

test("case reads are tenant-filtered and responses are non-cacheable", () => {
  assert.match(detail, /loadSingletonCompanyId\(\)/);
  assert.match(detail, /\.eq\("id", caseId\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(detail, /"Cache-Control": "no-store"/);
  assert.match(collection, /"Cache-Control": "no-store"/);
  assert.match(access, /response\.headers\.set\("Cache-Control", "no-store"\)/);
  assert.doesNotMatch(core, /companyId:|createdByAuthUserId:/);
});

test("intake migration is additive to the AI shadow table only", () => {
  assert.match(migration, /alter table public\.ai_estimator_cases/);
  assert.match(migration, /insert into public\.feature_settings/);
  assert.match(migration, /recording_permission_acknowledged_at timestamptz not null/);
  assert.match(migration, /recording_permission_acknowledged_by_auth_user_id uuid not null/);
  assert.doesNotMatch(migration, /alter table public\.(estimates|leads|customers|projects)/);
  assert.doesNotMatch(migration, /\bupdate\s+public\.|\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(migration, /\bgrant\b|\brevoke\b/i);
});
