import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/estimates/guided-deck-site-visit.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const page = readFileSync("src/app/sales/estimates/[estimateId]/page.tsx", "utf8");

test("Deck workflow is query gated and shows one persisted capture at a time", () => {
  assert.match(page, /showDeckWorkflow=\{query\.workflow === "deck"\}/);
  assert.match(builder, /<GuidedDeckSiteVisit estimateId=\{estimateId\}/);
  assert.match(component, /visit\?\.items\.find\(\(item\) => item\.state === "pending"\)/);
  assert.match(component, /Capture \{current\.ordinal\} of 9/);
  assert.doesNotMatch(component, /\.map\(\(item\).*Required capture/s);
});

test("camera upload is private, progress visible, and invokes trusted advisory review", () => {
  assert.match(component, /capture="environment"/);
  assert.match(component, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(component, /upload-session/);
  assert.match(component, /Uploading \$\{progress\}%/);
  assert.match(component, /photos\/\$\{photoId\}\/usability-reviews/);
  assert.match(component, /guided-photo-usability:\$\{photoId\}:initial/);
  assert.match(component, /reviewPhoto\(activePhotoId, initialReviewKey\(activePhotoId\)\)/);
  assert.doesNotMatch(component, /crypto\.randomUUID\(\)/);
  assert.match(component, /Reviewing photo/);
  assert.match(component, /Good/);
  assert.match(component, /Retake recommended/);
  assert.match(component, /Couldn’t review/);
  assert.match(component, /I confirm this capture/);
  assert.doesNotMatch(component, /AI (?:passed|approved)|automatic pass|structurally sound|code compliant/i);
});

test("resumed visits select the latest review with a stable tie-breaker", () => {
  assert.match(component, /latestUsabilityReview\(storedPhoto\?\.usabilityReviews/);
  assert.match(component, /review\.createdAt === latest\.createdAt && review\.id > latest\.id/);
  assert.doesNotMatch(component, /usabilityReviews\.at\(-1\)/);
});

test("all nine approved Deck captures and required field measurements are represented", () => {
  for (const key of ["property_context", "full_deck_yard", "house_ledger", "underside_framing", "supports_footings", "stairs_landings", "guards_railings", "access_demolition", "utilities_obstructions"]) assert.match(component, new RegExp(key));
  for (const field of ["length", "width", "height_from_grade", "joist_spacing", "post_dimensions", "stair_width", "guard_height", "gate_width", "obstruction_clearances"]) assert.match(component, new RegExp(field));
  assert.match(component, /Enter a field measurement and its unit/);
  assert.match(component, /conditionStatus: "applies"/);
  assert.match(component, /conditionStatus: "not_applicable"/);
  assert.match(component, /value: event\.target\.value/);
  assert.match(component, /unit: event\.target\.value/);
});

test("retake, retry, block, resume, and final outcomes remain explicit", () => {
  assert.match(component, /Retake photo/);
  assert.match(component, /Retry review/);
  assert.match(component, /Use anyway — I checked it/);
  assert.match(component, /Review photo myself/);
  assert.match(component, /Retry or document why this capture is blocked/);
  assert.match(component, /Cannot capture this/);
  assert.match(component, /followUpReasonCode/);
  assert.match(component, /window\.sessionStorage/);
  assert.match(component, /Site visit documented: all 9 captures passed/);
  assert.match(component, /documented with \$\{blockedCount\} blocked/);
  assert.match(component, /Submit documented visit with follow-up required/);
  assert.match(component, /Incomplete/);
});
