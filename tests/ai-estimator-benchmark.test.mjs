import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAiEstimatorBenchmarkReadiness,
  parseAiEstimatorBenchmarkSourceManifest,
  parseAiEstimatorBenchmarkTruthManifest,
  scoreAiEstimatorBenchmark,
} from "../src/lib/ai-estimator/benchmark-core.ts";
import { parseAiEstimatorExtractionV0 } from "../src/lib/ai-estimator/extraction-validator.ts";

const drawingId = "11111111-1111-4111-8111-111111111111";

function source(overrides = {}) {
  return {
    schemaVersion: "ai-estimator-benchmark-source-v0",
    benchmarkId: "benchmark-contract-test",
    projectLabel: "Redacted contract test",
    frozenAt: "2026-08-27T12:00:00.000Z",
    consentConfirmed: true,
    sources: [{
      id: drawingId,
      kind: "drawing",
      capturedAt: "2026-01-01T12:00:00.000Z",
      sha256: "a".repeat(64),
      localPath: "/private/benchmark/source.pdf",
      permittedForModel: true,
    }],
    explicitlyExcludedReferences: ["known-unrelated-supplier-quote"],
    ...overrides,
  };
}

function truth() {
  return {
    schemaVersion: "ai-estimator-benchmark-truth-v0",
    benchmarkId: "benchmark-contract-test",
    frozenAt: "2026-08-27T12:05:00.000Z",
    facts: [{
      semanticKey: "deck.area",
      kind: "measurement",
      phase: "intake",
      value: "120",
      unit: "sq_ft",
      critical: true,
      evidenceSourceIds: [drawingId],
    }, {
      semanticKey: "deck.railing.length",
      kind: "measurement",
      phase: "intake",
      value: "12",
      unit: "ft",
      critical: true,
      evidenceSourceIds: [drawingId],
    }, {
      semanticKey: "deck.finish.color",
      kind: "material",
      phase: "later_change",
      value: "not model visible",
      unit: null,
      critical: false,
      evidenceSourceIds: [drawingId],
    }, {
      semanticKey: "deck.as_built.railing_visible",
      kind: "condition",
      phase: "as_built",
      value: true,
      unit: null,
      critical: false,
      evidenceSourceIds: ["hidden-as-built-photo"],
    }],
    expectedUnknownSemanticKeys: ["deck.fastener.selection"],
    expectedQuestionSemanticKeys: ["deck.fastener.selection"],
  };
}

function evidence() {
  return {
    assetId: drawingId,
    transcriptSegmentId: null,
    startMs: null,
    endMs: null,
    pageNumber: 1,
    boundingBox: null,
    externalMeasurementId: null,
    excerpt: "dimension callout",
  };
}

function fact(id, semanticKey, value, unit, dimension = "length") {
  return {
    id,
    kind: "measurement",
    semanticKey,
    label: semanticKey,
    value,
    unit,
    dimension,
    sourceType: "drawing",
    verificationState: "high_confidence",
    confidence: "0.90",
    evidence: [evidence()],
    contradictionGroupId: null,
    derivation: null,
  };
}

function candidate() {
  return parseAiEstimatorExtractionV0({
    schemaVersion: "ai-estimator-extraction-v0",
    sourceAssetIds: [drawingId],
    summary: {
      projectTypeCandidate: "deck",
      plainLanguageScope: "Deck work shown on the drawing.",
      overallConfidence: "high_confidence",
    },
    facts: [
      fact("fact_area", "deck.area", "118", "sf", "area"),
      fact("fact_rail", "deck.railing.length", "144", "in"),
      fact("fact_extra", "deck.unsupported.width", "9", "ft"),
    ],
    sections: [],
    unknowns: [{
      id: "unknown_fastener",
      semanticKey: "deck.fastener.selection",
      description: "Fastener selection is not shown.",
      blocksQuantity: false,
      blocksPricing: true,
      evidence: [],
    }],
    clarifyingQuestions: [{
      id: "question_fastener",
      question: "Which fastener is approved?",
      reason: "The source does not identify it.",
      resolvesUnknownIds: ["unknown_fastener"],
      priority: "important",
    }],
    warnings: [],
  }, { allowedAssetIds: [drawingId], transcriptSegments: [] });
}

function review() {
  return {
    schemaVersion: "ai-estimator-benchmark-review-v0",
    benchmarkId: "benchmark-contract-test",
    reviewerId: "reviewer-redacted",
    activeReviewSeconds: 420,
    correctionSeconds: 180,
    estimatedManualBaselineSeconds: 900,
    canonicalMutationCount: 0,
    customerProjectionLeakCount: 0,
    entries: [
      { outputId: "fact_area", action: "modify" },
      { outputId: "fact_rail", action: "accept" },
      { outputId: "fact_extra", action: "reject" },
    ],
  };
}

test("readiness fails closed when a permitted source is only referenced", () => {
  const result = evaluateAiEstimatorBenchmarkReadiness(
    source({ sources: [{ ...source().sources[0], localPath: null, sha256: null }] }),
    truth(),
  );
  assert.equal(result.readyForBlindRun, false);
  assert.match(result.missing.join(" "), /no local file/);
  assert.match(result.missing.join(" "), /no valid SHA-256/);
});

test("benchmark manifests are closed and preserve hidden finances outside model output", () => {
  assert.throws(
    () => parseAiEstimatorBenchmarkSourceManifest({ ...source(), supplierQuote: "not allowed" }),
    /supplierQuote is not supported/,
  );
  const parsed = parseAiEstimatorBenchmarkTruthManifest({
    ...truth(),
    financialContext: {
      currency: "USD",
      originalContractValue: "100.00",
      approvedAdditionalWorkValue: null,
      revisedContractValue: "100.00",
      primaryMaterialsOwnerPurchasedSeparately: true,
      notes: ["Hidden from model input and report output."],
    },
  });
  assert.equal(parsed.financialContext.originalContractValue, "100.00");
});

test("exact scoring separates misses, unsupported facts, and measurement error", () => {
  const score = scoreAiEstimatorBenchmark(source(), truth(), candidate(), review());
  assert.deepEqual(score.factMetrics, {
    truePositiveCount: 2,
    missCount: 0,
    unsupportedCount: 1,
    precision: 2 / 3,
    recall: 1,
    criticalMissSemanticKeys: [],
  });
  assert.equal(score.measurementMetrics.results[0].absoluteError, 2);
  assert.equal(score.measurementMetrics.results[1].absoluteError, 0);
  assert.equal(score.unknownMetrics.detectedCount, 1);
  assert.equal(score.questionMetrics.resolvedExpectedCount, 1);
  assert.equal(score.reviewMetrics.estimatedTimeSavedSeconds, 480);
  assert.equal(score.safetyGates.passed, true);
});

test("later-change and as-built truth are not scored as intake misses", () => {
  const score = scoreAiEstimatorBenchmark(source(), truth(), candidate(), review());
  assert.equal(score.factMetrics.missCount, 0);
  assert.doesNotMatch(score.factMetrics.criticalMissSemanticKeys.join(" "), /finish/);
});

test("safety gates fail when review observes canonical mutation or projection leakage", () => {
  const score = scoreAiEstimatorBenchmark(source(), truth(), candidate(), {
    ...review(),
    canonicalMutationCount: 1,
    customerProjectionLeakCount: 1,
  });
  assert.equal(score.safetyGates.noCanonicalMutations, false);
  assert.equal(score.safetyGates.noCustomerProjectionLeaks, false);
  assert.equal(score.safetyGates.passed, false);
});

test("benchmark core has no canonical estimate or provider dependencies", async () => {
  const sourceText = await import("node:fs/promises").then(({ readFile }) =>
    readFile("src/lib/ai-estimator/benchmark-core.ts", "utf8"));
  assert.doesNotMatch(sourceText, /estimate-calculations|estimate-mutations|estimate-persistence/);
  assert.doesNotMatch(sourceText, /provider-registry|extraction-service|supabase/);
});
