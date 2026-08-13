import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260813143000_guided_deck_intake_evidence_bridge.sql",
  "utf8",
);
const consolidatedFieldFormMigration = readFileSync(
  "supabase/migrations/20260813144000_guided_deck_consolidated_field_form.sql",
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

test("preserves the already-applied intake evidence bridge byte for byte", () => {
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "20cfe2801b0663254a9433beced21d1db861e736bdcd3d64ddbf301691a6a38e",
  );
  assert.doesNotMatch(migration, /update_guided_site_visit_item_photo_required/);
});

test("adds the conditional confirmation wrapper in one atomic forward migration", () => {
  assert.match(consolidatedFieldFormMigration, /^begin;\n/);
  assert.match(consolidatedFieldFormMigration, /\ncommit;\n$/);
  assert.match(
    consolidatedFieldFormMigration,
    /alter function public\.update_guided_site_visit_item\(uuid,uuid,uuid,integer,text,jsonb,text,text\)\s+rename to update_guided_site_visit_item_photo_required;/,
  );
  assert.match(
    consolidatedFieldFormMigration,
    /revoke all on function public\.update_guided_site_visit_item_photo_required\(uuid,uuid,uuid,integer,text,jsonb,text,text\)\s+from public,anon,authenticated,service_role;/,
  );
  assert.match(
    consolidatedFieldFormMigration,
    /revoke all on function public\.update_guided_site_visit_item\(uuid,uuid,uuid,integer,text,jsonb,text,text\)\s+from public,anon,authenticated;/,
  );
  assert.match(
    consolidatedFieldFormMigration,
    /grant execute on function public\.update_guided_site_visit_item\(uuid,uuid,uuid,integer,text,jsonb,text,text\)\s+to service_role;/,
  );
  assert.doesNotMatch(consolidatedFieldFormMigration, /create or replace function/);
});

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

test("reviewed whole-visit photos lead to one grouped Field Measurements form", () => {
  assert.match(component, /One field form/);
  assert.match(component, />Field Measurements</);
  for (const group of [
    "Overall deck",
    "Framing and supports",
    "Stairs",
    "Railings",
  ])
    assert.match(component, new RegExp(`title: "${group}"`));
  assert.match(component, /No value is inferred from a photo/);
  assert.match(component, /Photo evidence ready · no field dimensions required/);
  assert.match(component, /conditional && effectiveCondition === "yes"/);
  assert.match(component, /Submit field measurements and finish site visit/);
});

test("consolidated submission is revision-ordered and safely resumable", () => {
  assert.match(component, /for \(let index = 0; index < consolidatedItems\.length/);
  assert.match(component, /expectedRevision: nextRevision/);
  assert.match(component, /guided-intake-evidence:\$\{item\.id\}:field-form/);
  assert.match(component, /nextRevision = result\.nextRevision/);
  assert.match(component, /Earlier field items remain saved; retry the remaining form/);
  assert.match(component, /\/complete`/);
  assert.match(component, /Continue to human takeoff/);
});

test("conditional No uses a valid generic confirmation without fake evidence", () => {
  assert.match(
    component,
    /item\.requirement\.mode === "conditional" &&\s*effectiveConsolidatedCondition\(item\) === "no"/,
  );
  assert.match(component, /action: "confirm"/);
  assert.match(component, /conditionStatus: "not_applicable"/);
  assert.match(component, /followUpReasonCode: null/);
  assert.match(component, /followUpNotes: null/);
  assert.match(consolidatedFieldFormMigration, /update_guided_site_visit_item_photo_required/);
  assert.match(consolidatedFieldFormMigration, /requested_observation->>'conditionStatus'='not_applicable'/);
  assert.match(consolidatedFieldFormMigration, /item\.requirement->>'mode'<>'conditional'/);
  assert.match(consolidatedFieldFormMigration, /is_valid_guided_site_visit_observation/);
  assert.match(consolidatedFieldFormMigration, /state='confirmed'/);
});

test("approved full coverage defaults applicability to Yes but remains overrideable", () => {
  assert.match(
    component,
    /item\.requirement\.mode === "conditional" &&\s*itemHasFullIntakeCoverage\(item\)\s*\? "yes"/,
  );
  assert.match(component, /Approved photos show this applies/);
  assert.match(component, /Choose No if\s+your field check says it does not/);
  assert.match(component, /condition: value/);
  assert.doesNotMatch(component, /missing.*\? "no"/i);
});

test("optional notes and blank Skip save in the same final sequence", () => {
  assert.match(component, /Optional jobsite notes/);
  assert.match(component, /leave it blank to Skip/);
  assert.match(component, /optionalJobsiteNotes\[item\.id\]/);
  assert.match(component, /action: "complete_optional"/);
  assert.match(component, /for \(const item of pendingOptionalItems\)/);
  assert.match(component, /expectedRevision: nextRevision/);
  assert.match(component, /nextRevision = optionalResult\.nextRevision/);
  assert.doesNotMatch(component, /if \(optionalItemsRemain\) setVisitCaptureMode\("inbox"\)/);
  assert.match(component, /\/complete`/);
});

test("partial evidence stays a concise exception list instead of restarting nine steps", () => {
  assert.match(component, /Photo exceptions to resolve/);
  assert.match(component, /These are the only photo gaps/);
  assert.match(component, /do not upload the full visit again/);
  assert.match(component, /Resolve photo exceptions/);
  assert.match(component, /intakeExceptions\.length > 0/);
});

test("field defaults use construction-appropriate units without reinterpreting values", () => {
  for (const field of [
    "length",
    "width",
    "height_from_grade",
    "ledger_length",
    "rail_lengths_by_area",
  ])
    assert.match(
      component,
      new RegExp(`${field}: "ft \\+ in"`),
    );
  for (const field of [
    "joist_spacing",
    "support_spacing",
    "joist_depth",
    "beam_depth",
    "post_dimensions",
    "exposed_footing_dimensions",
    "guard_height",
    "handrail_height",
    "opening",
  ])
    assert.match(component, new RegExp(`${field}: "in"`));
  assert.doesNotMatch(component, /joist_depth: "ft/);
  assert.doesNotMatch(component, /beam_depth: "ft/);
  assert.doesNotMatch(component, /post_dimensions: "ft/);
  assert.match(component, /Visible joist spacing \(inches on center\)/);
  assert.match(component, /Support-line spacing \(inches on center\)/);
  assert.match(component, /defaultMeasurementDraft\(field\)/);
  assert.match(component, /serializeMeasurements\(names, draft\.measurements\)/);
  assert.match(component, /unit: draft\?\.unit \?\? ""/);
});
