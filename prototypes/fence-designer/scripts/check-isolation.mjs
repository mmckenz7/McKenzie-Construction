import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "src");
const files = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name)) files.push(path);
  }
};
walk(source);

const forbidden = [
  /from\s+["']\.\.\//,
  /(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
  /process\.env|import\.meta\.env/,
  /supabase/i,
];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.test(text)) throw new Error(`${relative(root, file)} violates prototype isolation: ${rule}`);
  }
  if (/maps\.googleapis\.com/.test(text) && !file.endsWith("google-map-renderer.ts")) throw new Error(`${relative(root, file)} contains provider network access outside the isolated renderer adapter.`);
}
const renderer = readFileSync(join(source, "google-map-renderer.ts"), "utf8");
if ((renderer.match(/https:\/\/maps\.googleapis\.com\/maps\/api\/js/g) ?? []).length !== 1) throw new Error("The Google renderer must contain exactly one approved Maps JavaScript loader endpoint.");
for (const name of ["map-presentation.ts", "ground-registration.ts", "google-map-renderer.ts", "local-reference-interchange.ts", "live-location.ts"]) {
  const text = readFileSync(join(source, name), "utf8");
  if (/FenceMap|FenceDesign|FenceDraft|takeoff|from\s+["']\.\/model["']/i.test(text)) throw new Error(`${name} crosses the provider-neutral read-only map boundary.`);
}
console.log(`Fence Designer isolation check passed (${files.length} source files).`);
