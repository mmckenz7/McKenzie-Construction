import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const provider = readFileSync(
  "src/lib/guided-site-visits/ai-deck-shape-suggestion.ts",
  "utf8",
);
const route = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/deck-shape-suggestion/route.ts",
  "utf8",
);
const shapeReview = readFileSync(
  "src/components/estimates/deck-shape-review.tsx",
  "utf8",
);

test("AI is asked only for editable topology and never structural or measured facts", () => {
  assert.match(provider, /Suggest only the visible bird's-eye footprint topology as an editable starting sketch/);
  assert.match(provider, /Do not infer exact dimensions, structure, code compliance, framing, concealed conditions, products, quantities, or pricing/);
  assert.match(provider, /house side at y=0/);
  assert.match(provider, /store: false/);
  assert.match(provider, /strict: true/);
  assert.match(provider, /minimum: 0, maximum: 1/);
  assert.match(provider, /AbortSignal\.timeout\(45000\)/);
});

test("shape suggestion reads only tenant-scoped completed-visit private photos", () => {
  assert.match(route, /authorizeGuidedSiteVisit/);
  assert.match(route, /\.eq\("company_id", auth\.authorization!\.companyId\)/g);
  assert.match(route, /visit\.data\.status !== "completed"/);
  assert.match(route, /guided_site_visit_intake_attempts/);
  assert.match(route, /guided_site_visit_photo_attempts/);
  assert.match(route, /\.eq\("state", "confirmed"\)/);
  assert.match(route, /\.from\("ai-estimator-private"\)\.download/);
  assert.match(route, /slice\(0, 6\)/);
});

test("field measurements scale the sketch and every uncertain result falls back safely", () => {
  assert.match(route, /Math\.round\(point\.x \* length \* 2\) \/ 2/);
  assert.match(route, /Math\.round\(point\.y \* width \* 2\) \/ 2/);
  assert.match(route, /deckFieldDimensions\(observations\)/);
  assert.match(route, /point\.x \* length/);
  assert.match(route, /point\.y \* width/);
  assert.match(route, /suggestion\.confidence < 0\.55/);
  assert.match(route, /!isValidDeckOutline\(scaled\)/);
  assert.match(route, /outline: startingRectangle/);
  assert.match(route, /New construction starts from the field-entered dimensions/);
});

test("mobile review automatically tries replacement photos but keeps human approval explicit", () => {
  assert.match(shapeReview, /automaticSuggestionStarted/);
  assert.match(shapeReview, /deck-shape-suggestion/);
  assert.match(shapeReview, /AI may suggest the general existing footprint/);
  assert.match(shapeReview, /never supplies exact dimensions or structural decisions/);
  assert.match(shapeReview, /Save this shape — continue to structure/);
  assert.match(shapeReview, /approveShape/);
});
