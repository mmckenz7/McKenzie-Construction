// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { applyPolygonRegionReplacement, planPolygonRegionReplacement } from "../src/commandsV3";
import { createHistoryV3, designHistoryReducerV3 } from "../src/historyV3";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";

const notchedTop = [
  { x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 144 },
  { x: 132, z: 144 }, { x: 132, z: 168 }, { x: 60, z: 168 }, { x: 60, z: 144 }, { x: 0, z: 144 },
];

function safeNotchSource() {
  const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
  const platform = design.platforms[0];
  const topEdgeId = planPolygonRegionReplacement(design, "platform-1", { outer: notchedTop, holes: [] })
    .impacts.find((impact) => impact.usages.includes("railing"))!.previousEdgeId;
  const sideEdgeId = platform.edgeConditions.find((condition) => condition.condition === "free" && condition.edgeId !== topEdgeId)!.edgeId;
  return normalizeDeckDesignV3({
    ...design,
    platforms: [{
      ...platform,
      construction: {
        ...platform.construction,
        railing: { ...platform.construction.railing, enabledEdgeIds: platform.construction.railing.enabledEdgeIds.filter((edgeId) => edgeId !== topEdgeId) },
        stairs: { ...platform.construction.stairs, edgeId: sideEdgeId },
      },
    }],
  });
}

describe("DeckDesign v3 immutable command history", () => {
  it("applies, undoes, and redoes region facts with strictly monotonic revisions", () => {
    const source = safeNotchSource();
    const edited = applyPolygonRegionReplacement(source, "platform-1", { outer: notchedTop, holes: [] }).design;
    const initial = createHistoryV3(source);
    const applied = designHistoryReducerV3(initial, { type: "apply", design: edited });
    const undone = designHistoryReducerV3(applied, { type: "undo" });
    const redone = designHistoryReducerV3(undone, { type: "redo" });
    expect([initial.present, applied.present, undone.present, redone.present].map((design) => design.metadata.revision)).toEqual([1, 2, 3, 4]);
    expect(undone.present.platforms).toEqual(source.platforms);
    expect(redone.present.platforms).toEqual(edited.platforms);
    expect(Object.isFrozen(redone.past)).toBe(true);
    expect(Object.isFrozen(redone.future)).toBe(true);
  });

  it("advances stale applied revisions and clears redo history", () => {
    const source = safeNotchSource();
    const history = createHistoryV3(source);
    const applied = designHistoryReducerV3(history, { type: "apply", design: source });
    const undone = designHistoryReducerV3(applied, { type: "undo" });
    const reapplied = designHistoryReducerV3(undone, { type: "apply", design: source });
    expect(applied.present.metadata.revision).toBe(2);
    expect(reapplied.present.metadata.revision).toBe(4);
    expect(reapplied.future).toEqual([]);
  });

  it("returns the same state when undo or redo has no target", () => {
    const history = createHistoryV3(safeNotchSource());
    expect(designHistoryReducerV3(history, { type: "undo" })).toBe(history);
    expect(designHistoryReducerV3(history, { type: "redo" })).toBe(history);
  });

  it("undoes and redoes an explicit landing turn without losing its exact stair edge", () => {
    const source = safeNotchSource();
    const platform = source.platforms[0];
    const turned = normalizeDeckDesignV3({
      ...source,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingDepth: 48, landingTurn: "left" } } }],
      metadata: { ...source.metadata, revision: source.metadata.revision + 1 },
    });
    const applied = designHistoryReducerV3(createHistoryV3(source), { type: "apply", design: turned });
    const undone = designHistoryReducerV3(applied, { type: "undo" });
    const redone = designHistoryReducerV3(undone, { type: "redo" });
    expect(undone.present.platforms[0].construction.stairs.landingTurn).toBe("straight");
    expect(redone.present.platforms[0].construction.stairs.landingTurn).toBe("left");
    expect(redone.present.platforms[0].construction.stairs.edgeId).toBe(platform.construction.stairs.edgeId);
    expect([applied.present, undone.present, redone.present].map((design) => design.metadata.revision)).toEqual([2, 3, 4]);
  });

  it("undoes and redoes an exact midway-flight split with monotonic revisions", () => {
    const source = safeNotchSource();
    const platform = source.platforms[0];
    const midway = normalizeDeckDesignV3({
      ...source,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingPosition: "midway", upperFlightRisers: 3 } } }],
      metadata: { ...source.metadata, revision: source.metadata.revision + 1 },
    });
    const applied = designHistoryReducerV3(createHistoryV3(source), { type: "apply", design: midway });
    const undone = designHistoryReducerV3(applied, { type: "undo" });
    const redone = designHistoryReducerV3(undone, { type: "redo" });
    expect(undone.present.platforms[0].construction.stairs.landingPosition).toBe("top");
    expect(redone.present.platforms[0].construction.stairs).toMatchObject({ landingPosition: "midway", upperFlightRisers: 3 });
    expect([applied.present, undone.present, redone.present].map((design) => design.metadata.revision)).toEqual([2, 3, 4]);
  });
});
