import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260801030000_public_function_default_privilege_hardening.sql",
  "utf8",
);

const executableSql = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

test("future postgres-owned public functions are not executable by API roles by default", () => {
  assert.match(
    executableSql,
    /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public\s+revoke\s+execute\s+on\s+functions\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
  );
  assert.doesNotMatch(
    executableSql,
    /alter\s+default\s+privileges[\s\S]*grant\s+(?:all|execute)\s+on\s+functions\s+to\s+(?:public|anon|authenticated|service_role)/i,
  );
});

test("existing intentionally exposed function ACLs remain unchanged", () => {
  assert.doesNotMatch(executableSql, /\bon\s+function\b/i);
  assert.doesNotMatch(executableSql, /\b(?:grant|revoke)\b[\s\S]*\bon\s+function\b/i);
});

test("default privilege hardening has no destructive schema or function-body changes", () => {
  assert.doesNotMatch(
    executableSql,
    /\b(?:create|alter|drop)\s+(?:table|trigger|function)\b/i,
  );
  assert.doesNotMatch(
    executableSql,
    /\b(?:insert|update|delete|truncate)\b/i,
  );
  assert.doesNotMatch(executableSql, /\bcreate\s+or\s+replace\s+function\b/i);
});
