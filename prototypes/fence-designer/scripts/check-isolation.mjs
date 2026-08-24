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
}
console.log(`Fence Designer isolation check passed (${files.length} source files).`);
