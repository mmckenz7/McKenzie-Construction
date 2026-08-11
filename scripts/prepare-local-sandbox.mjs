import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDirectory = join(repositoryRoot, "supabase");
const sandboxRoot = join(repositoryRoot, ".local-sandbox");
const sandboxDirectory = join(sandboxRoot, "supabase");
const sandboxMigrations = join(sandboxDirectory, "migrations");
const baselineName = "20260801095000_current_public_schema_through_090000.sql";

if (!sandboxRoot.startsWith(`${repositoryRoot}/.local-sandbox`)) {
  throw new Error("Refusing to prepare a sandbox outside the repository's disposable local directory.");
}

await rm(sandboxRoot, { recursive: true, force: true });
await mkdir(sandboxMigrations, { recursive: true });

const config = await readFile(join(sourceDirectory, "config.toml"), "utf8");
await writeFile(
  join(sandboxDirectory, "config.toml"),
  config.replace(/^project_id = .*$/m, 'project_id = "mckenzie-construction-local-sandbox"'),
);
await cp(join(sourceDirectory, "seed.sql"), join(sandboxDirectory, "seed.sql"));

const migrations = (await readdir(join(sourceDirectory, "migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
if (!migrations.includes(baselineName)) throw new Error(`Missing local bootstrap baseline: ${baselineName}`);

await cp(
  join(sourceDirectory, "migrations", baselineName),
  join(sandboxMigrations, "20260801000000_local_schema_baseline.sql"),
);
for (const name of migrations.filter((candidate) => candidate > baselineName)) {
  await cp(join(sourceDirectory, "migrations", name), join(sandboxMigrations, name));
}

const laterCount = migrations.filter((name) => name > baselineName).length;
console.log(`Prepared isolated migration workspace with 1 baseline and ${laterCount} later migrations.`);
