import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEmblemFoundationTestFixture,
  projectEmblemManufacturerTakeoff,
} from "../src/lib/fence-emblem-takeoff.ts";

const completeAnswers = Object.freeze({
  system: "emblem_6x8_white",
  measurementBasis: "post_centers",
  terrain: "level",
  corners: "exact_90",
  frostDepthInches: "36",
  conditions: "none",
});

function calculate(runLengthsInches, overrides = {}) {
  return projectEmblemManufacturerTakeoff({
    runLengthsInches,
    needsGate: false,
    answers: { ...completeAnswers, ...overrides },
  });
}

test("99-inch golden job yields one full panel and two end posts", () => {
  const result = calculate(["99"]);
  assert.equal(result.status, "ready");
  assert.equal(result.blockedCalculationTrace, null);
  assert.deepEqual(result.issueCodes, []);
  assert.deepEqual(result.manufacturerTakeoff, {
    authority: "source_derived_working_test_rule",
    systemKey: "lowes_emblem_white_privacy_6x8_working_v0",
    panelCount: 1,
    endPostCount: 2,
    linePostCount: 0,
    cornerPostCount: 0,
    capCount: 2,
    bracketCount: 0,
    physicalPostCount: 2,
    runs: [{
      runNumber: 1,
      centerlineLengthInches: "99",
      panelCount: 1,
      linePostCount: 0,
      finalPanelPhysicalWidthInches: "94",
      requiresCut: false,
    }],
  });
});

test("198-inch golden job yields two full panels and one line post", () => {
  const result = calculate(["198"]);
  assert.equal(result.status, "ready");
  assert.deepEqual({
    panels: result.manufacturerTakeoff?.panelCount,
    ends: result.manufacturerTakeoff?.endPostCount,
    lines: result.manufacturerTakeoff?.linePostCount,
    corners: result.manufacturerTakeoff?.cornerPostCount,
    caps: result.manufacturerTakeoff?.capCount,
  }, { panels: 2, ends: 2, lines: 1, corners: 0, caps: 3 });
  assert.equal(result.manufacturerTakeoff?.runs[0].finalPanelPhysicalWidthInches, "94");
});

test("250-inch golden trace calculates a 47-inch final panel but fails closed", () => {
  const result = calculate(["250"]);
  assert.equal(result.status, "manual_review");
  assert.equal(result.manufacturerTakeoff, null);
  assert.deepEqual(result.issueCodes, ["UNVERIFIED_CUT_WIDTH"]);
  assert.match(result.issue ?? "", /do not use this trace as an issued material takeoff/i);
  assert.deepEqual({
    panels: result.blockedCalculationTrace?.panelCount,
    ends: result.blockedCalculationTrace?.endPostCount,
    lines: result.blockedCalculationTrace?.linePostCount,
    corners: result.blockedCalculationTrace?.cornerPostCount,
    caps: result.blockedCalculationTrace?.capCount,
    finalWidth: result.blockedCalculationTrace?.runs[0].finalPanelPhysicalWidthInches,
  }, { panels: 3, ends: 2, lines: 2, corners: 0, caps: 4, finalWidth: "47" });
});

test("two 99-inch runs with exact 90-degree topology share one corner post", () => {
  const result = calculate(["99", "99"]);
  assert.equal(result.status, "ready");
  assert.deepEqual({
    panels: result.manufacturerTakeoff?.panelCount,
    ends: result.manufacturerTakeoff?.endPostCount,
    lines: result.manufacturerTakeoff?.linePostCount,
    corners: result.manufacturerTakeoff?.cornerPostCount,
    caps: result.manufacturerTakeoff?.capCount,
    posts: result.manufacturerTakeoff?.physicalPostCount,
  }, { panels: 2, ends: 2, lines: 0, corners: 1, caps: 3, posts: 3 });
});

test("test-only foundation quantities remain separate from manufacturer takeoff", () => {
  const oneSection = calculateEmblemFoundationTestFixture(2);
  assert.deepEqual({
    authority: oneSection.authority,
    concrete: oneSection.theoreticalConcreteCubicFeet,
    gravel: oneSection.theoreticalGravelCubicFeet,
    concreteBags: oneSection.concreteBagCount80Lb,
    gravelBags: oneSection.gravelBagCountHalfCubicFoot,
  }, { authority: "test_only", concrete: "1.4872", gravel: "1.0908", concreteBags: 3, gravelBags: 3 });
  assert.match(oneSection.notice, /not customer-authoritative/i);

  const twoSectionsOrL = calculateEmblemFoundationTestFixture(3);
  assert.deepEqual({
    concrete: twoSectionsOrL.theoreticalConcreteCubicFeet,
    gravel: twoSectionsOrL.theoreticalGravelCubicFeet,
    concreteBags: twoSectionsOrL.concreteBagCount80Lb,
    gravelBags: twoSectionsOrL.gravelBagCountHalfCubicFoot,
  }, { concrete: "2.2308", gravel: "1.6362", concreteBags: 4, gravelBags: 4 });

  const cutTrace = calculateEmblemFoundationTestFixture(4);
  assert.deepEqual({
    concrete: cutTrace.theoreticalConcreteCubicFeet,
    gravel: cutTrace.theoreticalGravelCubicFeet,
    concreteBags: cutTrace.concreteBagCount80Lb,
    gravelBags: cutTrace.gravelBagCountHalfCubicFoot,
  }, { concrete: "2.9744", gravel: "2.1816", concreteBags: 5, gravelBags: 5 });

  const manufacturer = calculate(["99"]).manufacturerTakeoff;
  assert.equal("concreteBagCount80Lb" in manufacturer, false);
  assert.equal("theoreticalConcreteCubicFeet" in manufacturer, false);
});

test("unsupported or incomplete context fails before exposing quantities", () => {
  const cases = [
    [{ ...completeAnswers, system: undefined }, false, "INCOMPLETE_JOB_ANSWERS"],
    [{ ...completeAnswers, frostDepthInches: undefined }, false, "INCOMPLETE_JOB_ANSWERS"],
    [{ ...completeAnswers, system: "different_or_unsure" }, false, "UNSUPPORTED_SYSTEM"],
    [{ ...completeAnswers, measurementBasis: "different_or_unsure" }, false, "UNSUPPORTED_MEASUREMENT_BASIS"],
    [{ ...completeAnswers, terrain: "sloped_or_unsure" }, false, "UNSUPPORTED_SLOPE"],
    [{ ...completeAnswers, conditions: "single_gate_4ft" }, false, "UNSUPPORTED_GATE"],
    [{ ...completeAnswers, conditions: "single_gate_5ft" }, false, "UNSUPPORTED_GATE"],
    [{ ...completeAnswers, conditions: "pool" }, false, "UNSUPPORTED_POOL_OR_SPECIAL_CONDITION"],
    [{ ...completeAnswers, conditions: "other_unsupported" }, false, "UNSUPPORTED_POOL_OR_SPECIAL_CONDITION"],
    [completeAnswers, true, "UNSUPPORTED_GATE"],
  ];

  for (const [answers, needsGate, expectedCode] of cases) {
    const result = projectEmblemManufacturerTakeoff({ runLengthsInches: ["99"], needsGate, answers });
    assert.equal(result.status, "manual_review");
    assert.equal(result.manufacturerTakeoff, null);
    assert.equal(result.blockedCalculationTrace, null);
    assert.deepEqual(result.issueCodes, [expectedCode]);
  }
});

test("multiple runs require an explicit exact-90 answer", () => {
  for (const corners of [undefined, "different_or_unsure"]) {
    const result = calculate(["99", "99"], { corners });
    assert.equal(result.status, "manual_review");
    assert.equal(result.manufacturerTakeoff, null);
    assert.equal(result.blockedCalculationTrace, null);
    assert.deepEqual(result.issueCodes, [corners ? "UNSUPPORTED_CORNER" : "INCOMPLETE_JOB_ANSWERS"]);
  }
});

test("invalid dimensions and impossible cut geometry fail closed", () => {
  for (const lengths of [[], ["0"], ["-1"], ["1.5"], ["12001"], Array(6).fill("12000")]) {
    const result = calculate(lengths);
    assert.equal(result.status, "manual_review");
    assert.deepEqual(result.issueCodes, ["INVALID_RUN_LENGTH"]);
    assert.equal(result.manufacturerTakeoff, null);
    assert.equal(result.blockedCalculationTrace, null);
  }

  const impossibleCut = calculate(["5"]);
  assert.equal(impossibleCut.status, "manual_review");
  assert.deepEqual(impossibleCut.issueCodes, ["UNVERIFIED_CUT_WIDTH"]);
  assert.equal(impossibleCut.manufacturerTakeoff, null);
  assert.equal(impossibleCut.blockedCalculationTrace, null);
});

test("takeoff results and nested traces are immutable and contain no price or catalog fields", () => {
  const result = calculate(["99", "99"]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.manufacturerTakeoff), true);
  assert.equal(Object.isFrozen(result.manufacturerTakeoff?.runs), true);
  assert.equal(Object.isFrozen(result.manufacturerTakeoff?.runs[0]), true);
  assert.doesNotMatch(JSON.stringify(result), /price|cost|sku|catalog|supplier/i);
  assert.throws(() => calculateEmblemFoundationTestFixture(0), /positive whole/i);
  assert.throws(() => calculateEmblemFoundationTestFixture(1.5), /positive whole/i);
});
