import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AiEstimatorExtractionValidationError,
  parseAiEstimatorExtractionV0,
} from "../src/lib/ai-estimator/extraction-validator.ts";

const assetId = "11111111-1111-4111-8111-111111111111";
const segmentId = "22222222-2222-4222-8222-222222222222";

const context = Object.freeze({
  allowedAssetIds: [assetId],
  transcriptSegments: [{
    id: segmentId,
    assetId,
    startMs: 1000,
    endMs: 5000,
  }],
});

function validExtraction() {
  return {
    schemaVersion: "ai-estimator-extraction-v0",
    sourceAssetIds: [assetId],
    summary: {
      projectTypeCandidate: "deck_repair",
      plainLanguageScope: "Replace the narrated damaged deck surface.",
      overallConfidence: "high_confidence",
    },
    facts: [{
      id: "fact_measurement_1",
      kind: "measurement",
      semanticKey: "deck.main.width",
      label: "Main deck width",
      value: "12",
      unit: "ft",
      dimension: "length",
      sourceType: "spoken",
      verificationState: "high_confidence",
      confidence: "0.94",
      evidence: [{
        assetId,
        transcriptSegmentId: segmentId,
        startMs: 2000,
        endMs: 3000,
        pageNumber: null,
        boundingBox: null,
        externalMeasurementId: null,
        excerpt: "the main section is twelve feet wide",
      }],
      contradictionGroupId: null,
      derivation: null,
    }],
    sections: [{
      id: "section_1",
      name: "Deck surface",
      customerDescriptionCandidate: "Repair the main walking surface.",
      evidenceFactIds: ["fact_measurement_1"],
      items: [{
        id: "item_1",
        itemTypeCandidate: "standard",
        categoryCandidate: "material",
        customerDescriptionCandidate: "Replace damaged deck boards.",
        internalDescriptionCandidate: "Board profile remains unknown.",
        quantityCandidate: {
          value: null,
          unit: "sq_ft",
          sourceFactIds: [],
          verificationState: "unverified",
        },
        scopeFactIds: [],
        measurementFactIds: ["fact_measurement_1"],
        unknownIds: ["unknown_1"],
      }],
    }],
    unknowns: [{
      id: "unknown_1",
      semanticKey: "deck.board.profile",
      description: "Board profile was not stated.",
      blocksQuantity: false,
      blocksPricing: true,
      evidence: [],
    }],
    clarifyingQuestions: [{
      id: "question_1",
      question: "What board profile should be used?",
      reason: "An approved material selection is required before pricing.",
      resolvesUnknownIds: ["unknown_1"],
      priority: "blocking",
    }],
    warnings: [{
      code: "SCOPE_INCOMPLETE",
      message: "The narration did not identify a board profile.",
      evidenceSegmentIds: [segmentId],
    }],
  };
}

test("AI Estimator JSON Schema closes every declared object", () => {
  const schema = JSON.parse(readFileSync(
    "src/lib/ai-estimator/schemas/extraction-v0.schema.json",
    "utf8",
  ));
  const openObjects = [];
  function visit(value, path = "$") {
    if (!value || typeof value !== "object") return;
    if (value.type === "object" && value.additionalProperties !== false) {
      openObjects.push(path);
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  }
  visit(schema);
  assert.deepEqual(openObjects, []);
  assert.equal(schema.properties.schemaVersion.const, "ai-estimator-extraction-v0");
});

test("valid transcript extraction parses into an immutable shadow draft", () => {
  const parsed = parseAiEstimatorExtractionV0(validExtraction(), context);
  assert.equal(parsed.facts[0].value, "12");
  assert.equal(parsed.sections[0].items[0].quantityCandidate.value, null);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.facts[0].evidence[0]), true);
});

test("monetary keys are rejected recursively instead of stripped", () => {
  const extraction = validExtraction();
  extraction.sections[0].items[0].unitCost = "4.25";
  assert.throws(
    () => parseAiEstimatorExtractionV0(extraction, context),
    (error) => error instanceof AiEstimatorExtractionValidationError
      && /unitCost.*prohibited/.test(error.message),
  );
});

test("a model cannot mark its own observation verified", () => {
  const extraction = validExtraction();
  extraction.facts[0].verificationState = "verified";
  assert.throws(
    () => parseAiEstimatorExtractionV0(extraction, context),
    /model cannot mark its own observation verified/,
  );
});

test("spoken facts require resolvable in-segment evidence", () => {
  const extraction = validExtraction();
  extraction.facts[0].evidence[0].endMs = 6000;
  assert.throws(
    () => parseAiEstimatorExtractionV0(extraction, context),
    /timestamps must fall within the transcript segment/,
  );
});

test("provider extraction cannot masquerade as a manual measurement", () => {
  const extraction = validExtraction();
  extraction.facts[0].sourceType = "manual";
  assert.throws(
    () => parseAiEstimatorExtractionV0(extraction, context),
    /manual values must originate in human review/,
  );
});

test("unknown quantities remain null instead of receiving a default of one", () => {
  const parsed = parseAiEstimatorExtractionV0(validExtraction(), context);
  assert.deepEqual(parsed.sections[0].items[0].quantityCandidate, {
    value: null,
    unit: "sq_ft",
    sourceFactIds: [],
    verificationState: "unverified",
  });
});

test("populated quantities require a known measurement fact", () => {
  const extraction = validExtraction();
  extraction.sections[0].items[0].quantityCandidate = {
    value: "12",
    unit: "sq_ft",
    sourceFactIds: ["missing_fact"],
    verificationState: "estimated",
  };
  assert.throws(
    () => parseAiEstimatorExtractionV0(extraction, context),
    /references unknown ID missing_fact/,
  );
});

test("clarifying questions must resolve a declared unknown", () => {
  const extraction = validExtraction();
  extraction.clarifyingQuestions[0].resolvesUnknownIds = ["unknown_missing"];
  assert.throws(
    () => parseAiEstimatorExtractionV0(extraction, context),
    /references unknown ID unknown_missing/,
  );
});
