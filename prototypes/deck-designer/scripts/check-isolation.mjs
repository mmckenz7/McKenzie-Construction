import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = resolve(prototypeRoot, "src");
const allowedBareImports = new Set([
  "@mckenzie/site-map-core",
  "react",
  "react-dom/client",
  "three",
  "three/examples/jsm/controls/OrbitControls.js",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const failures = [];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

for (const path of await sourceFiles(sourceRoot)) {
  const source = await readFile(path, "utf8");
  const importPattern = /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(path), specifier);
      if (target !== prototypeRoot && !target.startsWith(`${prototypeRoot}/`)) {
        failures.push(`${path}: relative import escapes the prototype boundary (${specifier})`);
      }
    } else if (!allowedBareImports.has(specifier)) {
      failures.push(`${path}: bare import is not on the prototype allowlist (${specifier})`);
    }
  }

  const forbiddenRuntimePatterns = [
    [/\bfetch\s*\(/, "fetch"],
    [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
    [/\bWebSocket\b/, "WebSocket"],
    [/\bEventSource\b/, "EventSource"],
    [/\bsendBeacon\s*\(/, "sendBeacon"],
    [/\bprocess\.env\b/, "environment access"],
  ];
  for (const [pattern, label] of forbiddenRuntimePatterns) {
    if (pattern.test(source)) failures.push(`${path}: forbidden browser-only prototype capability (${label})`);
  }
}

if (failures.length > 0) {
  throw new Error(`Prototype isolation check failed:\n${failures.join("\n")}`);
}

console.log("Prototype isolation check passed: source imports stay local and no network/environment capability was found.");
