import assert from "node:assert/strict";
import test from "node:test";

import { projectFenceContextQuestions } from "../src/lib/fence-context-questions.ts";

const readyOneRun = Object.freeze({
  status: "ready",
  runs: Object.freeze([{ number: 1 }]),
});

const baseEstimate = Object.freeze({ propertyAddress: "12 Oak St", status: "draft" });

test("questions are progressive and manufacturer-resolved facts are never asked", () => {
  const answerSequence = [
    [{}, "system"],
    [{ system: "emblem_6x8_white" }, "measurementBasis"],
    [{ system: "emblem_6x8_white", measurementBasis: "post_centers" }, "terrain"],
    [{ system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level" }, "frostDepthInches"],
    [{ system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level", frostDepthInches: "36" }, "conditions"],
  ];

  for (const [answers, expectedKey] of answerSequence) {
    const result = projectFenceContextQuestions({ draft: readyOneRun, estimate: baseEstimate, answers });
    assert.equal(result.status, "asking");
    assert.equal(result.currentQuestion?.key, expectedKey);
  }

  const first = projectFenceContextQuestions({ draft: readyOneRun, estimate: baseEstimate });
  const askedCopy = JSON.stringify(first.currentQuestion);
  for (const manufacturerOnly of ["panel width", "post width", "hole diameter", "rack limit", "brackets"]) {
    assert.doesNotMatch(askedCopy, new RegExp(manufacturerOnly, "i"));
  }
  assert.match(first.manufacturerFacts.join(" "), /94 in/i);
  assert.match(first.manufacturerFacts.join(" "), /10 in hole diameter/i);
});

test("one-run jobs skip the corner question and complete only after no special condition", () => {
  const result = projectFenceContextQuestions({
    draft: readyOneRun,
    estimate: baseEstimate,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
      frostDepthInches: "36",
      conditions: "none",
    },
  });

  assert.equal(result.status, "job_context_complete");
  assert.equal(result.currentQuestion, null);
  assert.equal(result.answeredQuestionKeys.includes("corners"), false);
  assert.deepEqual(result.answeredQuestionKeys, ["system", "measurementBasis", "terrain", "frostDepthInches", "conditions"]);
  assert.match(result.testFixtureNotice, /test only/i);
  assert.match(result.testFixtureNotice, /not customer-authoritative/i);
});

test("connected runs ask for exact 90-degree corners", () => {
  const result = projectFenceContextQuestions({
    draft: { status: "ready", runs: [{ number: 1 }, { number: 2 }] },
    estimate: baseEstimate,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
    },
  });
  assert.equal(result.currentQuestion?.key, "corners");
  assert.match(result.currentQuestion?.help ?? "", /T-junctions and arbitrary angles/i);
});

test("a valid saved gate draft reaches the gate-specific question without pretending the gate is supported", () => {
  const result = projectFenceContextQuestions({
    draft: { status: "manual_review", runs: [{ number: 1, error: null }] },
    needsGate: true,
    estimate: baseEstimate,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
      frostDepthInches: "36",
    },
  });
  assert.equal(result.status, "asking");
  assert.equal(result.currentQuestion?.key, "conditions");
  assert.match(result.currentQuestion?.prompt ?? "", /what gate or special condition/i);
  assert.equal(result.currentQuestion?.options?.some((option) => option.value === "none"), false);

  const blocked = projectFenceContextQuestions({
    draft: { status: "manual_review", runs: [{ number: 1, error: null }] },
    needsGate: true,
    estimate: baseEstimate,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
      frostDepthInches: "36",
      conditions: "single_gate_5ft",
    },
  });
  assert.equal(blocked.status, "manual_review");
  assert.match(blocked.jobBlocker ?? "", /insert-count/i);

  const contradictory = projectFenceContextQuestions({
    draft: { status: "manual_review", runs: [{ number: 1, error: null }] },
    needsGate: true,
    estimate: baseEstimate,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
      frostDepthInches: "36",
      conditions: "none",
    },
  });
  assert.equal(contradictory.status, "manual_review");
  assert.match(contradictory.jobBlocker ?? "", /drawing says a gate/i);
});

test("unsupported job answers fail closed with a specific job blocker", () => {
  const cases = [
    [{ system: "different_or_unsure" }, /own manufacturer-backed rule set/i],
    [{ system: "emblem_6x8_white", measurementBasis: "different_or_unsure" }, /post-center/i],
    [{ system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "sloped_or_unsure" }, /sloped/i],
    [{ system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level", frostDepthInches: "36", conditions: "single_gate_4ft" }, /gate foundation/i],
    [{ system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level", frostDepthInches: "36", conditions: "pool" }, /not pool-code approved/i],
  ];

  for (const [answers, blockerPattern] of cases) {
    const result = projectFenceContextQuestions({ draft: readyOneRun, estimate: baseEstimate, answers });
    assert.equal(result.status, "manual_review");
    assert.match(result.jobBlocker ?? "", blockerPattern);
    assert.equal(result.currentQuestion, null);
  }
});

test("frost depth remains a per-job verified answer and is never inferred from address", () => {
  for (const estimate of [baseEstimate, { propertyAddress: "", status: "draft" }]) {
    const result = projectFenceContextQuestions({
      draft: readyOneRun,
      estimate,
      answers: {
        system: "emblem_6x8_white",
        measurementBasis: "post_centers",
        terrain: "level",
      },
    });
    assert.equal(result.currentQuestion?.key, "frostDepthInches");
    assert.match(result.currentQuestion?.help ?? "", /verify|verified/i);
  }

  for (const frostDepthInches of ["", "0", "36.5", "unknown", "-1"]) {
    const result = projectFenceContextQuestions({
      draft: readyOneRun,
      estimate: baseEstimate,
      answers: {
        system: "emblem_6x8_white",
        measurementBasis: "post_centers",
        terrain: "level",
        frostDepthInches,
      },
    });
    assert.equal(result.currentQuestion?.key, "frostDepthInches");
  }
});

test("company-standard blockers remain separate from per-job answers", () => {
  const result = projectFenceContextQuestions({
    draft: readyOneRun,
    estimate: baseEstimate,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
      frostDepthInches: "36",
      conditions: "none",
    },
  });

  assert.equal(result.jobBlocker, null);
  assert.match(result.companyStandardBlockers.join(" "), /minimum permitted cut-panel width/i);
  assert.match(result.companyStandardBlockers.join(" "), /foundation profiles/i);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.answeredQuestionKeys), true);
  assert.equal(Object.isFrozen(result.manufacturerFacts), true);
});

test("an unfinished or unsupported draft does not ask job questions", () => {
  for (const status of ["empty", "invalid", "manual_review"]) {
    const result = projectFenceContextQuestions({
      draft: { status, runs: [] },
      estimate: baseEstimate,
    });
    assert.equal(result.status, "waiting_for_draft");
    assert.equal(result.currentQuestion, null);
  }
});
