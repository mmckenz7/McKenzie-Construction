import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_FILENAME = /^(\d{14})_([a-z0-9][a-z0-9_]*)\.sql$/;

export function inspectMigrationLedger(directory) {
  const absoluteDirectory = resolve(directory);
  const fileNames = readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const malformedFiles = [];
  const emptyFiles = [];
  const versions = new Map();

  for (const fileName of fileNames) {
    const match = MIGRATION_FILENAME.exec(fileName);
    if (!match) {
      malformedFiles.push(fileName);
      continue;
    }

    const [, version] = match;
    const matchingFiles = versions.get(version) ?? [];
    matchingFiles.push(fileName);
    versions.set(version, matchingFiles);

    if (readFileSync(resolve(absoluteDirectory, fileName), "utf8").trim() === "") {
      emptyFiles.push(fileName);
    }
  }

  const duplicateVersions = [...versions.entries()]
    .filter(([, matchingFiles]) => matchingFiles.length > 1)
    .map(([version, matchingFiles]) => ({ version, files: matchingFiles }))
    .sort((left, right) => left.version.localeCompare(right.version));

  return Object.freeze({
    directory: absoluteDirectory,
    migrationCount: fileNames.length,
    versionCount: versions.size,
    malformedFiles: Object.freeze(malformedFiles),
    emptyFiles: Object.freeze(emptyFiles),
    duplicateVersions: Object.freeze(
      duplicateVersions.map((entry) =>
        Object.freeze({
          version: entry.version,
          files: Object.freeze(entry.files),
        }),
      ),
    ),
  });
}

export function migrationLedgerIsValid(result) {
  return (
    result.malformedFiles.length === 0 &&
    result.emptyFiles.length === 0 &&
    result.duplicateVersions.length === 0
  );
}

export function formatMigrationLedgerReport(result) {
  const lines = [
    `Migration files: ${result.migrationCount}`,
    `Unique versions: ${result.versionCount}`,
  ];

  for (const fileName of result.malformedFiles) {
    lines.push(`Malformed filename: ${fileName}`);
  }
  for (const fileName of result.emptyFiles) {
    lines.push(`Empty migration: ${fileName}`);
  }
  for (const duplicate of result.duplicateVersions) {
    lines.push(
      `Duplicate version ${duplicate.version}: ${duplicate.files.join(", ")}`,
    );
  }

  lines.push(
    migrationLedgerIsValid(result)
      ? "Migration ledger: valid"
      : "Migration ledger: invalid",
  );
  return lines.join("\n");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2] ?? "supabase/migrations";
  const result = inspectMigrationLedger(directory);
  console.log(formatMigrationLedgerReport(result));
  process.exitCode = migrationLedgerIsValid(result) ? 0 : 1;
}
