import type {
  AiEstimatorExtractionProvider,
  AiEstimatorTranscriptionProvider,
} from "./provider-types";

type ProviderAdapter =
  | AiEstimatorTranscriptionProvider
  | AiEstimatorExtractionProvider;

export class AiEstimatorProviderConfigurationError extends Error {
  readonly code = "ai_estimator_provider_not_configured";

  constructor(message: string) {
    super(message);
    this.name = "AiEstimatorProviderConfigurationError";
  }
}

function providerId(adapter: ProviderAdapter) {
  const value = adapter.identity.providerId.trim();
  if (!value) {
    throw new AiEstimatorProviderConfigurationError(
      "AI Estimator provider IDs cannot be empty.",
    );
  }
  return value;
}

export class AiEstimatorProviderRegistry {
  readonly #transcription = new Map<string, AiEstimatorTranscriptionProvider>();
  readonly #extraction = new Map<string, AiEstimatorExtractionProvider>();

  registerTranscription(adapter: AiEstimatorTranscriptionProvider) {
    const id = providerId(adapter);
    if (!adapter.identity.capabilities.transcription) {
      throw new AiEstimatorProviderConfigurationError(
        `Provider ${id} does not declare transcription capability.`,
      );
    }
    if (this.#transcription.has(id)) {
      throw new AiEstimatorProviderConfigurationError(
        `Transcription provider ${id} is already registered.`,
      );
    }
    this.#transcription.set(id, adapter);
    return this;
  }

  registerExtraction(adapter: AiEstimatorExtractionProvider) {
    const id = providerId(adapter);
    if (!adapter.identity.capabilities.structuredTextExtraction) {
      throw new AiEstimatorProviderConfigurationError(
        `Provider ${id} does not declare structured-text extraction capability.`,
      );
    }
    if (this.#extraction.has(id)) {
      throw new AiEstimatorProviderConfigurationError(
        `Extraction provider ${id} is already registered.`,
      );
    }
    this.#extraction.set(id, adapter);
    return this;
  }

  requireTranscription(providerIdValue: string) {
    const id = providerIdValue.trim();
    const adapter = this.#transcription.get(id);
    if (!adapter) {
      throw new AiEstimatorProviderConfigurationError(
        `Transcription provider ${id || "(empty)"} is not configured.`,
      );
    }
    return adapter;
  }

  requireExtraction(providerIdValue: string) {
    const id = providerIdValue.trim();
    const adapter = this.#extraction.get(id);
    if (!adapter) {
      throw new AiEstimatorProviderConfigurationError(
        `Extraction provider ${id || "(empty)"} is not configured.`,
      );
    }
    return adapter;
  }
}

