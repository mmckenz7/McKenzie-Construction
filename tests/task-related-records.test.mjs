import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [dashboard, operationsPage, adminPage] = await Promise.all(
  [
    "../src/components/task-dashboard.tsx",
    "../src/app/operations/tasks/page.tsx",
    "../src/app/admin/tasks/page.tsx",
  ].map((path) =>
    readFile(new URL(path, import.meta.url), "utf8"),
  ),
);

test("task cards expose exact project and customer context", () => {
  assert.match(dashboard, /Project:/);
  assert.match(dashboard, /Customer:/);
  assert.match(dashboard, /relatedProject\.project_name/);
  assert.match(dashboard, /relatedCustomer\.customer_name/);
  assert.match(
    dashboard,
    /operations\/projects\/\$\{encodeURIComponent/,
  );
});

test("both task workspaces load the related-record maps", () => {
  for (const page of [operationsPage, adminPage]) {
    assert.match(
      page,
      /from\("projects"\)[\s\S]*id, project_name, customer_id/,
    );
    assert.match(
      page,
      /from\("customers"\)[\s\S]*id, customer_name/,
    );
    assert.match(page, /projects=\{projects\}/);
    assert.match(page, /customers=\{customers\}/);
  }
});
