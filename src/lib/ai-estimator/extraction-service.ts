import "server-only";

import type { AiEstimatorExtractionV0 } from "./extraction-types";
import { parseAiEstimatorExtractionV0 } from "./extraction-validator";
import type {
  AiEstimatorExtractionProvider,
  AiEstimatorExtractionRequest,
  AiEstimatorUntrustedExtractionResponse,
} from "./provider-types";

export type AiEstimatorValidatedExtractionResult = Readonly<{
  extraction: AiEstimatorExtractionV0;
  providerResponse: Omit<AiEstimatorUntrustedExtractionResponse, "output">;
}>;

function providerMismatch(label: string): never {
  throw new TypeError(`AI Estimator extraction provider returned mismatched ${label}.`);
}

export async function runAiEstimatorExtraction(
  provider: AiEstimatorExtractionProvider,
  request: AiEstimatorExtractionRequest,
  signal: AbortSignal,
): Promise<AiEstimatorValidatedExtractionResult> {
  if (!provider.identity.capabilities.structuredTextExtraction) {
    throw new TypeError(
      "AI Estimator extraction requires structured-text provider capability.",
    );
  }

  const response = await provider.extract(request, signal);
  if (response.providerId !== provider.identity.providerId) {
    providerMismatch("provider identity");
  }
  if (response.model !== request.policy.model) {
    providerMismatch("model identity");
  }
  if (request.policy.modelSnapshot !== null
    && response.modelSnapshot !== request.policy.modelSnapshot) {
    providerMismatch("model snapshot");
  }

  const extraction = parseAiEstimatorExtractionV0(response.output, {
    allowedAssetIds: [request.transcript.assetId],
    transcriptSegments: request.transcript.segments.map((segment) => ({
      id: segment.id,
      assetId: segment.assetId,
      startMs: segment.startMs,
      endMs: segment.endMs,
    })),
  });

  const { output: _untrustedOutput, ...providerResponse } = response;
  return Object.freeze({
    extraction,
    providerResponse: Object.freeze(providerResponse),
  });
}
