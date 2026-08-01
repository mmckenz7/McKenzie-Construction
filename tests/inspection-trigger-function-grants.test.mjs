import assert from "node:assert/strict";
import {
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260801020000_inspection_trigger_function_privilege_hardening.sql",
  "utf8",
);

const triggerOnlyFunctions = [
  "assign_project_inspection_correction_number",
  "set_inspection_research_updated_at",
  "set_project_inspection_correction_updated_at",
  "set_project_inspection_document_updated_at",
];

const triggerBindings = [
  "trigger: assign_project_inspection_correction_number before insert on public.project_inspection_corrections -> public.assign_project_inspection_correction_number()",
  "trigger: set_project_inspection_correction_updated_at before update on public.project_inspection_corrections -> public.set_project_inspection_correction_updated_at()",
  "trigger: set_project_inspection_document_findings_updated_at before update on public.project_inspection_document_findings -> public.set_project_inspection_document_updated_at()",
  "trigger: set_project_inspection_documents_updated_at before update on public.project_inspection_documents -> public.set_project_inspection_document_updated_at()",
  "trigger: set_project_inspection_research_findings_updated_at before update on public.project_inspection_research_findings -> public.set_inspection_research_updated_at()",
  "trigger: set_project_inspection_research_runs_updated_at before update on public.project_inspection_research_runs -> public.set_inspection_research_updated_at()",
];

test("inspection trigger-only helpers are owner-only for direct execution", () => {
  for (const functionName of triggerOnlyFunctions) {
    const revokePattern = new RegExp(
      `revoke all on function public\\.${functionName}\\(\\)\\s+from public, anon, authenticated, service_role;`,
      "s",
    );

    assert.match(migration, revokePattern);
    assert.doesNotMatch(
      migration,
      new RegExp(`grant execute on function public\\.${functionName}\\(`, "i"),
    );
  }
});

test("existing inspection trigger bindings remain represented", () => {
  for (const triggerBinding of triggerBindings) {
    assert.ok(
      migration.includes(triggerBinding),
      `missing audited trigger binding: ${triggerBinding}`,
    );
  }
});

test("inspection helper hardening migration changes grants only", () => {
  const executableSql = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  assert.doesNotMatch(
    executableSql,
    /\b(?:create|alter|drop)\s+(?:function|trigger|table)\b/i,
  );
  assert.doesNotMatch(executableSql, /\b(?:insert|update|delete|truncate)\b/i);
});

test("application code does not call inspection trigger-only helpers", () => {
  const findRouteFiles = (directory) => readdirSync(
    directory,
    { withFileTypes: true },
  ).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return findRouteFiles(entryPath);
    }

    return entry.name === "route.ts" ? [entryPath] : [];
  });
  const inspectedRoutePaths = findRouteFiles("src/app");

  assert.ok(inspectedRoutePaths.length > 0);

  for (const routePath of inspectedRoutePaths) {
    const source = readFileSync(routePath, "utf8");

    for (const functionName of triggerOnlyFunctions) {
      assert.equal(
        source.includes(functionName),
        false,
        `${routePath} must not call trigger-only helper ${functionName}`,
      );
    }
  }
});
