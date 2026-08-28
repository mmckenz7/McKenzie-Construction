import { describe, expect, it } from "vitest";
import { applyPolygonRegionReplacementV5 } from "../src/commandsV5";
import { deriveDeckDesignProjectionV5 } from "../src/designProjectionV5";
import { applyHouseConnectionV3 } from "../src/houseConnectionV3";
import { createHistoryV5, designHistoryReducerV5 } from "../src/historyV5";
import { resizePolygonEdgeWithHouseAnchorV5 } from "../src/houseBoundaryV5";
import { DEFAULT_DESIGN, updateDesign } from "../src/model";
import { deckDesignV5ToV3Compatibility, migrateDeckDesignToV5, stableDeckDesignV5Json, type DeckDesignV5 } from "../src/modelV5";
import { addBumpoutOnEdge, movePolygonSegment } from "../src/polygonEditorV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

function unlocked(design = migrateDeckDesignToV5(DEFAULT_DESIGN)): DeckDesignV5 {
  return migrateDeckDesignToV5({
    ...design,
    platforms: design.platforms.map((platform) => ({
      ...platform,
      construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [] }, stairSystems: [], edgeFinishes: [] },
    })),
  });
}

function houseIds(design: DeckDesignV5): string[] {
  return design.platforms[0].edgeConditions.filter((condition) => condition.condition === "house_attachment").map((condition) => condition.edgeId);
}

function addLockingSideWall(design: DeckDesignV5, reverse = false): DeckDesignV5 {
  const v3 = deckDesignV5ToV3Compatibility(unlocked(design));
  const edges = deriveGeometricPolygonEdges(v3.platforms[0].region.outer);
  const side = edges.find((edge) => Math.abs(edge.start.x) < .01 && Math.abs(edge.end.x) < .01)!;
  const added = applyHouseConnectionV3(v3, "platform-1", { wallId: null, edgeId: side.id, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
  const walls = reverse ? [...added.siteContext.houseWalls].reverse() : added.siteContext.houseWalls;
  return migrateDeckDesignToV5({ ...added, siteContext: { ...added.siteContext, houseWalls: walls } });
}

describe("v5 immutable house boundaries", () => {
  it("keeps the house edge fixed when either perpendicular rectangle side receives an exact deeper dimension", () => {
    const base = unlocked();
    const platform = base.platforms[0];
    const houseId = houseIds(base)[0];
    const house = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.id === houseId)!;
    const adjacent = deriveGeometricPolygonEdges(platform.region.outer).filter((edge) => edge.id !== houseId && [edge.start, edge.end].some((point) => [house.start, house.end].some((anchor) => point.x === anchor.x && point.z === anchor.z)));
    for (const edge of adjacent) {
      const outer = resizePolygonEdgeWithHouseAnchorV5(platform, edge.id, 180, 6);
      const next = applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer }).design;
      expect(houseIds(next)).toEqual([houseId]);
      expect(deriveGeometricPolygonEdges(next.platforms[0].region.outer)).toContainEqual(house);
      expect(Math.max(...next.platforms[0].region.outer.map((point) => point.z))).toBe(180);
      expect(next.metadata.revision).toBe(base.metadata.revision + 1);
      expect(stableDeckDesignV5Json(next)).toBe(stableDeckDesignV5Json(applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer }).design));
    }
  });

  it("rejects a house move, a crossing free side, and a bumpout on the house with no changed facts or quantities", () => {
    const base = unlocked();
    const platform = base.platforms[0];
    const edges = deriveGeometricPolygonEdges(platform.region.outer);
    const houseIndex = edges.findIndex((edge) => edge.id === houseIds(base)[0]);
    const before = stableDeckDesignV5Json(base);
    const quantities = JSON.stringify(deriveDeckDesignProjectionV5(base).aggregateQuantities);
    const attempts = [
      movePolygonSegment(platform.region.outer, houseIndex, 6, 6),
      platform.region.outer.map((point) => point.z === 144 ? { ...point, z: -12 } : point),
      addBumpoutOnEdge(platform.region.outer, houseIndex, { x: 96, z: 0 }, 6),
    ];
    attempts.forEach((outer) => expect(() => applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer })).toThrow(/recorded house|outside the house/i));
    expect(stableDeckDesignV5Json(base)).toBe(before);
    expect(JSON.stringify(deriveDeckDesignProjectionV5(base).aggregateQuantities)).toBe(quantities);
  });

  it("records one revision, replays deterministically, and restores the anchored rectangle through Undo", () => {
    const base = unlocked();
    const platform = base.platforms[0];
    const side = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.start.x === 192 && edge.end.x === 192)!;
    const outer = resizePolygonEdgeWithHouseAnchorV5(platform, side.id, 180, 6);
    const changed = applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer }).design;
    const applied = designHistoryReducerV5(createHistoryV5(base), { type: "apply", design: changed });
    expect(applied.past).toHaveLength(1);
    expect(applied.present.metadata.revision).toBe(base.metadata.revision + 1);
    const undone = designHistoryReducerV5(applied, { type: "undo" });
    expect(undone.present.platforms[0].region).toEqual(base.platforms[0].region);
    expect(houseIds(undone.present)).toEqual(houseIds(base));
  });

  it("supports an L outline outward depth change and fails closed for an angled custom path", () => {
    const lShape = unlocked(migrateDeckDesignToV5(updateDesign(DEFAULT_DESIGN, { kind: "l-shape", width: 240, projection: 180, cutoutWidth: 72, cutoutDepth: 60 })));
    const left = deriveGeometricPolygonEdges(lShape.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!;
    const outer = resizePolygonEdgeWithHouseAnchorV5(lShape.platforms[0], left.id, 216, 6);
    const next = applyPolygonRegionReplacementV5(lShape, "platform-1", { ...lShape.platforms[0].region, outer }).design;
    expect(Math.max(...next.platforms[0].region.outer.map((point) => point.z))).toBe(216);
    expect(houseIds(next)).toEqual(houseIds(lShape));

    const customOuter = [{ x: 0, z: 0 }, { x: 192, z: 0 }, { x: 168, z: 120 }, { x: 0, z: 144 }];
    const custom = migrateDeckDesignToV5({ ...lShape, platforms: [{ ...lShape.platforms[0], region: { outer: customOuter, holes: [] }, edgeConditions: deriveGeometricPolygonEdges(customOuter).map((edge, index) => ({ edgeId: edge.id, condition: index === 0 ? "house_attachment" : "free", attachment: index === 0 ? "ledger" : "none" })) }] });
    const angled = deriveGeometricPolygonEdges(custom.platforms[0].region.outer)[1];
    expect(() => resizePolygonEdgeWithHouseAnchorV5(custom.platforms[0], angled.id, 180, 6)).toThrow(/square.*side/i);
  });

  it.each([false, true])("locks two perpendicular recorded walls in either wall order (reverse=%s)", (reverse) => {
    const base = addLockingSideWall(unlocked(), reverse);
    const platform = base.platforms[0];
    const ids = houseIds(base);
    expect(ids).toHaveLength(2);
    expect(base.siteContext.houseWalls.map((wall) => wall.id).sort()).toEqual(["house-wall-1", "house-wall-2"]);
    const edges = deriveGeometricPolygonEdges(platform.region.outer);
    const right = edges.find((edge) => edge.start.x === 192 && edge.end.x === 192)!;
    const bottom = edges.find((edge) => edge.start.z === 144 && edge.end.z === 144)!;
    const deeper = applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer: resizePolygonEdgeWithHouseAnchorV5(platform, right.id, 180, 6) }).design;
    const wider = applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer: resizePolygonEdgeWithHouseAnchorV5(platform, bottom.id, 240, 6) }).design;
    expect(Math.max(...deeper.platforms[0].region.outer.map((point) => point.z))).toBe(180);
    expect(Math.max(...wider.platforms[0].region.outer.map((point) => point.x))).toBe(240);
    expect(houseIds(deeper)).toHaveLength(2);
    expect(houseIds(wider)).toHaveLength(2);
    expect(deeper.platforms[0].region.outer).toContainEqual({ x: 0, z: 0 });
    expect(wider.platforms[0].region.outer).toContainEqual({ x: 0, z: 0 });
    const bottomIndex = edges.indexOf(bottom);
    const outward = addBumpoutOnEdge(platform.region.outer, bottomIndex, { x: 96, z: 144 }, 6);
    const expanded = applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer: outward }).design;
    expect(houseIds(expanded)).toEqual(ids);
    expect(expanded.platforms[0].region.outer).toHaveLength(8);
    const throughTop = platform.region.outer.map((point) => point.z === 144 ? { ...point, z: -12 } : point);
    const throughLeft = platform.region.outer.map((point) => point.x === 192 ? { ...point, x: -12 } : point);
    expect(() => applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer: throughTop })).toThrow(/recorded house|outside the house/i);
    expect(() => applyPolygonRegionReplacementV5(base, platform.id, { ...platform.region, outer: throughLeft })).toThrow(/recorded house|outside the house/i);
  });
});
