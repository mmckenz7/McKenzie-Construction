import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const leadDetailSources = await Promise.all(
  [
    "../src/app/sales/leads/[leadId]/page.tsx",
    "../src/app/admin/leads/[leadId]/page.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

test("lead detail timestamps use the company timezone", () => {
  for (const source of leadDetailSources) {
    const formatter = source.match(
      /function formatDateAndTime[\s\S]*?\.format\(date\);/,
    )?.[0];

    assert.ok(formatter, "expected a lead date-time formatter");
    assert.match(formatter, /timeZone: "America\/New_York"/);
  }
});
