import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const migration = readFileSync(
  "supabase/migrations/20260812151000_guided_site_visit_ai_usability_review.sql",
  "utf8",
);
const runner = readFileSync(
  "src/lib/guided-site-visits/ai-usability-review.ts",
  "utf8",
);
const route = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/photos/[photoId]/usability-reviews/route.ts",
  "utf8",
);
const getRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/route.ts",
  "utf8",
);
const features = readFileSync("src/lib/features/server.ts", "utf8");
test("AI reviews are immutable append-only advisory evidence", () => {
  assert.match(
    migration,
    /before update or delete on public\.guided_site_visit_ai_usability_reviews/,
  );
  assert.match(migration, /are append-only/);
  assert.doesNotMatch(
    `${migration}\n${runner}\n${route}`,
    /update public\.guided_site_visit_(?:items|visits)|estimate_line_items|requested_expected_revision|requested_measurements|measurement_value/,
  );
});
test("tenant, visit, item, photo, and asset linkage is composite and idempotent", () => {
  assert.match(
    migration,
    /foreign key\(photo_attempt_id,asset_id,visit_item_id,visit_id,company_id\)/,
  );
  assert.match(migration, /unique\(company_id,idempotency_key\)/);
  assert.match(migration, /idempotency_conflict/);
  assert.match(migration, /idempotent_replay/);
});
test("verdict and issue schema fail closed", () => {
  for (const verdict of ["usable", "retake_recommended", "unable_to_assess"])
    assert.match(migration, new RegExp(verdict));
  for (const issue of [
    "blurry",
    "too_dark",
    "too_bright",
    "glare",
    "obstructed",
    "wrong_subject",
    "incomplete_view",
    "too_distant",
    "orientation_problem",
    "unsupported_media",
  ])
    assert.match(`${migration}\n${runner}`, new RegExp(issue));
  assert.match(runner, /additionalProperties:false/);
  assert.match(runner, /validateUsabilityResult/);
});
test("trusted runner downloads privately and browser cannot supply model output", () => {
  assert.match(route, /\.storage\.from\("ai-estimator-private"\)\.download/);
  assert.match(route, /runOpenAiUsabilityReview/);
  assert.match(runner, /Authorization:`Bearer \$\{apiKey\}`/);
  assert.match(runner, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(route, /new Set\(\["idempotencyKey"\]\)/);
  assert.doesNotMatch(
    route,
    /body\.(?:verdict|issueCodes|provider|modelVersion|requestSha256|responseSha256)/,
  );
});
test("HEIC and HEIF are unable to assess without provider execution", () => {
  assert.match(
    route,
    /\["image\/heic","image\/heif"\]\.includes\(asset\.mime_type\)/,
  );
  assert.match(
    route,
    /verdict="unable_to_assess";issueCodes=\["unsupported_media"\]/,
  );
});
test("feature is disabled by default and depends on guided visits", () => {
  assert.match(
    features,
    /guided_site_visit_ai_usability_review:[\s\S]*record\.ai_estimator === true[\s\S]*record\.guided_site_visits === true[\s\S]*record\.guided_site_visit_ai_usability_review === true/,
  );
  assert.match(migration, /guided_site_visit_ai_usability_review',false/);
});
test("GET exposes review history under each photo attempt", () => {
  for (const key of [
    "usabilityReviews",
    "verdict",
    "issueCodes",
    "provider",
    "modelVersion",
    "promptVersion",
    "schemaVersion",
    "requestSha256",
    "responseSha256",
  ])
    assert.match(getRoute, new RegExp(key));
});
test("reviews use only the active confirmed attempt and deterministic history ordering", () => {
  assert.match(migration, /p\.state='confirmed'/);
  assert.doesNotMatch(migration, /p\.state in \('confirmed','superseded'\)/);
  assert.match(route, /attempt\.data\.state!=="confirmed"/);
  assert.doesNotMatch(route, /\["confirmed","superseded"\]/);
  assert.match(getRoute, /\.order\("created_at"\)\s*\.order\("id"\)/);
});
test("provider subject grounding is limited to checklist title and instructions", () => {
  assert.match(route, /guided_site_visit_items!inner\(title,instructions\)/);
  assert.match(
    route,
    /captureTitle:item\.title,captureInstructions:item\.instructions/,
  );
  assert.doesNotMatch(
    route,
    /customer|address|phone|email|lead_name|project_title/i,
  );
  assert.match(runner, /gpt-5\.6-luna/);
});
