import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_ESTIMATOR_EXTRACTION_SYSTEM_INSTRUCTIONS_V0,
} from "../src/lib/ai-estimator/extraction-prompt.ts";

test("extraction instructions preserve the interpretation/pricing firewall", () => {
  assert.match(AI_ESTIMATOR_EXTRACTION_SYSTEM_INSTRUCTIONS_V0, /Never return cost, price, markup/);
  assert.match(AI_ESTIMATOR_EXTRACTION_SYSTEM_INSTRUCTIONS_V0, /Never mark a fact verified/);
  assert.match(AI_ESTIMATOR_EXTRACTION_SYSTEM_INSTRUCTIONS_V0, /Never default a missing quantity to one/);
  assert.match(AI_ESTIMATOR_EXTRACTION_SYSTEM_INSTRUCTIONS_V0, /structural, code-compliance, or engineering/);
});

test("AI Estimator service has no canonical estimate or lifecycle dependencies", () => {
  const files = [
    "src/lib/ai-estimator/extraction-service.ts",
    "src/lib/ai-estimator/extraction-validator.ts",
    "src/lib/ai-estimator/provider-registry-core.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /estimate-calculations|estimate-mutations|estimate-persistence/);
    assert.doesNotMatch(source, /create_project|convert-to-customer|send-estimate|proposal|contract-preparation/);
  }
});

test("provider execution boundaries are server-only", () => {
  for (const file of [
    "src/lib/ai-estimator/extraction-service.ts",
    "src/lib/ai-estimator/providers.ts",
  ]) {
    assert.match(readFileSync(file, "utf8"), /^import "server-only";/);
  }
});
