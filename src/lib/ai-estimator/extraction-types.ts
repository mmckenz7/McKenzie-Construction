export const AI_ESTIMATOR_EXTRACTION_SCHEMA_VERSION =
  "ai-estimator-extraction-v0" as const;

export const AI_ESTIMATOR_SOURCE_TYPES = [
  "manual",
  "spoken",
  "drawing",
  "LiDAR",
  "Matterport",
  "visual_estimate",
  "derived",
] as const;

export type AiEstimatorSourceType =
  (typeof AI_ESTIMATOR_SOURCE_TYPES)[number];

export const AI_ESTIMATOR_VERIFICATION_STATES = [
  "verified",
  "high_confidence",
  "estimated",
  "unverified",
] as const;

export type AiEstimatorVerificationState =
  (typeof AI_ESTIMATOR_VERIFICATION_STATES)[number];

export type AiEstimatorModelVerificationState = Exclude<
  AiEstimatorVerificationState,
  "verified"
>;

export const AI_ESTIMATOR_DIMENSIONS = [
  "count",
  "length",
  "area",
  "volume",
  "weight",
  "angle",
  "duration",
  "rate",
  "other",
] as const;

export type AiEstimatorDimension =
  (typeof AI_ESTIMATOR_DIMENSIONS)[number];

export type AiEstimatorBoundingBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type AiEstimatorEvidence = Readonly<{
  assetId: string;
  transcriptSegmentId: string | null;
  startMs: number | null;
  endMs: number | null;
  pageNumber: number | null;
  boundingBox: AiEstimatorBoundingBox | null;
  externalMeasurementId: string | null;
  excerpt: string | null;
}>;

export type AiEstimatorDerivation = Readonly<{
  formula: string;
  version: string;
  inputFactIds: readonly string[];
}>;

export type AiEstimatorFact = Readonly<{
  id: string;
  kind:
    | "measurement"
    | "scope"
    | "condition"
    | "material"
    | "exclusion"
    | "assumption"
    | "other";
  semanticKey: string;
  label: string;
  value: string | boolean | null;
  unit: string | null;
  dimension: AiEstimatorDimension;
  sourceType: AiEstimatorSourceType;
  verificationState: AiEstimatorModelVerificationState;
  confidence: string;
  evidence: readonly AiEstimatorEvidence[];
  contradictionGroupId: string | null;
  derivation: AiEstimatorDerivation | null;
}>;

export type AiEstimatorQuantityCandidate = Readonly<{
  value: string | null;
  unit: string;
  sourceFactIds: readonly string[];
  verificationState: AiEstimatorModelVerificationState;
}>;

export type AiEstimatorDraftItem = Readonly<{
  id: string;
  itemTypeCandidate: "standard" | "allowance";
  categoryCandidate:
    | "material"
    | "labor"
    | "subcontractor"
    | "equipment"
    | "permit"
    | "dumpster"
    | "delivery"
    | "allowance"
    | "other";
  customerDescriptionCandidate: string;
  internalDescriptionCandidate: string | null;
  quantityCandidate: AiEstimatorQuantityCandidate;
  scopeFactIds: readonly string[];
  measurementFactIds: readonly string[];
  unknownIds: readonly string[];
}>;

export type AiEstimatorDraftSection = Readonly<{
  id: string;
  name: string;
  customerDescriptionCandidate: string | null;
  evidenceFactIds: readonly string[];
  items: readonly AiEstimatorDraftItem[];
}>;

export type AiEstimatorUnknown = Readonly<{
  id: string;
  semanticKey: string;
  description: string;
  blocksQuantity: boolean;
  blocksPricing: boolean;
  evidence: readonly AiEstimatorEvidence[];
}>;

export type AiEstimatorClarifyingQuestion = Readonly<{
  id: string;
  question: string;
  reason: string;
  resolvesUnknownIds: readonly string[];
  priority: "blocking" | "important" | "optional";
}>;

export type AiEstimatorWarning = Readonly<{
  code: string;
  message: string;
  evidenceSegmentIds: readonly string[];
}>;

export type AiEstimatorExtractionV0 = Readonly<{
  schemaVersion: typeof AI_ESTIMATOR_EXTRACTION_SCHEMA_VERSION;
  sourceAssetIds: readonly string[];
  summary: Readonly<{
    projectTypeCandidate: string | null;
    plainLanguageScope: string | null;
    overallConfidence: AiEstimatorModelVerificationState;
  }>;
  facts: readonly AiEstimatorFact[];
  sections: readonly AiEstimatorDraftSection[];
  unknowns: readonly AiEstimatorUnknown[];
  clarifyingQuestions: readonly AiEstimatorClarifyingQuestion[];
  warnings: readonly AiEstimatorWarning[];
}>;

export type AiEstimatorTranscriptSegmentReference = Readonly<{
  id: string;
  assetId: string;
  startMs: number;
  endMs: number;
}>;

export type AiEstimatorExtractionValidationContext = Readonly<{
  allowedAssetIds: readonly string[];
  transcriptSegments: readonly AiEstimatorTranscriptSegmentReference[];
}>;
