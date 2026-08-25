import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const indexHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const initialMatch = indexHtml.match(/<script[^>]+src="\.\/assets\/([^"]+\.js)"/);

if (!initialMatch) {
  throw new Error("Could not identify the initial JavaScript entry in dist/index.html.");
}

const javascriptFiles = (await readdir(assetsDirectory)).filter((name) => name.endsWith(".js"));
const chunks = await Promise.all(
  javascriptFiles.map(async (name) => {
    const bytes = await readFile(new URL(name, assetsDirectory));
    return { name, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }),
);

const initial = chunks.find((chunk) => chunk.name === initialMatch[1]);
if (!initial) throw new Error(`Initial entry ${initialMatch[1]} was not found in dist/assets.`);

const largest = chunks.reduce((current, chunk) => chunk.gzipBytes > current.gzipBytes ? chunk : current);
const totalGzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
const kibibytes = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const report = {
  initialEntryGzipKiB: kibibytes(initial.gzipBytes),
  largestChunk: largest.name,
  largestChunkGzipKiB: kibibytes(largest.gzipBytes),
  totalJavaScriptGzipKiB: kibibytes(totalGzipBytes),
};

console.log("Bundle budget report", JSON.stringify(report, null, 2));

const failures = [];
// The v5-only entry leaves the dormant legacy authoring screen available in source
// without shipping it to the active browser. Preserve the measured headroom.
if (initial.gzipBytes > 90 * 1024) failures.push(`initial entry is ${report.initialEntryGzipKiB} KiB (budget 90 KiB)`);
if (largest.gzipBytes > 130 * 1024) failures.push(`largest chunk is ${report.largestChunkGzipKiB} KiB (budget 130 KiB)`);
if (totalGzipBytes > 245 * 1024) failures.push(`total JavaScript is ${report.totalJavaScriptGzipKiB} KiB (budget 245 KiB)`);

if (failures.length > 0) {
  throw new Error(`Bundle budget exceeded: ${failures.join("; ")}`);
}
