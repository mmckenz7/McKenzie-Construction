import type {
  AiEstimatorBoundingBox,
  AiEstimatorClarifyingQuestion,
  AiEstimatorDerivation,
  AiEstimatorDimension,
  AiEstimatorDraftItem,
  AiEstimatorDraftSection,
  AiEstimatorEvidence,
  AiEstimatorExtractionV0,
  AiEstimatorExtractionValidationContext,
  AiEstimatorFact,
  AiEstimatorModelVerificationState,
  AiEstimatorQuantityCandidate,
  AiEstimatorSourceType,
  AiEstimatorTranscriptSegmentReference,
  AiEstimatorUnknown,
  AiEstimatorWarning,
} from "./extraction-types";

const AI_ESTIMATOR_EXTRACTION_SCHEMA_VERSION =
  "ai-estimator-extraction-v0" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SEMANTIC_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,200}$/;
const WARNING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,99}$/;
const CONFIDENCE_PATTERN = /^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/;
const SIGNED_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

const MODEL_VERIFICATION_STATES = new Set<AiEstimatorModelVerificationState>([
  "high_confidence",
  "estimated",
  "unverified",
]);
const SOURCE_TYPES = new Set<AiEstimatorSourceType>([
  "manual",
  "spoken",
  "drawing",
  "LiDAR",
  "Matterport",
  "visual_estimate",
  "derived",
]);
const DIMENSIONS = new Set<AiEstimatorDimension>([
  "count",
  "length",
  "area",
  "volume",
  "weight",
  "angle",
  "duration",
  "rate",
  "other",
]);

const FACT_KINDS = new Set<AiEstimatorFact["kind"]>([
  "measurement",
  "scope",
  "condition",
  "material",
  "exclusion",
  "assumption",
  "other",
]);
const ITEM_TYPES = new Set<AiEstimatorDraftItem["itemTypeCandidate"]>([
  "standard",
  "allowance",
]);
const ITEM_CATEGORIES = new Set<AiEstimatorDraftItem["categoryCandidate"]>([
  "material",
  "labor",
  "subcontractor",
  "equipment",
  "permit",
  "dumpster",
  "delivery",
  "allowance",
  "other",
]);
const QUESTION_PRIORITIES = new Set<AiEstimatorClarifyingQuestion["priority"]>([
  "blocking",
  "important",
  "optional",
]);

export const AI_ESTIMATOR_PROHIBITED_MODEL_KEYS = Object.freeze([
  "cost",
  "unit_cost",
  "price",
  "unit_price",
  "supplier_price",
  "labor_rate",
  "markup",
  "margin",
  "overhead",
  "tax",
  "discount",
  "customer_total",
  "contract_value",
  "structural_approval",
  "code_compliance",
  "engineering_determination",
] as const);

const PROHIBITED_NORMALIZED_KEYS = new Set(
  AI_ESTIMATOR_PROHIBITED_MODEL_KEYS.map(normalizeKey),
);

export class AiEstimatorExtractionValidationError extends TypeError {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "AiEstimatorExtractionValidationError";
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new AiEstimatorExtractionValidationError(path, message);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, path: string) {
  if (!isRecord(value)) fail(path, "must be an object.");
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
) {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${path}.${key}`, "is not supported.");
  }
  for (const key of allowed) {
    if (!(key in value)) fail(`${path}.${key}`, "is required.");
  }
}

function boundedString(
  value: unknown,
  path: string,
  maximum: number,
  options: { nullable: true; allowEmpty?: boolean },
): string | null;
function boundedString(
  value: unknown,
  path: string,
  maximum: number,
  options?: { nullable?: false; allowEmpty?: boolean },
): string;
function boundedString(
  value: unknown,
  path: string,
  maximum: number,
  options: { nullable?: boolean; allowEmpty?: boolean } = {},
) {
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") fail(path, "must be text.");
  if (!options.allowEmpty && !value.trim()) fail(path, "cannot be empty.");
  if (value.length > maximum) fail(path, `cannot exceed ${maximum} characters.`);
  return value;
}

function booleanValue(value: unknown, path: string) {
  if (typeof value !== "boolean") fail(path, "must be a boolean.");
  return value;
}

function nullableInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(path, `must be null or an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function uuid(value: unknown, path: string) {
  const parsed = boundedString(value, path, 36);
  if (!UUID_PATTERN.test(parsed)) fail(path, "must be a UUID.");
  return parsed;
}

function nullableUuid(value: unknown, path: string) {
  return value === null ? null : uuid(value, path);
}

function localId(value: unknown, path: string) {
  const parsed = boundedString(value, path, 64);
  if (!LOCAL_ID_PATTERN.test(parsed)) fail(path, "must be a stable local ID.");
  return parsed;
}

function semanticKey(value: unknown, path: string) {
  const parsed = boundedString(value, path, 200);
  if (!SEMANTIC_KEY_PATTERN.test(parsed)) {
    fail(path, "may contain only letters, numbers, dots, underscores, and hyphens.");
  }
  return parsed;
}

function confidence(value: unknown, path: string) {
  const parsed = boundedString(value, path, 6);
  if (!CONFIDENCE_PATTERN.test(parsed)) fail(path, "must be a decimal string from 0 through 1.");
  return parsed;
}

function modelVerificationState(
  value: unknown,
  path: string,
): AiEstimatorModelVerificationState {
  if (value === "verified") {
    fail(path, "a model cannot mark its own observation verified.");
  }
  if (typeof value !== "string" || !MODEL_VERIFICATION_STATES.has(value as AiEstimatorModelVerificationState)) {
    fail(path, "must be high_confidence, estimated, or unverified.");
  }
  return value as AiEstimatorModelVerificationState;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: string,
  label: string,
) {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    fail(path, `must be a supported ${label}.`);
  }
  return value as T;
}

function arrayValue<T>(
  value: unknown,
  path: string,
  maximum: number,
  parser: (entry: unknown, entryPath: string) => T,
) {
  if (!Array.isArray(value)) fail(path, "must be an array.");
  if (value.length > maximum) fail(path, `cannot contain more than ${maximum} entries.`);
  return value.map((entry, index) => parser(entry, `${path}[${index}]`));
}

function unique(values: readonly string[], path: string) {
  if (new Set(values).size !== values.length) fail(path, "cannot contain duplicate IDs.");
  return values;
}

function uniqueIdRecords<T extends { id: string }>(values: readonly T[], path: string) {
  unique(values.map((value) => value.id), path);
  return values;
}

function scanProhibitedKeys(value: unknown, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanProhibitedKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_NORMALIZED_KEYS.has(normalizeKey(key))) {
      fail(`${path}.${key}`, "is prohibited in AI Estimator model output.");
    }
    scanProhibitedKeys(child, `${path}.${key}`);
  }
}

function boundingBox(value: unknown, path: string): AiEstimatorBoundingBox | null {
  if (value === null) return null;
  const parsed = record(value, path);
  exactKeys(parsed, ["x", "y", "width", "height"], path);
  const number = (candidate: unknown, key: string, zeroAllowed: boolean) => {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)
      || candidate < 0 || candidate > 1 || (!zeroAllowed && candidate === 0)) {
      fail(`${path}.${key}`, "must be a normalized number within the image bounds.");
    }
    return candidate;
  };
  const result = {
    x: number(parsed.x, "x", true),
    y: number(parsed.y, "y", true),
    width: number(parsed.width, "width", false),
    height: number(parsed.height, "height", false),
  };
  if (result.x + result.width > 1 || result.y + result.height > 1) {
    fail(path, "must fit within normalized image bounds.");
  }
  return result;
}

function parseEvidence(
  value: unknown,
  path: string,
  allowedAssetIds: ReadonlySet<string>,
  segments: ReadonlyMap<string, AiEstimatorTranscriptSegmentReference>,
): AiEstimatorEvidence {
  const parsed = record(value, path);
  exactKeys(parsed, [
    "assetId",
    "transcriptSegmentId",
    "startMs",
    "endMs",
    "pageNumber",
    "boundingBox",
    "externalMeasurementId",
    "excerpt",
  ], path);
  const assetId = uuid(parsed.assetId, `${path}.assetId`);
  if (!allowedAssetIds.has(assetId)) fail(`${path}.assetId`, "is not part of this processing run.");
  const transcriptSegmentId = nullableUuid(parsed.transcriptSegmentId, `${path}.transcriptSegmentId`);
  const startMs = nullableInteger(parsed.startMs, `${path}.startMs`, 0, 86_400_000);
  const endMs = nullableInteger(parsed.endMs, `${path}.endMs`, 0, 86_400_000);
  const pageNumber = nullableInteger(parsed.pageNumber, `${path}.pageNumber`, 1, 10_000);
  const box = boundingBox(parsed.boundingBox, `${path}.boundingBox`);
  const externalMeasurementId = boundedString(
    parsed.externalMeasurementId,
    `${path}.externalMeasurementId`,
    500,
    { nullable: true },
  );
  const excerpt = boundedString(parsed.excerpt, `${path}.excerpt`, 1000, {
    nullable: true,
    allowEmpty: true,
  });

  if ((startMs === null) !== (endMs === null)) {
    fail(path, "startMs and endMs must both be present or both be null.");
  }
  if (startMs !== null && endMs !== null && startMs >= endMs) {
    fail(path, "startMs must be earlier than endMs.");
  }
  if (transcriptSegmentId === null && startMs !== null) {
    fail(path, "timestamp evidence requires a transcript segment ID.");
  }
  if (transcriptSegmentId !== null) {
    const segment = segments.get(transcriptSegmentId);
    if (!segment) fail(`${path}.transcriptSegmentId`, "does not identify a known transcript segment.");
    if (segment.assetId !== assetId) fail(path, "transcript segment and evidence asset do not match.");
    if (startMs === null || endMs === null) fail(path, "transcript evidence requires startMs and endMs.");
    if (startMs < segment.startMs || endMs > segment.endMs) {
      fail(path, "evidence timestamps must fall within the transcript segment.");
    }
  }
  if (transcriptSegmentId === null && pageNumber === null && box === null && externalMeasurementId === null) {
    fail(path, "must contain a transcript, page, image-region, or external-measurement locator.");
  }

  return {
    assetId,
    transcriptSegmentId,
    startMs,
    endMs,
    pageNumber,
    boundingBox: box,
    externalMeasurementId,
    excerpt,
  };
}

function parseDerivation(value: unknown, path: string): AiEstimatorDerivation | null {
  if (value === null) return null;
  const parsed = record(value, path);
  exactKeys(parsed, ["formula", "version", "inputFactIds"], path);
  return {
    formula: boundedString(parsed.formula, `${path}.formula`, 500),
    version: boundedString(parsed.version, `${path}.version`, 500),
    inputFactIds: unique(arrayValue(parsed.inputFactIds, `${path}.inputFactIds`, 100, localId), `${path}.inputFactIds`),
  };
}

function parseFact(
  value: unknown,
  path: string,
  allowedAssetIds: ReadonlySet<string>,
  segments: ReadonlyMap<string, AiEstimatorTranscriptSegmentReference>,
): AiEstimatorFact {
  const parsed = record(value, path);
  exactKeys(parsed, [
    "id", "kind", "semanticKey", "label", "value", "unit", "dimension",
    "sourceType", "verificationState", "confidence", "evidence",
    "contradictionGroupId", "derivation",
  ], path);
  const kind = enumValue(parsed.kind, FACT_KINDS, `${path}.kind`, "fact kind");
  let factValue: string | boolean | null;
  if (parsed.value === null || typeof parsed.value === "boolean") {
    factValue = parsed.value;
  } else {
    factValue = boundedString(parsed.value, `${path}.value`, 2000);
  }
  const unit = boundedString(parsed.unit, `${path}.unit`, 100, { nullable: true });
  const sourceType = enumValue(parsed.sourceType, SOURCE_TYPES, `${path}.sourceType`, "source type");
  if (sourceType === "manual") {
    fail(`${path}.sourceType`, "manual values must originate in human review, not provider extraction.");
  }
  const evidence = arrayValue(parsed.evidence, `${path}.evidence`, 50, (entry, entryPath) =>
    parseEvidence(entry, entryPath, allowedAssetIds, segments));
  const derivation = parseDerivation(parsed.derivation, `${path}.derivation`);

  if (sourceType === "derived") {
    if (!derivation) fail(`${path}.derivation`, "is required for a derived fact.");
  } else {
    if (derivation) fail(`${path}.derivation`, "is allowed only for a derived fact.");
    if (evidence.length === 0) fail(`${path}.evidence`, "is required for a non-derived fact.");
  }
  if (sourceType === "spoken" && !evidence.some((entry) => entry.transcriptSegmentId !== null)) {
    fail(`${path}.evidence`, "a spoken fact requires transcript evidence.");
  }
  if ((sourceType === "LiDAR" || sourceType === "Matterport")
    && !evidence.some((entry) => entry.externalMeasurementId !== null)) {
    fail(`${path}.evidence`, `${sourceType} facts require an external measurement ID.`);
  }
  if (kind === "measurement") {
    if (typeof factValue !== "string" || !SIGNED_DECIMAL_PATTERN.test(factValue)) {
      fail(`${path}.value`, "a measurement value must be a decimal string.");
    }
    if (unit === null || !unit.trim()) fail(`${path}.unit`, "is required for a measurement.");
  }

  return {
    id: localId(parsed.id, `${path}.id`),
    kind,
    semanticKey: semanticKey(parsed.semanticKey, `${path}.semanticKey`),
    label: boundedString(parsed.label, `${path}.label`, 500),
    value: factValue,
    unit,
    dimension: enumValue(parsed.dimension, DIMENSIONS, `${path}.dimension`, "dimension"),
    sourceType,
    verificationState: modelVerificationState(parsed.verificationState, `${path}.verificationState`),
    confidence: confidence(parsed.confidence, `${path}.confidence`),
    evidence,
    contradictionGroupId: parsed.contradictionGroupId === null
      ? null
      : localId(parsed.contradictionGroupId, `${path}.contradictionGroupId`),
    derivation,
  };
}

function parseQuantityCandidate(value: unknown, path: string): AiEstimatorQuantityCandidate {
  const parsed = record(value, path);
  exactKeys(parsed, ["value", "unit", "sourceFactIds", "verificationState"], path);
  const quantity = parsed.value === null
    ? null
    : boundedString(parsed.value, `${path}.value`, 32);
  if (quantity !== null && !UNSIGNED_DECIMAL_PATTERN.test(quantity)) {
    fail(`${path}.value`, "must be a nonnegative decimal string or null.");
  }
  const sourceFactIds = unique(
    arrayValue(parsed.sourceFactIds, `${path}.sourceFactIds`, 100, localId),
    `${path}.sourceFactIds`,
  );
  const verificationState = modelVerificationState(parsed.verificationState, `${path}.verificationState`);
  if (quantity === null && (sourceFactIds.length > 0 || verificationState !== "unverified")) {
    fail(path, "a null quantity must be unverified and have no source facts.");
  }
  if (quantity !== null && sourceFactIds.length === 0) {
    fail(`${path}.sourceFactIds`, "is required for a populated quantity.");
  }
  return {
    value: quantity,
    unit: boundedString(parsed.unit, `${path}.unit`, 100),
    sourceFactIds,
    verificationState,
  };
}

function parseItem(value: unknown, path: string): AiEstimatorDraftItem {
  const parsed = record(value, path);
  exactKeys(parsed, [
    "id", "itemTypeCandidate", "categoryCandidate", "customerDescriptionCandidate",
    "internalDescriptionCandidate", "quantityCandidate", "scopeFactIds",
    "measurementFactIds", "unknownIds",
  ], path);
  return {
    id: localId(parsed.id, `${path}.id`),
    itemTypeCandidate: enumValue(parsed.itemTypeCandidate, ITEM_TYPES, `${path}.itemTypeCandidate`, "item type"),
    categoryCandidate: enumValue(parsed.categoryCandidate, ITEM_CATEGORIES, `${path}.categoryCandidate`, "item category"),
    customerDescriptionCandidate: boundedString(parsed.customerDescriptionCandidate, `${path}.customerDescriptionCandidate`, 500),
    internalDescriptionCandidate: boundedString(parsed.internalDescriptionCandidate, `${path}.internalDescriptionCandidate`, 5000, { nullable: true }),
    quantityCandidate: parseQuantityCandidate(parsed.quantityCandidate, `${path}.quantityCandidate`),
    scopeFactIds: unique(arrayValue(parsed.scopeFactIds, `${path}.scopeFactIds`, 100, localId), `${path}.scopeFactIds`),
    measurementFactIds: unique(arrayValue(parsed.measurementFactIds, `${path}.measurementFactIds`, 100, localId), `${path}.measurementFactIds`),
    unknownIds: unique(arrayValue(parsed.unknownIds, `${path}.unknownIds`, 100, localId), `${path}.unknownIds`),
  };
}

function parseSection(value: unknown, path: string): AiEstimatorDraftSection {
  const parsed = record(value, path);
  exactKeys(parsed, ["id", "name", "customerDescriptionCandidate", "evidenceFactIds", "items"], path);
  return {
    id: localId(parsed.id, `${path}.id`),
    name: boundedString(parsed.name, `${path}.name`, 500),
    customerDescriptionCandidate: boundedString(parsed.customerDescriptionCandidate, `${path}.customerDescriptionCandidate`, 5000, { nullable: true }),
    evidenceFactIds: unique(arrayValue(parsed.evidenceFactIds, `${path}.evidenceFactIds`, 200, localId), `${path}.evidenceFactIds`),
    items: uniqueIdRecords(arrayValue(parsed.items, `${path}.items`, 500, parseItem), `${path}.items`),
  };
}

function parseUnknown(
  value: unknown,
  path: string,
  allowedAssetIds: ReadonlySet<string>,
  segments: ReadonlyMap<string, AiEstimatorTranscriptSegmentReference>,
): AiEstimatorUnknown {
  const parsed = record(value, path);
  exactKeys(parsed, ["id", "semanticKey", "description", "blocksQuantity", "blocksPricing", "evidence"], path);
  return {
    id: localId(parsed.id, `${path}.id`),
    semanticKey: semanticKey(parsed.semanticKey, `${path}.semanticKey`),
    description: boundedString(parsed.description, `${path}.description`, 5000),
    blocksQuantity: booleanValue(parsed.blocksQuantity, `${path}.blocksQuantity`),
    blocksPricing: booleanValue(parsed.blocksPricing, `${path}.blocksPricing`),
    evidence: arrayValue(parsed.evidence, `${path}.evidence`, 50, (entry, entryPath) =>
      parseEvidence(entry, entryPath, allowedAssetIds, segments)),
  };
}

function parseQuestion(value: unknown, path: string): AiEstimatorClarifyingQuestion {
  const parsed = record(value, path);
  exactKeys(parsed, ["id", "question", "reason", "resolvesUnknownIds", "priority"], path);
  const resolvesUnknownIds = unique(
    arrayValue(parsed.resolvesUnknownIds, `${path}.resolvesUnknownIds`, 100, localId),
    `${path}.resolvesUnknownIds`,
  );
  if (resolvesUnknownIds.length === 0) fail(`${path}.resolvesUnknownIds`, "must identify at least one unknown.");
  return {
    id: localId(parsed.id, `${path}.id`),
    question: boundedString(parsed.question, `${path}.question`, 500),
    reason: boundedString(parsed.reason, `${path}.reason`, 5000),
    resolvesUnknownIds,
    priority: enumValue(parsed.priority, QUESTION_PRIORITIES, `${path}.priority`, "question priority"),
  };
}

function parseWarning(value: unknown, path: string): AiEstimatorWarning {
  const parsed = record(value, path);
  exactKeys(parsed, ["code", "message", "evidenceSegmentIds"], path);
  const code = boundedString(parsed.code, `${path}.code`, 100);
  if (!WARNING_CODE_PATTERN.test(code)) fail(`${path}.code`, "must be an uppercase warning code.");
  return {
    code,
    message: boundedString(parsed.message, `${path}.message`, 5000),
    evidenceSegmentIds: unique(
      arrayValue(parsed.evidenceSegmentIds, `${path}.evidenceSegmentIds`, 100, uuid),
      `${path}.evidenceSegmentIds`,
    ),
  };
}

function requireReferences(
  values: readonly string[],
  available: ReadonlySet<string>,
  path: string,
) {
  for (const value of values) {
    if (!available.has(value)) fail(path, `references unknown ID ${value}.`);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function parseAiEstimatorExtractionV0(
  value: unknown,
  context: AiEstimatorExtractionValidationContext,
): AiEstimatorExtractionV0 {
  scanProhibitedKeys(value);
  const root = record(value, "$");
  exactKeys(root, [
    "schemaVersion", "sourceAssetIds", "summary", "facts", "sections",
    "unknowns", "clarifyingQuestions", "warnings",
  ], "$");
  if (root.schemaVersion !== AI_ESTIMATOR_EXTRACTION_SCHEMA_VERSION) {
    fail("$.schemaVersion", `must equal ${AI_ESTIMATOR_EXTRACTION_SCHEMA_VERSION}.`);
  }

  const allowedAssetIds = new Set(context.allowedAssetIds.map((id, index) =>
    uuid(id, `context.allowedAssetIds[${index}]`)));
  const segments = new Map<string, AiEstimatorTranscriptSegmentReference>();
  for (const [index, segment] of context.transcriptSegments.entries()) {
    const path = `context.transcriptSegments[${index}]`;
    const id = uuid(segment.id, `${path}.id`);
    const assetId = uuid(segment.assetId, `${path}.assetId`);
    if (!allowedAssetIds.has(assetId)) fail(`${path}.assetId`, "is not an allowed processing asset.");
    if (!Number.isSafeInteger(segment.startMs) || !Number.isSafeInteger(segment.endMs)
      || segment.startMs < 0 || segment.startMs >= segment.endMs) {
      fail(path, "must have a valid nonnegative time range.");
    }
    if (segments.has(id)) fail(`${path}.id`, "is duplicated.");
    segments.set(id, { id, assetId, startMs: segment.startMs, endMs: segment.endMs });
  }

  const sourceAssetIds = unique(
    arrayValue(root.sourceAssetIds, "$.sourceAssetIds", 32, uuid),
    "$.sourceAssetIds",
  );
  if (sourceAssetIds.length === 0) fail("$.sourceAssetIds", "must contain at least one asset ID.");
  for (const id of sourceAssetIds) {
    if (!allowedAssetIds.has(id)) fail("$.sourceAssetIds", `contains unauthorized asset ${id}.`);
  }
  const extractionAssets = new Set(sourceAssetIds);

  const summaryRecord = record(root.summary, "$.summary");
  exactKeys(summaryRecord, ["projectTypeCandidate", "plainLanguageScope", "overallConfidence"], "$.summary");
  const facts = uniqueIdRecords(
    arrayValue(root.facts, "$.facts", 2000, (entry, path) =>
      parseFact(entry, path, extractionAssets, segments)),
    "$.facts",
  );
  const sections = uniqueIdRecords(
    arrayValue(root.sections, "$.sections", 200, parseSection),
    "$.sections",
  );
  const unknowns = uniqueIdRecords(
    arrayValue(root.unknowns, "$.unknowns", 1000, (entry, path) =>
      parseUnknown(entry, path, extractionAssets, segments)),
    "$.unknowns",
  );
  const questions = uniqueIdRecords(
    arrayValue(root.clarifyingQuestions, "$.clarifyingQuestions", 500, parseQuestion),
    "$.clarifyingQuestions",
  );
  const warnings = arrayValue(root.warnings, "$.warnings", 500, parseWarning);

  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const factIds = new Set(factsById.keys());
  const unknownIds = new Set(unknowns.map((entry) => entry.id));
  const allItemIds = new Set<string>();

  facts.forEach((fact, index) => {
    const path = `$.facts[${index}]`;
    if (fact.derivation) {
      requireReferences(fact.derivation.inputFactIds, factIds, `${path}.derivation.inputFactIds`);
      if (fact.derivation.inputFactIds.includes(fact.id)) {
        fail(`${path}.derivation.inputFactIds`, "cannot reference the derived fact itself.");
      }
    }
  });

  sections.forEach((section, sectionIndex) => {
    const sectionPath = `$.sections[${sectionIndex}]`;
    requireReferences(section.evidenceFactIds, factIds, `${sectionPath}.evidenceFactIds`);
    section.items.forEach((item, itemIndex) => {
      const itemPath = `${sectionPath}.items[${itemIndex}]`;
      if (allItemIds.has(item.id)) fail(`${itemPath}.id`, "is duplicated across sections.");
      allItemIds.add(item.id);
      requireReferences(item.scopeFactIds, factIds, `${itemPath}.scopeFactIds`);
      requireReferences(item.measurementFactIds, factIds, `${itemPath}.measurementFactIds`);
      requireReferences(item.quantityCandidate.sourceFactIds, factIds, `${itemPath}.quantityCandidate.sourceFactIds`);
      requireReferences(item.unknownIds, unknownIds, `${itemPath}.unknownIds`);
      for (const id of item.measurementFactIds) {
        if (factsById.get(id)?.kind !== "measurement") {
          fail(`${itemPath}.measurementFactIds`, `${id} is not a measurement fact.`);
        }
      }
      for (const id of item.quantityCandidate.sourceFactIds) {
        if (factsById.get(id)?.kind !== "measurement") {
          fail(`${itemPath}.quantityCandidate.sourceFactIds`, `${id} is not a measurement fact.`);
        }
      }
    });
  });

  questions.forEach((question, index) =>
    requireReferences(question.resolvesUnknownIds, unknownIds, `$.clarifyingQuestions[${index}].resolvesUnknownIds`));
  warnings.forEach((warning, warningIndex) => {
    warning.evidenceSegmentIds.forEach((id) => {
      if (!segments.has(id)) {
        fail(`$.warnings[${warningIndex}].evidenceSegmentIds`, `references unknown transcript segment ${id}.`);
      }
    });
  });

  return deepFreeze({
    schemaVersion: AI_ESTIMATOR_EXTRACTION_SCHEMA_VERSION,
    sourceAssetIds,
    summary: {
      projectTypeCandidate: boundedString(summaryRecord.projectTypeCandidate, "$.summary.projectTypeCandidate", 500, { nullable: true }),
      plainLanguageScope: boundedString(summaryRecord.plainLanguageScope, "$.summary.plainLanguageScope", 5000, { nullable: true }),
      overallConfidence: modelVerificationState(summaryRecord.overallConfidence, "$.summary.overallConfidence"),
    },
    facts,
    sections,
    unknowns,
    clarifyingQuestions: questions,
    warnings,
  });
}
