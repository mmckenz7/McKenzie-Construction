import type {
  AiEstimatorExtractionValidationContext,
  AiEstimatorModelVerificationState,
} from "./extraction-types";

export type AiEstimatorProviderCapabilities = Readonly<{
  transcription: boolean;
  diarization: boolean;
  structuredTextExtraction: boolean;
  imageUnderstanding: boolean;
  videoUnderstanding: boolean;
  pdfUnderstanding: boolean;
  zeroRetentionEligible: boolean;
}>;

export type AiEstimatorProviderIdentity = Readonly<{
  providerId: string;
  adapterVersion: string;
  capabilities: AiEstimatorProviderCapabilities;
}>;

export type AiEstimatorRetentionMode =
  | "provider_default"
  | "zero_data_retention"
  | "regional_processing";

export type AiEstimatorProviderPolicy = Readonly<{
  model: string;
  modelSnapshot: string | null;
  region: string | null;
  retentionMode: AiEstimatorRetentionMode;
  timeoutMs: number;
  maximumRetries: number;
}>;

export type AiEstimatorUsage = Readonly<{
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  audioSeconds: number | null;
  videoSeconds: number | null;
  imageCount: number | null;
  pageCount: number | null;
  providerReportedCostUsd: string | null;
}>;

export type AiEstimatorAudioInput = Readonly<{
  assetId: string;
  mimeType: string;
  byteLength: number;
  durationMs: number;
  sha256: string;
  openStream: () => Promise<ReadableStream<Uint8Array>>;
}>;

export type AiEstimatorTranscriptionRequest = Readonly<{
  requestId: string;
  audio: AiEstimatorAudioInput;
  language: string | null;
  diarization: boolean;
  vocabularyHints: readonly string[];
  policy: AiEstimatorProviderPolicy;
}>;

export type AiEstimatorNormalizedTranscriptSegment = Readonly<{
  id: string;
  assetId: string;
  ordinal: number;
  startMs: number;
  endMs: number;
  speakerLabel: string | null;
  text: string;
  language: string | null;
  confidence: string | null;
}>;

export type AiEstimatorNormalizedTranscript = Readonly<{
  providerRequestId: string;
  providerId: string;
  model: string;
  modelSnapshot: string | null;
  assetId: string;
  language: string | null;
  durationMs: number;
  text: string;
  segments: readonly AiEstimatorNormalizedTranscriptSegment[];
  usage: AiEstimatorUsage;
}>;

export type AiEstimatorLeadExtractionContext = Readonly<{
  projectType: string | null;
  projectDescription: string | null;
  propertyAddress: string | null;
}>;

export type AiEstimatorExtractionRequest = Readonly<{
  requestId: string;
  schemaVersion: "ai-estimator-extraction-v0";
  transcript: AiEstimatorNormalizedTranscript;
  leadContext: AiEstimatorLeadExtractionContext;
  policy: AiEstimatorProviderPolicy;
}>;

export type AiEstimatorUntrustedExtractionResponse = Readonly<{
  providerRequestId: string;
  providerId: string;
  model: string;
  modelSnapshot: string | null;
  output: unknown;
  usage: AiEstimatorUsage;
}>;

export type AiEstimatorValidatedExtractionEnvelope = Readonly<{
  response: AiEstimatorUntrustedExtractionResponse;
  validationContext: AiEstimatorExtractionValidationContext;
  overallConfidence: AiEstimatorModelVerificationState;
}>;

export interface AiEstimatorTranscriptionProvider {
  readonly identity: AiEstimatorProviderIdentity;
  transcribe(
    request: AiEstimatorTranscriptionRequest,
    signal: AbortSignal,
  ): Promise<AiEstimatorNormalizedTranscript>;
}

export interface AiEstimatorExtractionProvider {
  readonly identity: AiEstimatorProviderIdentity;
  extract(
    request: AiEstimatorExtractionRequest,
    signal: AbortSignal,
  ): Promise<AiEstimatorUntrustedExtractionResponse>;
}
