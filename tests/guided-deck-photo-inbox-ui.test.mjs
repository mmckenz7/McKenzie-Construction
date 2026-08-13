import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync(
  "src/components/estimates/guided-deck-photo-inbox.tsx",
  "utf8",
);
const visit = readFileSync(
  "src/components/estimates/guided-deck-site-visit.tsx",
  "utf8",
);
const inboxRoute = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/intake-batches/route.ts",
  "utf8",
);

test("whole-visit Photo Inbox is the default with guided capture as fallback", () => {
  assert.match(visit, /useState<"inbox" \| "guided">\(\s*"inbox"/);
  assert.match(visit, /<GuidedDeckPhotoInbox/);
  assert.match(inbox, /Use guided checklist capture instead/);
  assert.match(visit, /Back to whole-visit Photo Inbox/);
});

test("selects up to 30 once with previews, removal, exact reasons, and re-armed input", () => {
  assert.match(inbox, /const MAX_INBOX_PHOTOS = 30/);
  assert.match(inbox, /multiple/);
  assert.match(
    inbox,
    /Selected \$\{files\.length\} · added \$\{accepted\.length\} · not added/,
  );
  for (const reason of [
    "inbox full",
    "unsupported type",
    "too large",
    "duplicate",
  ])
    assert.match(inbox, new RegExp(reason));
  assert.match(inbox, /URL\.createObjectURL/);
  assert.match(inbox, /removeDraft/);
  assert.match(inbox, /event\.target\.value = ""/);
});

test("uploads sequentially and stops safely on the first failed member", () => {
  assert.match(
    inbox,
    /for \(let index = 0; index < queue\.length; index \+= 1\)/,
  );
  assert.match(
    inbox,
    /intake-batches\/\$\{opened\.batchId\}\/members\/\$\{memberOrdinal\}\/upload-session/,
  );
  assert.match(inbox, /intake-photos\/\$\{attemptToAbandon\}\/abandon/);
  assert.match(
    inbox,
    /Earlier photos are saved; this photo and all remaining photos stay in the tray/,
  );
  assert.match(inbox, /catch \(cause\)[\s\S]*?break;/);
  assert.match(inbox, /successes\.has\(draft\.id\)/);
});

test("retries the immutable batch and reselects device-local files by declared hash", () => {
  assert.match(inbox, /const resumableBatchId = queue\[0\]\?\.batchId/);
  assert.match(inbox, /resumableBatchId\s*\? \{ batchId: resumableBatchId \}/);
  assert.match(inbox, /const memberOrdinal = draft\.ordinal \?\? index \+ 1/);
  assert.match(inbox, /Reselect remaining files/);
  assert.match(inbox, /member\.declared_sha256 === sha256/);
  assert.match(inboxRoute, /declared_sha256/);
});

test("classifies every confirmed photo and keeps AI advisory", () => {
  assert.match(inbox, /classification-reviews/);
  assert.match(inbox, /let reviewFailures = 0/);
  assert.match(inbox, /reviewFailures \+= 1/);
  assert.match(inbox, /uploaded safely, but the AI review needs to be retried/);
  assert.match(inbox, /The remaining uploads continued/);
  assert.match(inbox, /Site visit photo summary/);
  assert.match(
    inbox,
    /Check the nine sections below, then confirm the organization once/,
  );
  assert.match(inbox, /Confirm AI organization for/);
  assert.match(inbox, /Optional: review individual photo suggestions/);
  assert.match(inbox, /AI found/);
  assert.match(inbox, /diagnostic_class !== "classified"/);
});

test("requires explicit human assignment decisions", () => {
  assert.match(inbox, /assignment-events/);
  assert.match(inbox, /"accepted" \| "corrected" \| "excluded"/);
  assert.match(inbox, />\s*Accept\s*</);
  assert.match(inbox, />\s*Exclude\s*</);
  assert.match(inbox, /Correct assignment/);
  assert.match(inbox, /Save corrected assignment/);
});

test("uses leaf assignment events and closes the original before correction", () => {
  assert.match(inboxRoute, /supersedes_assignment_event_id/);
  assert.match(
    inbox,
    /later\.supersedes_assignment_event_id === assignment\.id/,
  );
  const correction = inbox.slice(
    inbox.indexOf("async function correctAssignment"),
    inbox.indexOf("async function retryClassification"),
  );
  assert.match(correction, /decision: "excluded"/);
  assert.match(correction, /nextRevision = excluded\.nextRevision/);
  assert.match(correction, /decision: "corrected"/);
});

test("retries unavailable AI review with a fresh append-only key", () => {
  assert.match(inbox, /async function retryClassification/);
  assert.match(
    inbox,
    /classification:\$\{attemptId\}:retry:\$\{crypto\.randomUUID\(\)\}/,
  );
  assert.match(inbox, /Retry AI review/);
});

test("defers consolidated missing results until terminal and human verified", () => {
  assert.match(inbox, /const reviewComplete =/);
  assert.match(inbox, /remainingServerMembers\.length === 0/);
  assert.match(inbox, /drafts\.length === 0/);
  assert.match(inbox, /pendingReviewCount === 0/);
  assert.match(inbox, /unavailableRows\.length === 0/);
  assert.match(inbox, /unresolvedCoverage\.length === 0/);
  assert.match(inbox, /Consolidated missing list/);
  assert.match(
    inbox,
    /missing list appears only after every photo review is terminal/,
  );
  assert.match(inbox, /not counted as missing evidence/);
  assert.match(inbox, /Upload the remaining/);
  assert.match(inboxRoute, /itemKey: item_key/);
  assert.match(inboxRoute, /order\("created_at", \{ ascending: false \}\)/);
});

test("uses the newest intake batch and confirms one suggestion per criterion", () => {
  assert.match(inbox, /const currentBatch = data\?\.batches\[0\]/);
  assert.match(inbox, /member\.batch_id === currentBatch\?\.id/);
  assert.match(inbox, /const suggestedConfirmations = criterionSummaries/);
  assert.match(inbox, /summary\.undecided\[0\]/);
  assert.match(inbox, /async function confirmPhotoSummary/);
});
