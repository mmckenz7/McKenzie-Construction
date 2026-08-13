import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/estimates/guided-deck-site-visit.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const page = readFileSync("src/app/sales/estimates/[estimateId]/page.tsx", "utf8");
const photoCompleteRoute = readFileSync("src/app/api/guided-site-visits/[visitId]/photos/[photoId]/complete/route.ts", "utf8");
const captureMigration = readFileSync("supabase/migrations/20260812150000_guided_deck_site_visit_manual_capture.sql", "utf8");

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

test("photo selection clearly offers camera and existing-photo library sources", () => {
  assert.match(component, /<PhotoSourceControls title="Add photo"/);
  const sources = component.slice(component.indexOf("function PhotoSourceControls"), component.indexOf("function ManualConfirmation"));
  const cameraControl = sources.slice(sources.indexOf('<input type="file"'), sources.indexOf("Take photo"));
  const libraryStart = sources.indexOf('<input type="file"', sources.indexOf("Take photo"));
  const libraryControl = sources.slice(libraryStart, sources.indexOf("Choose existing photo"));
  assert.match(cameraControl, /capture="environment"/);
  assert.match(cameraControl, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
  assert.doesNotMatch(libraryControl, /capture=/);
  assert.match(libraryControl, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
  assert.match(sources, /flex-col gap-3 sm:flex-row/);
});

test("the entire photo-source group is visibly and semantically disabled while busy", () => {
  const sources = component.slice(component.indexOf("function PhotoSourceControls"), component.indexOf("function ManualConfirmation"));
  assert.match(sources, /<fieldset disabled=\{busy\} aria-busy=\{busy\}/);
  assert.match(sources, /busy \? "cursor-not-allowed opacity-50"/);
  assert.match(sources, /disabled=\{busy\}/g);
  assert.match(sources, /role="status"/);
  assert.match(sources, /busyLabel \?\? "Uploading photo…"/);
  assert.match(sources, /Photo choices are unavailable until this finishes/);
});

test("resumed visits select the latest review with a stable tie-breaker", () => {
  assert.match(component, /latestUsabilityReview\(storedPhoto\?\.usabilityReviews/);
  assert.match(component, /review\.createdAt === latest\.createdAt && review\.id > latest\.id/);
  assert.doesNotMatch(component, /usabilityReviews\.at\(-1\)/);
});

test("all nine approved Deck captures and required field measurements are represented", () => {
  for (const key of ["property_context", "full_deck_yard", "house_ledger", "underside_framing", "supports_footings", "stairs_landings", "guards_railings", "access_demolition", "utilities_obstructions"]) assert.match(component, new RegExp(key));
  for (const field of ["length", "width", "height_from_grade", "joist_spacing", "post_dimensions", "stair_width", "guard_height", "gate_width", "obstruction_clearances"]) assert.match(component, new RegExp(field));
  assert.match(component, /Choose unit/);
  assert.match(component, /const LONG_UNITS = \["ft", "ft \+ in", "in"\]/);
  assert.doesNotMatch(component, /placeholder="Unit"/);
  assert.match(component, /conditionStatus: "applies"/);
  assert.match(component, /conditionStatus: "not_applicable"/);
  assert.match(component, /serializeMeasurements/);
});

test("every measurement has plain-English help and compound visible dimensions are explicit", () => {
  for (const field of ["length", "width", "height_from_grade", "ledger_length", "joist_spacing", "joist_depth", "beam_depth", "post_dimensions", "support_spacing", "exposed_footing_dimensions", "stair_width", "total_rise", "tread_depth", "representative_riser", "landing_dimensions", "guard_height", "opening", "rail_lengths_by_area", "handrail_height", "narrow_access_width", "gate_width", "clearance", "obstruction_clearances"]) assert.match(component, new RegExp(`${field}: ".+"`));
  assert.match(component, /horizontal distance between adjacent support or beam lines\. Do not assume this is post spacing/);
  for (const label of ["Post width", "Post depth", "Visible footing width", "Visible footing length", "Visible footing height or depth"]) assert.match(component, new RegExp(label));
  assert.match(component, /draft\.components!\.map\(\(part\) => part\.trim\(\)\)\.join\(" × "\)/);
  assert.match(component, /Do not estimate anything below grade/);
});

test("self-review repeats photo contents and review failures give actionable guidance", () => {
  assert.match(component, /Make sure the photo includes/);
  assert.match(component, /\(INCLUDE\[current\.itemKey\] \?\? \[\]\)\.map/);
  for (const code of ["blurry", "too_dark", "too_bright", "glare", "obstructed", "wrong_subject", "incomplete_view", "too_distant", "orientation_problem", "unsupported_media", "review_unavailable"]) assert.match(component, new RegExp(`${code}: \\{ reason:`));
  assert.match(component, /exact photo problem is unknown/);
  assert.match(component, /Retry the review/);
});

test("retake, retry, block, resume, and final outcomes remain explicit", () => {
  assert.match(component, /Retake photo/);
  assert.match(component, /Retry review/);
  assert.match(component, /Use anyway — I checked it/);
  assert.match(component, /Review photo myself/);
  assert.match(component, /review_unavailable/);
  assert.match(component, /reviewPhoto\(activePhotoId, initialReviewKey\(activePhotoId\)\)/);
  assert.match(component, /Retry or document why this capture is blocked/);
  assert.match(component, /Cannot capture this/);
  assert.match(component, /followUpReasonCode/);
  assert.match(component, /window\.sessionStorage/);
  assert.match(component, /Site visit documented: all 9 captures passed/);
  assert.match(component, /documented with \$\{blockedCount\} blocked/);
  assert.match(component, /Submit documented visit with follow-up required/);
  assert.match(component, /Incomplete/);
});

test("every completed review state keeps a clear mobile-first retake action", () => {
  const goodState = component.slice(component.indexOf('review.verdict === "usable"'), component.indexOf('review.verdict === "retake_recommended"'));
  const retakeState = component.slice(component.indexOf('review.verdict === "retake_recommended"'), component.indexOf('return <div role="status" className="mt-4 rounded-lg border border-slate-300'));
  const unableState = component.slice(component.indexOf('return <div role="status" className="mt-4 rounded-lg border border-slate-300'), component.indexOf("function PhotoSourceControls"));
  for (const state of [goodState, retakeState, unableState]) {
    assert.match(state, /PhotoSourceControls title="Retake photo"/);
    assert.match(state, /onSelect={onRetake}/);
  }
  assert.match(goodState, /Use this photo/);
  assert.match(unableState, /Retry review/);
  assert.match(unableState, /Review photo myself/);
});

test("retake remains visible after human acceptance and clears acceptance before upload", () => {
  const reviewStatus = '{reviewPhotoReady ? <PhotoReviewStatus';
  const manualPanel = '{humanAccepted ? <>';
  assert.ok(component.indexOf(reviewStatus) >= 0);
  assert.ok(component.indexOf(manualPanel) > component.indexOf(reviewStatus));
  const alwaysRenderedReview = component.slice(component.indexOf(reviewStatus), component.indexOf(manualPanel));
  assert.match(alwaysRenderedReview, /onRetake=\{\(\) => setHumanAccepted\(false\)\}/);
  assert.match(alwaysRenderedReview, /reviewPhotoReady \? <PhotoReviewStatus/);
  assert.match(component, /if \(file\) \{ onSelect\?\.\(\); void uploadPhoto\(file\); \}/);
});

test("retaking creates a linked replacement and never advances the capture", () => {
  assert.match(component, /retakeOfAttemptId: pendingPhoto\?\.id \?\? storedPhoto\?\.id \?\? null/);
  assert.match(component, /storedPhoto\?\.id \?\? null/);
  assert.match(photoCompleteRoute, /confirm_guided_site_visit_photo/);
  assert.match(captureMigration, /if attempt\.retake_of_attempt_id is not null then[\s\S]*set state='superseded'[\s\S]*id=attempt\.retake_of_attempt_id/);
  assert.doesNotMatch(component, /method:\s*"DELETE"/);
  assert.doesNotMatch(component, /function PhotoSourceControls[\s\S]*confirmItem\(/);
});

test("an interrupted private upload is append-only failed before retry reservation", () => {
  assert.match(component, /photo\.state === "upload_pending"/);
  assert.match(component, /photos\/\$\{incompletePhoto\.id\}\/abandon/);
  assert.match(component, /expectedRevision = abandoned\.nextRevision/);
  assert.ok(component.indexOf("/abandon") < component.indexOf("/photos/upload-session"));
});
