import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { consultationTimeOptions, isConsultationDateTimeAllowed, isConsultationTimeAllowed } from "../src/lib/consultation-hours.ts";
import { callbackApplies, followUpDraft } from "../src/lib/crm/follow-up.ts";
import { projectNextActions, selectCanonicalGeneratedTasks } from "../src/lib/projects/next-actions.ts";
import { companyEmailSignature } from "../src/lib/crm/company-signature.ts";

test("consultation choices use half-hour increments within configured hours", () => {
  const choices = consultationTimeOptions({ start: "09:15", end: "12:00" });
  assert.deepEqual(choices.map((item) => item.value), ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00"]);
  assert.equal(isConsultationTimeAllowed("10:15", { start: "09:00", end: "17:00" }), false);
  assert.equal(isConsultationTimeAllowed("16:30", { start: "09:00", end: "17:00" }), true);
  assert.equal(isConsultationDateTimeAllowed("2026-08-04T16:30", { start: "09:00", end: "17:00" }), true);
  assert.equal(isConsultationDateTimeAllowed("2026-08-04T16:15", { start: "09:00", end: "17:00" }), false);
  assert.equal(isConsultationDateTimeAllowed("2026-08-04T17:30", { start: "09:00", end: "17:00" }), false);
});

test("callback applicability is explicit for enabled and disabled outcomes", () => {
  assert.equal(callbackApplies("spoke"), true);
  assert.equal(callbackApplies("callback_requested"), true);
  assert.equal(callbackApplies("no_answer"), false);
  assert.equal(callbackApplies("left_voicemail"), false);
});

test("follow-up drafts match all outcomes and use company signature", () => {
  const outcomes = ["spoke", "no_answer", "left_voicemail", "callback_requested"];
  const drafts = outcomes.map((outcome) => followUpDraft(outcome, "Taylor", "deck"));
  assert.deepEqual(drafts.map((draft) => draft.templateKey), ["estimate_follow_up_spoke", "estimate_follow_up_no_answer", "estimate_follow_up_voicemail", "estimate_follow_up_callback"]);
  assert.match(drafts[0].body, /Thank you for speaking/);
  assert.match(drafts[1].body, /unable to connect/);
  assert.match(drafts[2].body, /left a voicemail/);
  assert.match(drafts[3].body, /request for a callback/);
  for (const draft of drafts) assert.doesNotMatch(draft.body, /Michael/);
  assert.equal(companyEmailSignature("BuildCo"), "BuildCo\n865-263-3811");
});

const completeProject = { id: "p1", projectName: "Deck", status: "planning", projectType: "Deck", description: "Replace deck", propertyAddress: "1 Main", projectManagerId: "tm1", estimatedValue: 20000, contractValue: null, startDate: "2026-09-01", targetCompletionDate: "2026-10-01", externalPartyCount: 1, subcontractorScheduleEligible: true, vendorBidEligible: false, materialPhaseCount: 1, hasOpenChangeOrder: false };

test("project next actions are deterministic, prerequisite-aware, and have unique keys", () => {
  const first = projectNextActions(completeProject), second = projectNextActions(completeProject);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((item) => item.key)).size, first.length);
  assert.deepEqual(first.map((item) => item.key), ["request_subcontractor_schedule"]);
  assert.deepEqual(projectNextActions({ ...completeProject, subcontractorScheduleEligible: false, vendorBidEligible: true }).map((item) => item.key), ["request_vendor_bid"]);
  const missing = projectNextActions({ ...completeProject, description: null, projectManagerId: null, estimatedValue: null, externalPartyCount: 0, materialPhaseCount: 0, startDate: null });
  assert.ok(missing.some((item) => item.key === "confirm_project_details"));
  assert.equal(missing.find((item) => item.key === "create_initial_schedule")?.prerequisite, "Assign an internal project manager first.");
  assert.deepEqual(projectNextActions({ ...completeProject, status: "completed" }), []);
});

test("generated task reconciliation chooses one canonical active task", () => {
  assert.equal(selectCanonicalGeneratedTasks([
    { id: "newer", status: "open", created_at: "2026-08-02" },
    { id: "older", status: "open", created_at: "2026-08-01" },
    { id: "manual", status: "open", created_at: "2026-07-01" },
  ])?.id, "manual");
  assert.equal(selectCanonicalGeneratedTasks([
    { id: "done", status: "completed", created_at: "2026-07-01" },
    { id: "open", status: "open", created_at: "2026-08-01" },
  ])?.id, "open");
});

test("duplicate cleanup scopes changes to generated tasks", async () => {
  const source = await readFile(new URL("../src/lib/projects/reconcile-next-actions.ts", import.meta.url), "utf8");
  assert.match(source, /source_type.*project_next_action/);
  assert.match(source, /status: "canceled"/);
});

test("customer confirmation is distinct and records actor attribution", async () => {
  const source = await readFile(new URL("../src/app/api/leads/[leadId]/confirm-consultation/route.ts", import.meta.url), "utf8");
  assert.match(source, /pending_customer_confirmation/);
  assert.match(source, /customerConfirmed/);
  assert.match(source, /changed_by_auth_user_id: user\.id/);
  assert.match(source, /isConsultationDateTimeAllowed/);
  const workflow = await readFile(new URL("../src/app/api/leads/[leadId]/workflow/route.ts", import.meta.url), "utf8");
  assert.match(workflow, /isConsultationDateTimeAllowed/);
  assert.doesNotMatch(workflow, /Michael McKenzie/);
  const migration = await readFile(new URL("../supabase/migrations/20260803010000_beta_consultation_default.sql", import.meta.url), "utf8");
  assert.match(migration, /consultation_end_time set default '17:00:00'/);
});

test("project parties support assignment workflows and Mission Control honest empty states", async () => {
  const [migration, route, mission] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260803000000_beta_core_workflow_settings.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/projects/[projectId]/parties/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/all-work/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /project_parties/); assert.match(migration, /workflow_permissions/);
  assert.match(route, /schedule.*bid.*material.*vendor/);
  assert.match(mission, /No urgent or due-today tasks/);
});

test("Task Settings is nested behind management access", async () => {
  const [layout, settings, api] = await Promise.all([
    readFile(new URL("../src/app/admin/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/task-types/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(layout, /label: "Task Settings"/);
  assert.match(settings, /hasManagementAccess/);
  assert.match(api, /hasManagementAccess/);
  const salesLeads = await readFile(new URL("../src/app/sales/leads/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(salesLeads, /Task Settings/);
});

test("Change Orders are only exposed from project context", async () => {
  const [operationsLayout, operationsPage, proxy] = await Promise.all([
    readFile(new URL("../src/app/operations/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/operations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/proxy.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(operationsLayout, /label: "Change Orders"/);
  assert.doesNotMatch(operationsPage, /title: "Change Orders"/);
  assert.match(proxy, /operations\/change-orders/);
});
