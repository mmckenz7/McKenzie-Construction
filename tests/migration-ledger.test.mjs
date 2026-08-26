import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatMigrationLedgerReport,
  inspectMigrationLedger,
  migrationLedgerIsValid,
} from "../scripts/check-migration-ledger.mjs";

function makeLedger(files) {
  const directory = mkdtempSync(join(tmpdir(), "mckenzie-migration-ledger-"));
  for (const [fileName, content] of Object.entries(files)) {
    writeFileSync(join(directory, fileName), content);
  }
  return directory;
}

test("accepts the canonical repository migration ledger", () => {
  const result = inspectMigrationLedger("supabase/migrations");

  assert.ok(result.migrationCount > 0);
  assert.equal(result.versionCount, result.migrationCount);
  assert.equal(migrationLedgerIsValid(result), true);
  assert.equal(
    formatMigrationLedgerReport(result).includes("Migration ledger: valid"),
    true,
  );
});

test("rejects duplicate migration versions and reports only filenames", () => {
  const directory = makeLedger({
    "20260827090000_first_change.sql": "select 1;\n",
    "20260827090000_second_change.sql": "select 2;\n",
  });

  const result = inspectMigrationLedger(directory);

  assert.equal(migrationLedgerIsValid(result), false);
  assert.deepEqual(result.duplicateVersions, [
    {
      version: "20260827090000",
      files: [
        "20260827090000_first_change.sql",
        "20260827090000_second_change.sql",
      ],
    },
  ]);
  assert.equal(formatMigrationLedgerReport(result).includes("select 1"), false);
});

test("rejects malformed and empty migration files", () => {
  const directory = makeLedger({
    "20260827090100_valid_change.sql": "   \n",
    "not-a-version.sql": "select 1;\n",
  });

  const result = inspectMigrationLedger(directory);

  assert.equal(migrationLedgerIsValid(result), false);
  assert.deepEqual(result.emptyFiles, ["20260827090100_valid_change.sql"]);
  assert.deepEqual(result.malformedFiles, ["not-a-version.sql"]);
});
