import type { AiEstimatorExtractionV0 } from "./extraction-types";

export const AI_ESTIMATOR_BENCHMARK_SOURCE_VERSION =
  "ai-estimator-benchmark-source-v0" as const;
export const AI_ESTIMATOR_BENCHMARK_TRUTH_VERSION =
  "ai-estimator-benchmark-truth-v0" as const;
export const AI_ESTIMATOR_BENCHMARK_REVIEW_VERSION =
  "ai-estimator-benchmark-review-v0" as const;

export type AiEstimatorBenchmarkSource = Readonly<{
  id: string;
  kind: "video" | "audio" | "photo" | "drawing" | "notes" | "message";
  capturedAt: string | null;
  sha256: string | null;
  localPath: string | null;
  permittedForModel: boolean;
}>;

export type AiEstimatorBenchmarkSourceManifest = Readonly<{
  schemaVersion: typeof AI_ESTIMATOR_BENCHMARK_SOURCE_VERSION;
  benchmarkId: string;
  projectLabel: string;
  frozenAt: string | null;
  consentConfirmed: boolean;
  sources: readonly AiEstimatorBenchmarkSource[];
  explicitlyExcludedReferences: readonly string[];
}>;

export type AiEstimatorBenchmarkTruthFact = Readonly<{
  semanticKey: string;
  kind: "measurement" | "scope" | "condition" | "material" | "exclusion" | "other";
  phase: "intake" | "later_change" | "as_built";
  value: string | boolean | null;
  unit: string | null;
  critical: boolean;
  evidenceSourceIds: readonly string[];
}>;

export type AiEstimatorBenchmarkTruthManifest = Readonly<{
  schemaVersion: typeof AI_ESTIMATOR_BENCHMARK_TRUTH_VERSION;
  benchmarkId: string;
  frozenAt: string | null;
  facts: readonly AiEstimatorBenchmarkTruthFact[];
  expectedUnknownSemanticKeys: readonly string[];
  expectedQuestionSemanticKeys: readonly string[];
  financialContext?: Readonly<{
    currency: string;
    originalContractValue: string | null;
    approvedAdditionalWorkValue: string | null;
    revisedContractValue: string | null;
    primaryMaterialsOwnerPurchasedSeparately: boolean | null;
    notes: readonly string[];
  }>;
}>;

export type AiEstimatorBenchmarkReviewEntry = Readonly<{
  outputId: string;
  action: "accept" | "modify" | "reject" | "merge" | "split";
}>;

export type AiEstimatorBenchmarkReviewLog = Readonly<{
  schemaVersion: typeof AI_ESTIMATOR_BENCHMARK_REVIEW_VERSION;
  benchmarkId: string;
  reviewerId: string;
  activeReviewSeconds: number;
  correctionSeconds: number;
  estimatedManualBaselineSeconds: number | null;
  canonicalMutationCount: number;
  customerProjectionLeakCount: number;
  entries: readonly AiEstimatorBenchmarkReviewEntry[];
}>;

export type AiEstimatorBenchmarkReadiness = Readonly<{
  readyForBlindRun: boolean;
  missing: readonly string[];
  sourceCount: number;
  permittedSourceCount: number;
}>;

type MeasurementScore = Readonly<{
  semanticKey: string;
  expectedValue: string;
  expectedUnit: string;
  candidateValue: string | null;
  candidateUnit: string | null;
  absoluteError: number | null;
  relativeError: number | null;
  result: "matched" | "missing" | "not_numeric" | "incompatible_unit";
}>;

export type AiEstimatorBenchmarkScore = Readonly<{
  benchmarkId: string;
  factMetrics: Readonly<{
    truePositiveCount: number;
    missCount: number;
    unsupportedCount: number;
    precision: number | null;
    recall: number | null;
    criticalMissSemanticKeys: readonly string[];
  }>;
  measurementMetrics: Readonly<{
    expectedCount: number;
    matchedCount: number;
    missingCount: number;
    incompatibleUnitCount: number;
    results: readonly MeasurementScore[];
  }>;
  unknownMetrics: Readonly<{
    expectedCount: number;
    detectedCount: number;
    missedSemanticKeys: readonly string[];
    unnecessarySemanticKeys: readonly string[];
  }>;
  questionMetrics: Readonly<{
    expectedCount: number;
    resolvedExpectedCount: number;
    unnecessaryCount: number;
  }>;
  reviewMetrics: Readonly<{
    acceptedCount: number;
    modifiedCount: number;
    rejectedCount: number;
    mergedCount: number;
    splitCount: number;
    activeReviewSeconds: number;
    correctionSeconds: number;
    estimatedManualBaselineSeconds: number | null;
    estimatedTimeSavedSeconds: number | null;
  }>;
  safetyGates: Readonly<{
    noMonetaryModelFields: true;
    noModelVerifiedFacts: true;
    allModelFactsHaveResolvableEvidence: true;
    noCanonicalMutations: boolean;
    noCustomerProjectionLeaks: boolean;
    passed: boolean;
  }>;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMANTIC_KEY = /^[A-Za-z0-9_.-]{1,200}$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not supported.`);
  }
  for (const key of keys) {
    if (!(key in value)) throw new TypeError(`${label}.${key} is required.`);
  }
}

function text(value: unknown, label: string, maximum = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new TypeError(`${label} must contain 1 through ${maximum} characters.`);
  }
  return value;
}

function nullableText(value: unknown, label: string, maximum = 500) {
  return value === null ? null : text(value, label, maximum);
}

function dateOrNull(value: unknown, label: string) {
  const parsed = nullableText(value, label, 100);
  if (parsed !== null && Number.isNaN(Date.parse(parsed))) {
    throw new TypeError(`${label} must be an ISO date-time or null.`);
  }
  return parsed;
}

function list<T>(value: unknown, label: string, maximum: number, parse: (entry: unknown, label: string) => T) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be an array with no more than ${maximum} entries.`);
  }
  return value.map((entry, index) => parse(entry, `${label}[${index}]`));
}

function nonnegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a nonnegative integer.`);
  }
  return value as number;
}

export function parseAiEstimatorBenchmarkSourceManifest(
  value: unknown,
): AiEstimatorBenchmarkSourceManifest {
  const root = object(value, "source");
  exact(root, [
    "schemaVersion", "benchmarkId", "projectLabel", "frozenAt",
    "consentConfirmed", "sources", "explicitlyExcludedReferences",
  ], "source");
  if (root.schemaVersion !== AI_ESTIMATOR_BENCHMARK_SOURCE_VERSION) {
    throw new TypeError("Unsupported source-manifest schema version.");
  }
  if (typeof root.consentConfirmed !== "boolean") {
    throw new TypeError("source.consentConfirmed must be a boolean.");
  }
  const sources = list(root.sources, "source.sources", 32, (entry, label) => {
    const parsed = object(entry, label);
    exact(parsed, [
      "id", "kind", "capturedAt", "sha256", "localPath", "permittedForModel",
    ], label);
    const id = text(parsed.id, `${label}.id`, 36);
    if (!UUID.test(id)) throw new TypeError(`${label}.id must be a UUID.`);
    const kinds = new Set(["video", "audio", "photo", "drawing", "notes", "message"]);
    if (typeof parsed.kind !== "string" || !kinds.has(parsed.kind)) {
      throw new TypeError(`${label}.kind is unsupported.`);
    }
    const sha256 = nullableText(parsed.sha256, `${label}.sha256`, 64);
    if (sha256 !== null && !SHA256.test(sha256)) {
      throw new TypeError(`${label}.sha256 must be a lowercase SHA-256 or null.`);
    }
    const localPath = nullableText(parsed.localPath, `${label}.localPath`, 2000);
    if (localPath !== null && !localPath.startsWith("/")) {
      throw new TypeError(`${label}.localPath must be an absolute local path or null.`);
    }
    if (typeof parsed.permittedForModel !== "boolean") {
      throw new TypeError(`${label}.permittedForModel must be a boolean.`);
    }
    return {
      id,
      kind: parsed.kind as AiEstimatorBenchmarkSource["kind"],
      capturedAt: dateOrNull(parsed.capturedAt, `${label}.capturedAt`),
      sha256,
      localPath,
      permittedForModel: parsed.permittedForModel,
    };
  });
  if (new Set(sources.map((entry) => entry.id)).size !== sources.length) {
    throw new TypeError("source.sources cannot contain duplicate IDs.");
  }
  return Object.freeze({
    schemaVersion: AI_ESTIMATOR_BENCHMARK_SOURCE_VERSION,
    benchmarkId: text(root.benchmarkId, "source.benchmarkId", 200),
    projectLabel: text(root.projectLabel, "source.projectLabel", 200),
    frozenAt: dateOrNull(root.frozenAt, "source.frozenAt"),
    consentConfirmed: root.consentConfirmed,
    sources: Object.freeze(sources),
    explicitlyExcludedReferences: Object.freeze(list(
      root.explicitlyExcludedReferences,
      "source.explicitlyExcludedReferences",
      100,
      (entry, label) => text(entry, label, 1000),
    )),
  });
}

export function parseAiEstimatorBenchmarkTruthManifest(
  value: unknown,
): AiEstimatorBenchmarkTruthManifest {
  const root = object(value, "truth");
  const required = [
    "schemaVersion", "benchmarkId", "frozenAt", "facts",
    "expectedUnknownSemanticKeys", "expectedQuestionSemanticKeys",
  ];
  exact(root, "financialContext" in root ? [...required, "financialContext"] : required, "truth");
  if (root.schemaVersion !== AI_ESTIMATOR_BENCHMARK_TRUTH_VERSION) {
    throw new TypeError("Unsupported truth-manifest schema version.");
  }
  const facts = list(root.facts, "truth.facts", 2000, (entry, label) => {
    const parsed = object(entry, label);
    exact(parsed, [
      "semanticKey", "kind", "phase", "value", "unit", "critical", "evidenceSourceIds",
    ], label);
    const semanticKey = text(parsed.semanticKey, `${label}.semanticKey`, 200);
    if (!SEMANTIC_KEY.test(semanticKey)) throw new TypeError(`${label}.semanticKey is invalid.`);
    const kinds = new Set(["measurement", "scope", "condition", "material", "exclusion", "other"]);
    if (typeof parsed.kind !== "string" || !kinds.has(parsed.kind)) {
      throw new TypeError(`${label}.kind is unsupported.`);
    }
    if (parsed.phase !== "intake" && parsed.phase !== "later_change" && parsed.phase !== "as_built") {
      throw new TypeError(`${label}.phase is unsupported.`);
    }
    if (parsed.value !== null && typeof parsed.value !== "string" && typeof parsed.value !== "boolean") {
      throw new TypeError(`${label}.value must be text, boolean, or null.`);
    }
    if (typeof parsed.critical !== "boolean") throw new TypeError(`${label}.critical must be a boolean.`);
    return {
      semanticKey,
      kind: parsed.kind as AiEstimatorBenchmarkTruthFact["kind"],
      phase: parsed.phase as AiEstimatorBenchmarkTruthFact["phase"],
      value: parsed.value as string | boolean | null,
      unit: nullableText(parsed.unit, `${label}.unit`, 100),
      critical: parsed.critical,
      evidenceSourceIds: Object.freeze(list(
        parsed.evidenceSourceIds,
        `${label}.evidenceSourceIds`,
        50,
        (source, sourceLabel) => text(source, sourceLabel, 500),
      )),
    };
  });
  if (new Set(facts.map((entry) => entry.semanticKey)).size !== facts.length) {
    throw new TypeError("truth.facts cannot contain duplicate semantic keys.");
  }
  const parseSemanticKeys = (entry: unknown, label: string) => Object.freeze(list(
    entry,
    label,
    500,
    (key, keyLabel) => {
      const parsed = text(key, keyLabel, 200);
      if (!SEMANTIC_KEY.test(parsed)) throw new TypeError(`${keyLabel} is invalid.`);
      return parsed;
    },
  ));
  let financialContext: AiEstimatorBenchmarkTruthManifest["financialContext"];
  if ("financialContext" in root) {
    const financial = object(root.financialContext, "truth.financialContext");
    exact(financial, [
      "currency", "originalContractValue", "approvedAdditionalWorkValue",
      "revisedContractValue", "primaryMaterialsOwnerPurchasedSeparately", "notes",
    ], "truth.financialContext");
    const money = (entry: unknown, label: string) => {
      const parsed = nullableText(entry, label, 40);
      if (parsed !== null && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(parsed)) {
        throw new TypeError(`${label} must be a nonnegative decimal string or null.`);
      }
      return parsed;
    };
    if (financial.primaryMaterialsOwnerPurchasedSeparately !== null
      && typeof financial.primaryMaterialsOwnerPurchasedSeparately !== "boolean") {
      throw new TypeError("truth.financialContext.primaryMaterialsOwnerPurchasedSeparately must be a boolean or null.");
    }
    financialContext = Object.freeze({
      currency: text(financial.currency, "truth.financialContext.currency", 10),
      originalContractValue: money(financial.originalContractValue, "truth.financialContext.originalContractValue"),
      approvedAdditionalWorkValue: money(financial.approvedAdditionalWorkValue, "truth.financialContext.approvedAdditionalWorkValue"),
      revisedContractValue: money(financial.revisedContractValue, "truth.financialContext.revisedContractValue"),
      primaryMaterialsOwnerPurchasedSeparately: financial.primaryMaterialsOwnerPurchasedSeparately,
      notes: Object.freeze(list(financial.notes, "truth.financialContext.notes", 100, (note, label) => text(note, label, 2000))),
    });
  }
  return Object.freeze({
    schemaVersion: AI_ESTIMATOR_BENCHMARK_TRUTH_VERSION,
    benchmarkId: text(root.benchmarkId, "truth.benchmarkId", 200),
    frozenAt: dateOrNull(root.frozenAt, "truth.frozenAt"),
    facts: Object.freeze(facts),
    expectedUnknownSemanticKeys: parseSemanticKeys(root.expectedUnknownSemanticKeys, "truth.expectedUnknownSemanticKeys"),
    expectedQuestionSemanticKeys: parseSemanticKeys(root.expectedQuestionSemanticKeys, "truth.expectedQuestionSemanticKeys"),
    financialContext,
  });
}

export function parseAiEstimatorBenchmarkReviewLog(
  value: unknown,
): AiEstimatorBenchmarkReviewLog {
  const root = object(value, "review");
  exact(root, [
    "schemaVersion", "benchmarkId", "reviewerId", "activeReviewSeconds",
    "correctionSeconds", "estimatedManualBaselineSeconds", "canonicalMutationCount",
    "customerProjectionLeakCount", "entries",
  ], "review");
  if (root.schemaVersion !== AI_ESTIMATOR_BENCHMARK_REVIEW_VERSION) {
    throw new TypeError("Unsupported review-log schema version.");
  }
  const entries = list(root.entries, "review.entries", 5000, (entry, label) => {
    const parsed = object(entry, label);
    exact(parsed, ["outputId", "action"], label);
    const actions = new Set(["accept", "modify", "reject", "merge", "split"]);
    if (typeof parsed.action !== "string" || !actions.has(parsed.action)) {
      throw new TypeError(`${label}.action is unsupported.`);
    }
    return {
      outputId: text(parsed.outputId, `${label}.outputId`, 200),
      action: parsed.action as AiEstimatorBenchmarkReviewEntry["action"],
    };
  });
  if (new Set(entries.map((entry) => entry.outputId)).size !== entries.length) {
    throw new TypeError("review.entries cannot review an output more than once.");
  }
  const baseline = root.estimatedManualBaselineSeconds === null
    ? null
    : nonnegativeInteger(root.estimatedManualBaselineSeconds, "review.estimatedManualBaselineSeconds");
  return Object.freeze({
    schemaVersion: AI_ESTIMATOR_BENCHMARK_REVIEW_VERSION,
    benchmarkId: text(root.benchmarkId, "review.benchmarkId", 200),
    reviewerId: text(root.reviewerId, "review.reviewerId", 200),
    activeReviewSeconds: nonnegativeInteger(root.activeReviewSeconds, "review.activeReviewSeconds"),
    correctionSeconds: nonnegativeInteger(root.correctionSeconds, "review.correctionSeconds"),
    estimatedManualBaselineSeconds: baseline,
    canonicalMutationCount: nonnegativeInteger(root.canonicalMutationCount, "review.canonicalMutationCount"),
    customerProjectionLeakCount: nonnegativeInteger(root.customerProjectionLeakCount, "review.customerProjectionLeakCount"),
    entries: Object.freeze(entries),
  });
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function evaluateAiEstimatorBenchmarkReadiness(
  source: AiEstimatorBenchmarkSourceManifest,
  truth: AiEstimatorBenchmarkTruthManifest,
): AiEstimatorBenchmarkReadiness {
  const missing: string[] = [];
  if (source.benchmarkId !== truth.benchmarkId) {
    missing.push("Source and truth manifests do not identify the same benchmark.");
  }
  if (!source.consentConfirmed) missing.push("Recording/media-processing consent is not confirmed.");
  if (!source.frozenAt) missing.push("The model-visible source manifest is not frozen.");
  if (!truth.frozenAt) missing.push("The hidden truth manifest is not frozen.");
  const permitted = source.sources.filter((entry) => entry.permittedForModel);
  if (permitted.length === 0) missing.push("No source is permitted for model processing.");
  for (const entry of permitted) {
    if (!entry.capturedAt) missing.push(`Source ${entry.id} has no capture date.`);
    if (!entry.localPath) missing.push(`Source ${entry.id} has no local file.`);
    if (!entry.sha256 || !SHA256.test(entry.sha256)) {
      missing.push(`Source ${entry.id} has no valid SHA-256 freeze hash.`);
    }
  }
  for (const fact of truth.facts.filter((entry) => entry.phase === "intake")) {
    if (fact.evidenceSourceIds.length === 0) {
      missing.push(`Truth fact ${fact.semanticKey} has no evidence source.`);
    }
  }
  return Object.freeze({
    readyForBlindRun: missing.length === 0,
    missing: Object.freeze(missing),
    sourceCount: source.sources.length,
    permittedSourceCount: permitted.length,
  });
}

const UNIT = new Map<string, { dimension: "length" | "area" | "count"; factor: number }>([
  ["ft", { dimension: "length", factor: 1 }],
  ["lf", { dimension: "length", factor: 1 }],
  ["in", { dimension: "length", factor: 1 / 12 }],
  ["sq_ft", { dimension: "area", factor: 1 }],
  ["sf", { dimension: "area", factor: 1 }],
  ["count", { dimension: "count", factor: 1 }],
  ["each", { dimension: "count", factor: 1 }],
]);

function measurementError(
  truth: AiEstimatorBenchmarkTruthFact,
  candidate: AiEstimatorExtractionV0["facts"][number] | undefined,
): MeasurementScore {
  const base = {
    semanticKey: truth.semanticKey,
    expectedValue: String(truth.value),
    expectedUnit: String(truth.unit),
    candidateValue: typeof candidate?.value === "string" ? candidate.value : null,
    candidateUnit: candidate?.unit ?? null,
  };
  if (!candidate) return { ...base, absoluteError: null, relativeError: null, result: "missing" };
  const expected = Number(truth.value);
  const actual = typeof candidate.value === "string" ? Number(candidate.value) : Number.NaN;
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return { ...base, absoluteError: null, relativeError: null, result: "not_numeric" };
  }
  const expectedUnit = UNIT.get(String(truth.unit).toLowerCase());
  const actualUnit = UNIT.get(String(candidate.unit).toLowerCase());
  if (!expectedUnit || !actualUnit || expectedUnit.dimension !== actualUnit.dimension) {
    return { ...base, absoluteError: null, relativeError: null, result: "incompatible_unit" };
  }
  const expectedNormalized = expected * expectedUnit.factor;
  const actualNormalized = actual * actualUnit.factor;
  const absoluteError = Math.abs(actualNormalized - expectedNormalized);
  return {
    ...base,
    absoluteError,
    relativeError: expectedNormalized === 0 ? null : absoluteError / Math.abs(expectedNormalized),
    result: "matched",
  };
}

export function scoreAiEstimatorBenchmark(
  source: AiEstimatorBenchmarkSourceManifest,
  truth: AiEstimatorBenchmarkTruthManifest,
  candidate: AiEstimatorExtractionV0,
  review: AiEstimatorBenchmarkReviewLog,
): AiEstimatorBenchmarkScore {
  const readiness = evaluateAiEstimatorBenchmarkReadiness(source, truth);
  if (!readiness.readyForBlindRun) {
    throw new TypeError(`Benchmark is not ready: ${readiness.missing.join(" ")}`);
  }
  if (truth.benchmarkId !== review.benchmarkId) {
    throw new TypeError("Review log does not identify the frozen benchmark.");
  }

  const scorableTruth = truth.facts.filter((entry) => entry.phase === "intake");
  const truthByKey = new Map(scorableTruth.map((entry) => [entry.semanticKey, entry]));
  const matchedTruthKeys = new Set<string>();
  const matchedCandidateByKey = new Map<string, AiEstimatorExtractionV0["facts"][number]>();
  const unsupported: AiEstimatorExtractionV0["facts"][number][] = [];
  const nonMeasurementValueMatches = (
    expected: AiEstimatorBenchmarkTruthFact["value"],
    actual: AiEstimatorExtractionV0["facts"][number]["value"],
  ) => typeof expected === "string" && typeof actual === "string"
    ? expected.trim().toLowerCase() === actual.trim().toLowerCase()
    : expected === actual;
  for (const fact of candidate.facts) {
    const expected = truthByKey.get(fact.semanticKey);
    const matches = expected
      && expected.kind === fact.kind
      && (expected.kind === "measurement" || nonMeasurementValueMatches(expected.value, fact.value));
    if (!matches || matchedTruthKeys.has(fact.semanticKey)) {
      unsupported.push(fact);
      continue;
    }
    matchedTruthKeys.add(fact.semanticKey);
    matchedCandidateByKey.set(fact.semanticKey, fact);
  }
  const truePositiveCount = matchedTruthKeys.size;
  const misses = scorableTruth.filter((entry) => !matchedTruthKeys.has(entry.semanticKey));

  const truthMeasurements = scorableTruth.filter((entry) => entry.kind === "measurement");
  const measurements = truthMeasurements.map((entry) =>
    measurementError(entry, matchedCandidateByKey.get(entry.semanticKey)),
  );

  const expectedUnknowns = new Set(truth.expectedUnknownSemanticKeys);
  const candidateUnknowns = new Set(candidate.unknowns.map((entry) => entry.semanticKey));
  const missedUnknowns = [...expectedUnknowns].filter((key) => !candidateUnknowns.has(key));
  const unnecessaryUnknowns = [...candidateUnknowns].filter((key) => !expectedUnknowns.has(key));
  const unknownById = new Map(candidate.unknowns.map((entry) => [entry.id, entry.semanticKey]));
  const questionedKeys = new Set(candidate.clarifyingQuestions.flatMap((question) =>
    question.resolvesUnknownIds.map((id) => unknownById.get(id)).filter((key): key is string => Boolean(key)),
  ));
  const expectedQuestions = new Set(truth.expectedQuestionSemanticKeys);

  const knownOutputIds = new Set([
    ...candidate.facts.map((entry) => entry.id),
    ...candidate.sections.map((entry) => entry.id),
    ...candidate.sections.flatMap((section) => section.items.map((entry) => entry.id)),
    ...candidate.unknowns.map((entry) => entry.id),
    ...candidate.clarifyingQuestions.map((entry) => entry.id),
  ]);
  for (const entry of review.entries) {
    if (!knownOutputIds.has(entry.outputId)) {
      throw new TypeError(`Review entry references unknown candidate output ${entry.outputId}.`);
    }
  }
  const reviewedIds = new Set(review.entries.map((entry) => entry.outputId));
  const requiredReviewIds = [
    ...candidate.facts.map((entry) => entry.id),
    ...candidate.sections.flatMap((section) => section.items.map((entry) => entry.id)),
  ];
  const unreviewed = requiredReviewIds.filter((id) => !reviewedIds.has(id));
  if (unreviewed.length > 0) {
    throw new TypeError(`Review log is incomplete for candidate outputs: ${unreviewed.join(", ")}.`);
  }

  const reviewCounts = { accept: 0, modify: 0, reject: 0, merge: 0, split: 0 };
  for (const entry of review.entries) reviewCounts[entry.action] += 1;
  const estimatedTimeSavedSeconds = review.estimatedManualBaselineSeconds === null
    ? null
    : review.estimatedManualBaselineSeconds - review.activeReviewSeconds;
  const noCanonicalMutations = review.canonicalMutationCount === 0;
  const noCustomerProjectionLeaks = review.customerProjectionLeakCount === 0;

  return Object.freeze({
    benchmarkId: truth.benchmarkId,
    factMetrics: Object.freeze({
      truePositiveCount,
      missCount: misses.length,
      unsupportedCount: unsupported.length,
      precision: ratio(truePositiveCount, truePositiveCount + unsupported.length),
      recall: ratio(truePositiveCount, scorableTruth.length),
      criticalMissSemanticKeys: Object.freeze(
        misses.filter((entry) => entry.critical).map((entry) => entry.semanticKey),
      ),
    }),
    measurementMetrics: Object.freeze({
      expectedCount: measurements.length,
      matchedCount: measurements.filter((entry) => entry.result === "matched").length,
      missingCount: measurements.filter((entry) => entry.result === "missing").length,
      incompatibleUnitCount: measurements.filter((entry) => entry.result === "incompatible_unit").length,
      results: Object.freeze(measurements),
    }),
    unknownMetrics: Object.freeze({
      expectedCount: expectedUnknowns.size,
      detectedCount: [...expectedUnknowns].filter((key) => candidateUnknowns.has(key)).length,
      missedSemanticKeys: Object.freeze(missedUnknowns),
      unnecessarySemanticKeys: Object.freeze(unnecessaryUnknowns),
    }),
    questionMetrics: Object.freeze({
      expectedCount: expectedQuestions.size,
      resolvedExpectedCount: [...expectedQuestions].filter((key) => questionedKeys.has(key)).length,
      unnecessaryCount: [...questionedKeys].filter((key) => !expectedQuestions.has(key)).length,
    }),
    reviewMetrics: Object.freeze({
      acceptedCount: reviewCounts.accept,
      modifiedCount: reviewCounts.modify,
      rejectedCount: reviewCounts.reject,
      mergedCount: reviewCounts.merge,
      splitCount: reviewCounts.split,
      activeReviewSeconds: review.activeReviewSeconds,
      correctionSeconds: review.correctionSeconds,
      estimatedManualBaselineSeconds: review.estimatedManualBaselineSeconds,
      estimatedTimeSavedSeconds,
    }),
    safetyGates: Object.freeze({
      noMonetaryModelFields: true,
      noModelVerifiedFacts: true,
      allModelFactsHaveResolvableEvidence: true,
      noCanonicalMutations,
      noCustomerProjectionLeaks,
      passed: noCanonicalMutations && noCustomerProjectionLeaks,
    }),
  });
}
