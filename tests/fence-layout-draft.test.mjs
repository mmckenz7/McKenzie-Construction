import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPersistableFenceLayoutDraft,
  FENCE_DRAFT_MAX_RUNS,
  FENCE_LAYOUT_SCHEMA_VERSION,
  projectFenceLayoutDraft,
  storedFenceRunInputs,
} from "../src/lib/fence-layout-draft.ts";

test("whole feet and inches produce an exact connected-run total", () => {
  const result = projectFenceLayoutDraft({
    runs: [
      { feet: "10", inches: "8" },
      { feet: "2", inches: "7" },
      { feet: "0", inches: "9" },
    ],
    needsGate: false,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.totalLengthInches, "168");
  assert.equal(result.totalLengthLabel, "14 ft 0 in");
  assert.deepEqual(
    result.runs.map(({ fromLabel, toLabel }) => [fromLabel, toLabel]),
    [
      ["Start", "Corner 1"],
      ["Corner 1", "Corner 2"],
      ["Corner 2", "End"],
    ],
  );
});

test("every run must use whole feet, 0-11 inches, and a positive length", () => {
  for (const run of [
    { feet: "", inches: "0" },
    { feet: "1.5", inches: "0" },
    { feet: "-1", inches: "0" },
    { feet: "1", inches: "12" },
    { feet: "0", inches: "0" },
    { feet: "1000", inches: "1" },
    { feet: "99999", inches: "0" },
  ]) {
    const result = projectFenceLayoutDraft({ runs: [run], needsGate: false });
    assert.equal(result.status, "invalid");
    assert.equal(result.totalLengthInches, null);
    assert.equal(result.totalLengthLabel, null);
    assert.notEqual(result.runs[0].error, null);
  }
});

test("an invalid run withholds the entire total instead of exposing a partial quantity", () => {
  const result = projectFenceLayoutDraft({
    runs: [
      { feet: "12", inches: "0" },
      { feet: "", inches: "0" },
    ],
    needsGate: false,
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.totalLengthInches, null);
  assert.match(result.issue, /every run/i);
});

test("a gate flag fails closed without creating an opening or exposing a total", () => {
  const result = projectFenceLayoutDraft({
    runs: [{ feet: "25", inches: "6" }],
    needsGate: true,
  });
  assert.equal(result.status, "manual_review");
  assert.equal(result.statusLabel, "Manual review");
  assert.equal(result.totalLengthInches, null);
  assert.equal(result.totalLengthLabel, null);
  assert.match(result.issue, /not approved/i);
  assert.match(result.issue, /no gate opening or quantity/i);
  assert.equal("openings" in result, false);
});

test("a gate-requested layout remains exactly saveable while workflow output stays blocked", () => {
  const saved = buildPersistableFenceLayoutDraft({
    runs: [{ feet: "25", inches: "6" }, { feet: "3", inches: "1" }],
    needsGate: true,
  });
  assert.deepEqual(saved, {
    schemaVersion: FENCE_LAYOUT_SCHEMA_VERSION,
    runLengthsInches: [306, 37],
    totalLengthInches: 343,
    needsGate: true,
    contextAnswers: {},
  });
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(Object.isFrozen(saved.runLengthsInches), true);
});

test("stored exact inches hydrate to canonical feet and inches", () => {
  assert.deepEqual(storedFenceRunInputs([306, 37]), [
    { feet: "25", inches: "6" },
    { feet: "3", inches: "1" },
  ]);
  assert.throws(() => storedFenceRunInputs([0]), /invalid run length/i);
});

test("run-count and total bounds fail closed", () => {
  const tooMany = projectFenceLayoutDraft({
    runs: Array.from({ length: FENCE_DRAFT_MAX_RUNS + 1 }, () => ({ feet: "1", inches: "0" })),
    needsGate: false,
  });
  assert.equal(tooMany.status, "manual_review");
  assert.equal(tooMany.totalLengthInches, null);
  assert.match(tooMany.issue, /at most 50/i);

  const tooLong = projectFenceLayoutDraft({
    runs: Array.from({ length: 6 }, () => ({ feet: "1000", inches: "0" })),
    needsGate: false,
  });
  assert.equal(tooLong.status, "manual_review");
  assert.equal(tooLong.totalLengthInches, null);
  assert.match(tooLong.issue, /5,000 ft/i);
});

test("draft projections are immutable", () => {
  const result = projectFenceLayoutDraft({
    runs: [{ feet: "1", inches: "0" }],
    needsGate: false,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.runs), true);
  assert.equal(Object.isFrozen(result.runs[0]), true);
});
