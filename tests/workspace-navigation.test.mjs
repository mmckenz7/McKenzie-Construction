import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [customersPage, leadPage, leadsPage, projectsPage] = await Promise.all(
  [
    "../src/app/sales/customers/page.tsx",
    "../src/app/sales/leads/[leadId]/page.tsx",
    "../src/app/sales/leads/page.tsx",
    "../src/app/operations/projects/page.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

test("sales pages keep their back and reset links in Sales", () => {
  assert.match(customersPage, /href="\/sales"/);
  assert.match(customersPage, /href="\/sales\/leads"/);
  assert.match(leadPage, /href="\/sales\/leads"/);
  assert.match(leadsPage, /href="\/sales\/leads"/);
  assert.doesNotMatch(customersPage, /href="\/admin"/);
  assert.doesNotMatch(leadPage, /href="\/admin"/);
});

test("operations project navigation stays in Operations", () => {
  assert.match(projectsPage, /href="\/operations"/);
  assert.doesNotMatch(projectsPage, /href="\/admin"/);
});
