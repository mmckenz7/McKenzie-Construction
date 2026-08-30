import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import {
  evaluateAiEstimatorBenchmarkReadiness,
  parseAiEstimatorBenchmarkReviewLog,
  parseAiEstimatorBenchmarkSourceManifest,
  parseAiEstimatorBenchmarkTruthManifest,
  scoreAiEstimatorBenchmark,
} from "../src/lib/ai-estimator/benchmark-core.ts";
import { parseAiEstimatorExtractionV0 } from "../src/lib/ai-estimator/extraction-validator.ts";

function usage() {
  return [
    "Usage:",
    "  npm run benchmark:ai-estimator -- <source.json> <truth.json> [report.json]",
    "  npm run benchmark:ai-estimator -- <source.json> <truth.json> <candidate.json> <review.json> [report.json]",
  ].join("\n");
}

async function loadJson(path) {
  const bytes = await readFile(path);
  return {
    value: JSON.parse(bytes.toString("utf8")),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function verifyPermittedSourceFiles(source) {
  const missing = [];
  for (const entry of source.sources.filter((candidate) => candidate.permittedForModel)) {
    if (!entry.localPath || !entry.sha256) continue;
    try {
      const bytes = await readFile(entry.localPath);
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== entry.sha256) missing.push(`Source ${entry.id} does not match its frozen SHA-256.`);
    } catch {
      missing.push(`Source ${entry.id} cannot be read at its frozen local path.`);
    }
  }
  return missing;
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 5) {
  throw new TypeError(usage());
}

const [sourcePath, truthPath] = args;
const candidatePath = args.length >= 4 ? args[2] : undefined;
const reviewPath = args.length >= 4 ? args[3] : undefined;
const reportPath = args.length === 3 ? args[2] : args[4];
const [sourceFile, truthFile] = await Promise.all([
  loadJson(sourcePath),
  loadJson(truthPath),
]);
const source = parseAiEstimatorBenchmarkSourceManifest(sourceFile.value);
const truth = parseAiEstimatorBenchmarkTruthManifest(truthFile.value);
if (source.benchmarkId !== truth.benchmarkId) {
  throw new TypeError("Source and truth manifests identify different benchmarks.");
}

const contractReadiness = evaluateAiEstimatorBenchmarkReadiness(source, truth);
const fileIssues = await verifyPermittedSourceFiles(source);
const readiness = {
  ...contractReadiness,
  readyForBlindRun: contractReadiness.readyForBlindRun && fileIssues.length === 0,
  missing: [...contractReadiness.missing, ...fileIssues],
};
const report = {
  reportVersion: "ai-estimator-benchmark-report-v0",
  benchmarkId: source.benchmarkId,
  generatedAt: new Date().toISOString(),
  sourceManifestSha256: sourceFile.sha256,
  truthManifestSha256: truthFile.sha256,
  readiness,
  score: null,
};

if (candidatePath && reviewPath) {
  if (!readiness.readyForBlindRun) {
    throw new TypeError(`Benchmark is not ready: ${readiness.missing.join(" ")}`);
  }
  const [candidateFile, reviewFile] = await Promise.all([
    loadJson(candidatePath),
    loadJson(reviewPath),
  ]);
  const review = parseAiEstimatorBenchmarkReviewLog(reviewFile.value);
  const candidate = parseAiEstimatorExtractionV0(candidateFile.value, {
    allowedAssetIds: source.sources
      .filter((entry) => entry.permittedForModel)
      .map((entry) => entry.id),
    transcriptSegments: [],
  });
  report.candidateExtractionSha256 = candidateFile.sha256;
  report.reviewLogSha256 = reviewFile.sha256;
  report.score = scoreAiEstimatorBenchmark(
    source,
    truth,
    candidate,
    review,
  );
}

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, rendered, { flag: "wx" });
process.stdout.write(rendered);
