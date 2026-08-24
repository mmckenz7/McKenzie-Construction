import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all(
  [
    "../src/app/api/projects/[projectId]/schedule-readiness/route.ts",
    "../src/app/api/project-schedules/route.ts",
    "../src/components/project-schedule-readiness.tsx",
    "../src/app/operations/schedule/page.tsx",
    "../supabase/migrations/20260821110000_project_schedule_material_gate.sql",
  ].map(async (path) =>
    readFile(new URL(path, import.meta.url), "utf8"),
  ),
);

const [projectRoute, schedulesRoute, form, schedulePage, migration] =
  files;

test("the project API records an explicit material-gate decision", () => {
  assert.match(projectRoute, /materialsNotRequired\?: boolean/);
  assert.match(projectRoute, /"materials_not_required"/);
  assert.match(
    projectRoute,
    /body\.materialsNotRequired === true[\s\S]*confirmed_material_delivery_date[\s\S]*null/,
  );
});

test("the scheduling UI explains the override and disables conflicting delivery inputs", () => {
  assert.match(
    form,
    /No material delivery required before[\s\S]*construction/,
  );
  assert.match(
    form,
    /It does not remove materials or[\s\S]*costs from the estimate/,
  );
  assert.match(
    form,
    /label="Confirmed material delivery"[\s\S]*disabled=\{[\s\S]*readiness\.materialsNotRequired/,
  );
});

test("project and schedule APIs expose the same material-gate state", () => {
  assert.match(projectRoute, /record\.materials_not_required === true/);
  assert.match(schedulesRoute, /record\.materials_not_required === true/);
  assert.match(schedulePage, /\? "Not required"/);
});

test("ready schedules have one explicit calculated-start confirmation", () => {
  assert.match(
    form,
    /scheduleStatus !==[\s\S]*"ready_to_confirm"/,
  );
  assert.match(
    form,
    /confirmedConstructionStart:[\s\S]*readiness\.calculatedConstructionStart/,
  );
  assert.match(
    form,
    /scheduleStatus: "confirmed"/,
  );
  assert.match(
    form,
    /Confirm calculated construction start/,
  );
});

test("the database bypasses only the material gate and preserves every other readiness gate", () => {
  assert.match(
    migration,
    /add column if not exists materials_not_required boolean[\s\S]*not null default false/,
  );
  assert.match(
    migration,
    /materials_not_required is not true[\s\S]*or confirmed_material_delivery_date is null/,
  );
  assert.match(
    migration,
    /when readiness_record\.materials_not_required[\s\S]*installer_earliest_construction_start/,
  );
  assert.match(
    migration,
    /when readiness_record\.customer_ready[\s\S]*waiting_on_customer/,
  );
  assert.match(
    migration,
    /when readiness_record\.permit_ready[\s\S]*waiting_on_permit/,
  );
  assert.match(
    migration,
    /materials_not_required[\s\S]*is not true[\s\S]*material_safe_date is null[\s\S]*waiting_on_materials/,
  );
});
