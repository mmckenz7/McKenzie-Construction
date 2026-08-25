// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { createHistoryV5, designHistoryReducerV5 } from "../src/historyV5";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";
import { stairKeyboardMove } from "../src/PlanViewV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

const unlocked = { locked: false, offset: 24, width: 48 } as const;

describe("v5 plan stair keyboard movement", () => {
  it("moves both directions along horizontal edges regardless of authored edge direction", () => {
    const forward = { start: { x: 0, z: 0 }, end: { x: 144, z: 0 }, length: 144 };
    const reverse = { start: { x: 144, z: 0 }, end: { x: 0, z: 0 }, length: 144 };
    expect(stairKeyboardMove(unlocked, forward, "ArrowRight", 6)).toEqual({ handled: true, offset: 30 });
    expect(stairKeyboardMove(unlocked, forward, "ArrowLeft", 6)).toEqual({ handled: true, offset: 18 });
    expect(stairKeyboardMove(unlocked, reverse, "ArrowRight", 6)).toEqual({ handled: true, offset: 18 });
    expect(stairKeyboardMove(unlocked, reverse, "ArrowLeft", 6)).toEqual({ handled: true, offset: 30 });
    expect(stairKeyboardMove(unlocked, forward, "ArrowDown", 6)).toEqual({ handled: false, offset: 24 });
  });

  it("moves both directions along vertical edges and honors the active snap", () => {
    const down = { start: { x: 0, z: 0 }, end: { x: 0, z: 144 }, length: 144 };
    const up = { start: { x: 0, z: 144 }, end: { x: 0, z: 0 }, length: 144 };
    expect(stairKeyboardMove(unlocked, down, "ArrowDown", 3)).toEqual({ handled: true, offset: 27 });
    expect(stairKeyboardMove(unlocked, down, "ArrowUp", 3)).toEqual({ handled: true, offset: 21 });
    expect(stairKeyboardMove(unlocked, up, "ArrowDown", 3)).toEqual({ handled: true, offset: 21 });
    expect(stairKeyboardMove(unlocked, up, "ArrowUp", 3)).toEqual({ handled: true, offset: 27 });
    expect(stairKeyboardMove(unlocked, down, "ArrowRight", 3)).toEqual({ handled: false, offset: 24 });
  });

  it("clamps exactly at both bounds without overshoot", () => {
    const edge = { start: { x: 0, z: 0 }, end: { x: 120, z: 0 }, length: 120 };
    expect(stairKeyboardMove({ ...unlocked, offset: 2 }, edge, "ArrowLeft", 6)).toEqual({ handled: true, offset: 0 });
    expect(stairKeyboardMove({ ...unlocked, offset: 70 }, edge, "ArrowRight", 6)).toEqual({ handled: true, offset: 72 });
    expect(stairKeyboardMove({ ...unlocked, offset: 72 }, edge, "ArrowRight", 6)).toEqual({ handled: true, offset: 72 });
  });

  it("does not offer movement for locked stairs", () => {
    const edge = { start: { x: 0, z: 0 }, end: { x: 144, z: 0 }, length: 144 };
    const stair = Object.freeze({ ...unlocked, locked: true });
    expect(stairKeyboardMove(stair, edge, "ArrowRight", 6)).toEqual({ handled: false, offset: 24 });
    expect(stair).toEqual({ locked: true, offset: 24, width: 48 });
  });

  it("commits through monotonic v5 undo and redo history", () => {
    const migrated = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const migratedPlatform = migrated.platforms[0];
    const edge = deriveGeometricPolygonEdges(migratedPlatform.region.outer).find((candidate) => migratedPlatform.edgeConditions.some((condition) => condition.edgeId === candidate.id && condition.condition === "free"))!;
    const system = { id: "stair-system-1", locked: false, edgeId: edge.id, offset: 24, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] } as const;
    const source = normalizeDeckDesignV5({ ...migrated, platforms: [{ ...migratedPlatform, construction: { ...migratedPlatform.construction, stairSystems: [system] } }] });
    const platform = source.platforms[0];
    const movedOffset = stairKeyboardMove(system, edge, "ArrowRight", 6).offset;
    const moved = normalizeDeckDesignV5({
      ...source,
      platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, offset: movedOffset }] } }],
      metadata: { ...source.metadata, revision: source.metadata.revision + 1 },
    });
    const applied = designHistoryReducerV5(createHistoryV5(source), { type: "apply", design: moved });
    const undone = designHistoryReducerV5(applied, { type: "undo" });
    const redone = designHistoryReducerV5(undone, { type: "redo" });
    expect(undone.present.platforms[0].construction.stairSystems[0].offset).toBe(system.offset);
    expect(redone.present.platforms[0].construction.stairSystems[0].offset).toBe(movedOffset);
    expect([applied.present.metadata.revision, undone.present.metadata.revision, redone.present.metadata.revision]).toEqual([2, 3, 4]);
  });
});
