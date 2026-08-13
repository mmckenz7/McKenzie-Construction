import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260813143000_guided_deck_intake_evidence_bridge.sql",
  "utf8",
);
const route = readFileSync(
  "src/app/api/guided-site-visits/[visitId]/items/[visitItemId]/intake-evidence-confirmation/route.ts",
  "utf8",
);
const component = readFileSync(
  "src/components/estimates/guided-deck-site-visit.tsx",
  "utf8",
);

test("snapshots exact effective intake evidence without copying photo attempts", () => {
  assert.match(migration, /guided_site_visit_intake_item_confirmations/);
  assert.match(migration, /guided_site_visit_intake_item_confirmation_facts/);
  assert.match(migration, /source_assignment_event_id/);
  assert.match(migration, /canonical_assignment_event_ids/);
  assert.match(migration, /later\.supersedes_assignment_event_id=e\.id/);
  assert.match(migration, /a\.state='confirmed'/);
  assert.match(migration, /asset\.status='available'/);
  assert.match(migration, /review\.diagnostic_class='classified'/);
  assert.match(migration, /selected_assets not between 1 and 5/);
  assert.doesNotMatch(
    migration,
    /insert into public\.guided_site_visit_photo_attempts/,
  );
});

test("keeps confirmation tenant scoped, revision locked, human entered, and immutable", () => {
  assert.match(migration, /guided_site_visit_actor_company/);
  assert.match(migration, /company_id=company for update/);
  assert.match(migration, /visit\.status<>'in_progress'/);
  assert.match(migration, /visit\.revision<>requested_expected_revision/);
  assert.match(migration, /state='pending' for update/);
  assert.match(migration, /is_valid_guided_site_visit_observation/);
  assert.match(migration, /confirmed_observation=requested_observation/);
  assert.match(migration, /prevent_guided_intake_item_confirmation_mutation/);
  assert.match(migration, /from public,anon,authenticated/);
  assert.match(migration, /to service_role/);
  assert.match(migration, /idempotency_conflict/);
});

test("prevents assignment changes after an item or visit becomes terminal", () => {
  assert.match(migration, /enforce_guided_intake_assignment_editable_item/);
  assert.match(migration, /v\.status='in_progress'/);
  assert.match(migration, /i\.state='pending'/);
  assert.match(
    migration,
    /decide_guided_site_visit_intake_assignment_unhardened/,
  );
  assert.match(migration, /return query select 'not_editable'/);
});

test("route accepts only the bounded exact confirmation contract", () => {
  assert.match(route, /exactObject\(await request\.json\(\), FIELDS\)/);
  for (const field of [
    "expectedRevision",
    "idempotencyKey",
    "assignmentEventIds",
    "observation",
  ])
    assert.match(route, new RegExp(`"${field}"`));
  assert.match(route, /assignmentEventIds\.length > 12/);
  assert.match(route, /UUID\.test\(id\)/);
  assert.match(route, /confirm_guided_site_visit_item_from_intake/);
  assert.match(route, /requested_auth_user_id: auth\.authorization!\.authUserId/);
});

test("full inbox coverage skips reupload but preserves field gates and final confirmation", () => {
  assert.match(component, /const inboxEvidenceReady =/);
  assert.match(component, /later\.supersedesAssignmentEventId === assignment\.id/);
  assert.match(component, /intakeSnapshot\?\.confirmedAttemptIds\.has/);
  assert.match(component, /Human-verified Photo Inbox evidence/);
  assert.match(component, /No photo upload is needed here/);
  assert.match(component, /enter the field measurements and confirmations yourself/);
  assert.match(
    component,
    /guidedPhotoFallbackAllowed && !captureIntent && !humanAccepted/,
  );
  assert.match(component, /reviewPhotoReady \|\| inboxEvidenceReady/);
  assert.match(component, /measurementComplete\(field, measurements\[field\]\)/);
  assert.match(component, /I confirm these field facts/);
  assert.match(component, /intake-evidence-confirmation/);
});

test("partial and optional evidence never bypass guided capture", () => {
  assert.match(
    component,
    /selectedIntakeAssignments\.length === declaredInboxCriteria\.length/,
  );
  assert.match(component, /access_demolition/);
  assert.match(component, /utilities_obstructions/);
  assert.match(component, /More photo evidence is needed for this item/);
  assert.match(component, /Use\s+the guided photo controls below for the missing parts/);
});

test("unknown or unavailable intake evidence can never expose reupload controls", () => {
  assert.match(component, /type IntakeEvidenceLoadState/);
  assert.match(component, /status: "loading"/);
  assert.match(component, /status: "ready"; snapshot: IntakeEvidenceSnapshot/);
  assert.match(component, /status: "unavailable"/);
  assert.match(
    component,
    /const guidedPhotoFallbackAllowed =\s*intakeEvidence\.status === "ready" && !inboxEvidenceReady/,
  );
  assert.match(component, /Checking saved Photo Inbox evidence/);
  assert.match(component, /Saved photo evidence cannot be checked/);
  assert.match(component, /Photo Inbox evidence was not lost/);
  assert.match(component, /paused to prevent a\s+duplicate upload/);
  assert.match(component, /Retry saved evidence check/);
  assert.match(component, /onClick=\{\(\) => visit && void loadIntakeEvidence\(visit\.id\)\}/);
  assert.match(
    component,
    /guidedPhotoFallbackAllowed && !captureIntent && !humanAccepted/,
  );
  assert.match(
    component,
    /intakeEvidence\.status === "ready" &&\s*\(reviewPhotoReady \|\| inboxEvidenceReady\)/,
  );
});

test("full coverage explains deterministic human-approved provenance", () => {
  assert.match(
    component,
    /selected the latest effective\s+human-approved assignment/,
  );
  assert.match(component, /Superseded and excluded assignments\s+are not used/);
  assert.match(component, /Review selected evidence coverage/);
  assert.match(component, /declaredInboxCriteria\.map/);
});
