import assert from "node:assert/strict";
import test from "node:test";

import {
  isStaleFenceDraftError,
  loadFenceDraft,
  saveFenceDraft,
} from "../src/lib/fence-draft-client.ts";

const stored = {
  id: "11111111-1111-4111-8111-111111111111",
  estimateId: "22222222-2222-4222-8222-222222222222",
  schemaVersion: "fence-layout-v1",
  revision: 3,
  runLengthsInches: [125, 247],
  totalLengthInches: 372,
  needsGate: true,
  contextSchemaVersion: "fence-context-v1",
  contextAnswers: {
    system: "emblem_6x8_white",
    measurementBasis: "post_centers",
    terrain: "level",
    corners: "exact_90",
    frostDepthInches: 36,
    conditions: "single_gate_4ft",
  },
  updatedAt: "2026-08-12T12:00:00.000Z",
};

const projectedStored = {
  ...stored,
  contextAnswers: { ...stored.contextAnswers, frostDepthInches: "36" },
};

test("load parses and freezes the exact authoritative Fence draft", async () => {
  const result = await loadFenceDraft(async (_url, init) => {
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    return Response.json({ success: true, draft: stored });
  }, stored.estimateId);
  assert.deepEqual(result, projectedStored);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.runLengthsInches), true);
});

test("save sends an independent expected revision and exact integer inches", async () => {
  const result = await saveFenceDraft(async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.deepEqual(body, {
      expectedRevision: 2,
      schemaVersion: "fence-layout-v1",
      runLengthsInches: [125, 247],
      needsGate: true,
      contextSchemaVersion: "fence-context-v1",
      contextAnswers: {
        system: "emblem_6x8_white",
        measurementBasis: "post_centers",
        terrain: "level",
        corners: "exact_90",
        frostDepthInches: 36,
        conditions: "single_gate_4ft",
      },
    });
    return Response.json({ success: true, draft: stored });
  }, stored.estimateId, 2, {
    schemaVersion: "fence-layout-v1",
    runLengthsInches: [125, 247],
    totalLengthInches: 372,
    needsGate: true,
    contextAnswers: projectedStored.contextAnswers,
  });
  assert.equal(result.revision, 3);
  assert.deepEqual(result.contextAnswers, projectedStored.contextAnswers);
});

test("a stale response is recognizable for authoritative reload recovery", async () => {
  await assert.rejects(
    saveFenceDraft(async () => Response.json({
      success: false,
      error: "A newer draft exists.",
      code: "stale_fence_revision",
    }, { status: 409 }), stored.estimateId, 2, {
      schemaVersion: "fence-layout-v1",
      runLengthsInches: [125],
      totalLengthInches: 125,
      needsGate: false,
    }),
    (error) => isStaleFenceDraftError(error),
  );
});
