import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const neutralSources = [
  "index.ts",
  "map-presentation.ts",
  "ground-registration.ts",
  "google-map-renderer.ts",
  "local-reference-interchange.ts",
  "live-location.ts",
];

for (const file of neutralSources) {
  const source = await readFile(resolve(packageRoot, "src", file), "utf8");
  if (/\b(?:fence|deck|takeoff|pricing)\b/i.test(source)) throw new Error(`${file} contains trade-domain vocabulary.`);
  if (/process\.env|from\s+["'](?!\.)|require\s*\(/.test(source)) throw new Error(`${file} crosses the provider-neutral package boundary.`);
}

const googleRenderer = await readFile(resolve(packageRoot, "src", "google-map-renderer.ts"), "utf8");
if ((googleRenderer.match(/https:\/\/maps\.googleapis\.com\/maps\/api\/js/g) ?? []).length !== 1) {
  throw new Error("google-map-renderer.ts must contain exactly one approved Maps JavaScript loader endpoint.");
}
for (const file of neutralSources.filter((name) => name !== "google-map-renderer.ts")) {
  const source = await readFile(resolve(packageRoot, "src", file), "utf8");
  if (/maps\.googleapis\.com|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon\s*\(/.test(source)) {
    throw new Error(`${file} contains network capability outside the isolated Google adapter.`);
  }
}

console.log(`site-map-core boundary check passed (${neutralSources.length} neutral sources)`);
