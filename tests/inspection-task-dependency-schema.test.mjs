import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260807000000_inspection_task_dependency_fk.sql",
  import.meta.url,
);

const migration = await readFile(
  migrationPath,
  "utf8",
);

test("inspection task dependency migration audits existing rows", () => {
  assert.match(
    migration,
    /left join public\.tasks task\s+on task\.id = dependency\.task_id/i,
  );
  assert.match(
    migration,
    /task\.id is null\s+or task\.project_id is distinct from dependency\.project_id/i,
  );
  assert.match(
    migration,
    /raise exception[\s\S]+orphaned or cross-project task references/i,
  );
});

test("inspection dependencies reference a task in the same project", () => {
  assert.match(
    migration,
    /unique \(id, project_id\)/i,
  );
  assert.match(
    migration,
    /foreign key \(task_id, project_id\)\s+references public\.tasks \(id, project_id\)/i,
  );
  assert.match(
    migration,
    /on update restrict\s+on delete restrict/i,
  );
});

test("inspection task dependency migration is transactional", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
});
