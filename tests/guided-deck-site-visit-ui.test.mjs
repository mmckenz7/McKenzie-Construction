import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  "src/components/estimates/guided-deck-site-visit.tsx",
  "utf8",
);
const builder = readFileSync(
  "src/components/estimates/estimate-builder.tsx",
  "utf8",
);
const page = readFileSync(
  "src/app/sales/estimates/[estimateId]/page.tsx",
  "utf8",
);
const photoCompleteRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/photos/[photoId]/complete/route.ts",
  "utf8",
);
const captureMigration = readFileSync(
  "supabase/migrations/20260812150000_guided_deck_site_visit_manual_capture.sql",
  "utf8",
);

test("Deck workflow is query gated and shows one persisted capture at a time", () => {
  assert.match(page, /showDeckWorkflow=\{query\.workflow === "deck"\}/);
  assert.match(builder, /<GuidedDeckSiteVisit estimateId=\{estimateId\}/);
  assert.match(
    component,
    /visit\?\.items\.find\(\(item\) => item\.state === "pending"\)/,
  );
  assert.match(component, /Capture \{current\.ordinal\} of 9/);
  assert.doesNotMatch(component, /\.map\(\(item\).*Required capture/s);
});

test("camera upload is private, progress visible, and invokes trusted advisory review", () => {
  assert.match(component, /capture="environment"/);
  assert.match(component, /crypto\.subtle\.digest\(\s*"SHA-256"/);
  assert.match(component, /upload-session/);
  assert.match(component, /Uploading \$\{progress\}%/);
  assert.match(component, /photos\/\$\{photoId\}\/usability-reviews/);
  assert.match(component, /guided-photo-usability:\$\{photoId\}:initial/);
  assert.match(
    component,
    /reviewPhoto\(\s*activePhotoId,\s*initialReviewKey\(activePhotoId\)/,
  );
  assert.match(component, /reservationNonce/);
  assert.match(component, /Reviewing photo/);
  assert.match(component, /Photo is clear/);
  assert.match(component, /Retake recommended/);
  assert.match(component, /Couldn’t review/);
  assert.match(component, /I confirm this capture/);
  assert.doesNotMatch(
    component,
    /AI (?:passed|approved)|automatic pass|structurally sound|code compliant/i,
  );
});

test("photo selection clearly offers camera and existing-photo library sources", () => {
  assert.match(component, /<PhotoSourceControls\s+title="Add photo"/);
  const sources = component.slice(
    component.indexOf("function PhotoSourceControls"),
    component.indexOf("function ManualConfirmation"),
  );
  const cameraControl = sources.slice(
    sources.indexOf("<input\n"),
    sources.indexOf("Take photo"),
  );
  const libraryStart = sources.indexOf(
    "<input\n",
    sources.indexOf("Take photo"),
  );
  const libraryControl = sources.slice(
    libraryStart,
    sources.indexOf("Choose existing photo"),
  );
  assert.match(cameraControl, /capture="environment"/);
  assert.match(
    cameraControl,
    /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/,
  );
  assert.doesNotMatch(libraryControl, /capture=/);
  assert.match(
    libraryControl,
    /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/,
  );
  assert.match(sources, /flex-col gap-3 sm:flex-row/);
});

test("batch capture is the mobile default and preserves guided help", () => {
  assert.match(component, /useState<"batch" \| "guided">\("batch"\)/);
  assert.match(component, /Capture photo set/);
  assert.match(component, /Guided photo help/);
  assert.match(component, /function BatchPhotoCapture/);
  assert.match(component, /multiple/);
  assert.match(component, /MAX_ACTIVE_PHOTOS = 5/);
  assert.match(component, /MAX_BATCH_BYTES = 60 \* 1024 \* 1024/);
  assert.match(component, /GUIDED_PHOTO_MIME_TYPES\.has\(file\.type\)/);
  assert.match(component, /file\.size > GUIDED_PHOTO_MAX_BYTES/);
  assert.match(component, /Remove photo \$\{index \+ 1\}/);
  assert.match(component, /Upload \$\{drafts\.length\}/);
});

test("batch uploads are sequential, durable, and linked to backend provenance", () => {
  assert.match(
    component,
    /for \(let index = 0; index < queued\.length; index \+= 1\)/,
  );
  assert.match(component, /captureIntent: "batch"/);
  assert.match(component, /batchId: opened\.batchId/);
  assert.match(component, /batchOrdinal: index \+ 1/);
  assert.match(
    component,
    /Uploading photo \$\{progress\.current\} of \$\{progress\.total\}/,
  );
  assert.match(
    component,
    /Earlier photos are saved; this photo and all unattempted photos remain in the tray for retry/,
  );
  assert.match(component, /successfulIds\.add\(draft\.id\)/);
  assert.match(component, /await reviewPhoto\(/);
});

test("a failed batch member stops before unattempted members and preserves their tray state", () => {
  const batchUpload = component.slice(
    component.indexOf("async function uploadPhotoBatch"),
    component.indexOf("async function uploadPhoto(file"),
  );
  assert.match(batchUpload, /catch \(uploadError\)[\s\S]*?break;/);
  assert.match(
    batchUpload,
    /\.filter\(\(draft\) => !successfulIds\.has\(draft\.id\)\)/,
  );
  assert.match(
    batchUpload,
    /draft\.status === "uploading"[\s\S]*status: "ready" as const/,
  );
  assert.match(batchUpload, /if \(incompletePhoto\)[\s\S]*?\/abandon/);
});

test("collective review emphasizes missing items and a targeted follow-up", () => {
  assert.match(component, /Photo set review · Combined photo coverage/);
  assert.match(component, /Missing or unclear/);
  assert.match(
    component,
    /Take another angle for \{missingCoverage\[0\]\?\.label\}/,
  );
  assert.match(component, /Review all photo results/);
  assert.match(
    component,
    /captureMode === "guided" &&[\s\S]*<PhotoReviewStatus/,
  );
  assert.match(component, /HEIC\/HEIF needs your manual visibility check/);
});

test("the entire photo-source group is visibly and semantically disabled while busy", () => {
  const sources = component.slice(
    component.indexOf("function PhotoSourceControls"),
    component.indexOf("function ManualConfirmation"),
  );
  assert.match(
    sources,
    /<fieldset[\s\S]*disabled=\{busy\}[\s\S]*aria-busy=\{busy\}/,
  );
  assert.match(sources, /busy \? "cursor-not-allowed opacity-50"/);
  assert.match(sources, /disabled=\{busy\}/g);
  assert.match(sources, /role="status"/);
  assert.match(sources, /busyLabel \?\? "Uploading photo…"/);
  assert.match(sources, /Photo choices are unavailable until\s*this finishes/);
});

test("resumed visits select the latest review with a stable tie-breaker", () => {
  assert.match(
    component,
    /latestUsabilityReview\(\s*storedPhoto\?\.usabilityReviews/,
  );
  assert.match(
    component,
    /review\.createdAt === latest\.createdAt &&\s*review\.id > latest\.id/,
  );
  assert.doesNotMatch(component, /usabilityReviews\.at\(-1\)/);
});

test("all nine approved Deck captures and required field measurements are represented", () => {
  const criteria = readFileSync(
    "src/lib/guided-site-visits/visible-fact-criteria.ts",
    "utf8",
  );
  for (const key of [
    "property_context",
    "full_deck_yard",
    "house_ledger",
    "underside_framing",
    "supports_footings",
    "stairs_landings",
    "guards_railings",
    "access_demolition",
    "utilities_obstructions",
  ])
    assert.match(criteria, new RegExp(key));
  for (const field of [
    "length",
    "width",
    "height_from_grade",
    "joist_spacing",
    "post_dimensions",
    "stair_width",
    "guard_height",
    "gate_width",
    "obstruction_clearances",
  ])
    assert.match(component, new RegExp(field));
  assert.match(component, /Choose unit/);
  assert.match(component, /const LONG_UNITS = \["ft", "ft \+ in", "in"\]/);
  assert.doesNotMatch(component, /placeholder="Unit"/);
  assert.match(component, /conditionStatus: "applies"/);
  assert.match(component, /conditionStatus: "not_applicable"/);
  assert.match(component, /serializeMeasurements/);
});

test("every measurement has plain-English help and compound visible dimensions are explicit", () => {
  for (const field of [
    "length",
    "width",
    "height_from_grade",
    "ledger_length",
    "joist_spacing",
    "joist_depth",
    "beam_depth",
    "post_dimensions",
    "support_spacing",
    "exposed_footing_dimensions",
    "stair_width",
    "total_rise",
    "tread_depth",
    "representative_riser",
    "landing_dimensions",
    "guard_height",
    "opening",
    "rail_lengths_by_area",
    "handrail_height",
    "narrow_access_width",
    "gate_width",
    "clearance",
    "obstruction_clearances",
  ])
    assert.match(component, new RegExp(`${field}: ".+"`));
  assert.match(
    component,
    /horizontal distance between adjacent support or beam lines\. Do not assume this is post spacing/,
  );
  for (const label of [
    "Post width",
    "Post depth",
    "Visible footing width",
    "Visible footing length",
    "Visible footing height or depth",
  ])
    assert.match(component, new RegExp(label));
  assert.match(
    component,
    /draft\.components!\.map\(\(part\) => part\.trim\(\)\)\.join\(" × "\)/,
  );
  assert.match(component, /Do not estimate anything below grade/);
});

test("self-review repeats photo contents and review failures give actionable guidance", () => {
  assert.match(component, /Make sure the photo includes/);
  assert.match(component, /\(INCLUDE\[current\.itemKey\] \?\? \[\]\)\.map/);
  for (const code of [
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
    "review_unavailable",
  ])
    assert.match(component, new RegExp(`${code}: \\{`));
  assert.match(component, /exact photo problem is unknown/);
  assert.match(component, /Retry the review/);
});

test("retake, retry, block, resume, and final outcomes remain explicit", () => {
  assert.match(component, /Retake photo/);
  assert.match(component, /Retry review/);
  assert.match(component, /Check photo myself/);
  assert.match(component, /review_unavailable/);
  assert.match(
    component,
    /reviewPhoto\(\s*activePhotoId,\s*initialReviewKey\(activePhotoId\)/,
  );
  assert.match(component, /Retry or document why this capture is blocked/);
  assert.match(component, /Cannot capture this/);
  assert.match(component, /followUpReasonCode/);
  assert.doesNotMatch(component, /window\.sessionStorage/);
  assert.match(component, /guided-site-visits/);
  assert.match(component, /Site visit documented: all 9 captures passed/);
  assert.match(component, /documented with \$\{blockedCount\} blocked/);
  assert.match(component, /Submit documented visit with follow-up required/);
  assert.match(component, /Incomplete/);
});

test("every completed review state keeps a clear mobile-first retake action", () => {
  const reviewStatus = component.slice(
    component.indexOf("function PhotoReviewStatus"),
    component.indexOf("function VisibleFactReviewCard"),
  );
  assert.ok((reviewStatus.match(/title="Retake photo"/g) ?? []).length >= 3);
  assert.ok((reviewStatus.match(/onSelect=\{onRetake\}/g) ?? []).length >= 3);
  assert.match(reviewStatus, /Check visible items/);
  assert.match(reviewStatus, /Retry review/);
  assert.match(component, /Check photo myself/);
});

test("retake remains visible after human acceptance and clears acceptance before upload", () => {
  assert.match(component, /Photo set checked/);
  assert.match(
    component,
    /title="Retake photo"[\s\S]*onSelect=\{\(\) => setHumanAccepted\(false\)\}/,
  );
  assert.match(
    component,
    /if \(file\) \{[\s\S]*onSelect\?\.\(\);[\s\S]*void uploadPhoto\(file\);/,
  );
});

test("retaking creates a linked replacement and never advances the capture", () => {
  assert.match(
    component,
    /retakeOfAttemptId:[\s\S]*captureIntent\?\.kind === "retake"[\s\S]*captureIntent\.photoId/,
  );
  assert.match(component, /kind: "retake",[\s\S]*photoId: activePhotoId/);
  assert.match(photoCompleteRoute, /confirm_guided_site_visit_photo/);
  assert.match(
    captureMigration,
    /if attempt\.retake_of_attempt_id is not null then[\s\S]*set state='superseded'[\s\S]*id=attempt\.retake_of_attempt_id/,
  );
  assert.doesNotMatch(component, /method:\s*"DELETE"/);
  assert.doesNotMatch(
    component,
    /function PhotoSourceControls[\s\S]*confirmItem\(/,
  );
});

test("an interrupted private upload is append-only failed before retry reservation", () => {
  assert.match(component, /photo\.state === "upload_pending"/);
  assert.match(component, /photos\/\$\{incompletePhoto\.id\}\/abandon/);
  assert.match(component, /expectedRevision = abandoned\.nextRevision/);
  assert.ok(
    component.indexOf("/abandon") < component.indexOf("/photos/upload-session"),
  );
});
