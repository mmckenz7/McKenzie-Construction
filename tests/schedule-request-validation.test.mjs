import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { hasValidScheduleRequestDurations } from "../src/lib/schedule-request-validation.ts";

test("sub-day demo work is accepted as zero whole days", () => {
  assert.equal(hasValidScheduleRequestDurations(0, 1), true);
});

test("schedule durations remain finite whole-day values within storage limits", () => {
  assert.equal(hasValidScheduleRequestDurations(-1, 1), false);
  assert.equal(hasValidScheduleRequestDurations(31, 31), false);
  assert.equal(hasValidScheduleRequestDurations(2, 1), false);
  assert.equal(hasValidScheduleRequestDurations(1, 121), false);
  assert.equal(hasValidScheduleRequestDurations(0.5, 1), false);
  assert.equal(hasValidScheduleRequestDurations(Number.NaN, 1), false);
});

test("the public route and database function share the sub-day contract", async () => {
  const [route, migration] = await Promise.all([
    readFile(
      new URL(
        "../src/app/api/schedule-requests/[token]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260821100000_schedule_request_subday_demo_duration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(route, /hasValidScheduleRequestDurations/);
  assert.match(
    migration,
    /requested_demo_duration_days not between 0 and 30/,
  );
  assert.match(
    migration,
    /requested_total_duration_days not between greatest\(requested_demo_duration_days, 1\) and 120/,
  );
});
