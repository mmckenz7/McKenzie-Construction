import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AiEstimatorProviderConfigurationError,
  AiEstimatorProviderRegistry,
} from "../src/lib/ai-estimator/provider-registry-core.ts";

function identity(providerId, capabilities = {}) {
  return {
    providerId,
    adapterVersion: "test-contract-v1",
    capabilities: {
      transcription: false,
      diarization: false,
      structuredTextExtraction: false,
      imageUnderstanding: false,
      videoUnderstanding: false,
      pdfUnderstanding: false,
      zeroRetentionEligible: false,
      ...capabilities,
    },
  };
}

test("provider selection is explicit and fails closed without configuration", () => {
  const registry = new AiEstimatorProviderRegistry();
  assert.throws(
    () => registry.requireTranscription("unconfigured"),
    (error) => error instanceof AiEstimatorProviderConfigurationError
      && error.code === "ai_estimator_provider_not_configured",
  );
  assert.throws(
    () => registry.requireExtraction("unconfigured"),
    AiEstimatorProviderConfigurationError,
  );
});

test("registry requires declared capabilities and rejects duplicate providers", () => {
  const registry = new AiEstimatorProviderRegistry();
  const transcription = {
    identity: identity("speech-a", { transcription: true }),
    async transcribe() { throw new Error("not invoked by registry contract test"); },
  };
  registry.registerTranscription(transcription);
  assert.equal(registry.requireTranscription("speech-a"), transcription);
  assert.throws(
    () => registry.registerTranscription(transcription),
    /already registered/,
  );
  assert.throws(
    () => registry.registerExtraction({
      identity: identity("text-without-capability"),
      async extract() { throw new Error("not invoked by registry contract test"); },
    }),
    /does not declare structured-text extraction capability/,
  );
});

test("server provider boundary is marked server-only", () => {
  const source = readFileSync(
    "src/lib/ai-estimator/providers.ts",
    "utf8",
  );
  assert.match(source, /^import "server-only";/);
});
