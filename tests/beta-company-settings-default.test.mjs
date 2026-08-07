import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260806025000_beta_company_settings_default.sql",
    import.meta.url,
  ),
  "utf8",
);

test("beta environments receive exactly one idempotent company settings row", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /insert into public\.company_settings/);
  assert.match(migration, /where not exists \([\s\S]*from public\.company_settings/);
  assert.match(migration, /settings_count <> 1/);
  assert.match(migration, /Exactly one company_settings row is required/);
  assert.match(migration, /commit;/);
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop)\b/i);
});
