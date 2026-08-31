// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveHouseConnectionDraft, applyHouseConnectionV3, removeHouseConnectionV3 } from "../src/houseConnectionV3";
import { deriveHouseContextGeometry } from "../src/houseContextGeometry";
import { createHistoryV3, designHistoryReducerV3 } from "../src/historyV3";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, stableDeckDesignV3Json } from "../src/modelV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

const base = migrateDeckDesignToV3(DEFAULT_DESIGN);
const platform = base.platforms[0];
const houseEdge = platform.edgeConditions.find((condition) => condition.condition === "house_attachment")!;

describe("v3 house connection", () => {
  it("records an exact ledger edge and positioned door with one revision", () => {
    const next = applyHouseConnectionV3(base, platform.id, { edgeId: houseEdge.edgeId, attachment: "ledger", doorEnabled: true, doorOffset: 24, doorWidth: 72 });
    const wall = next.siteContext.houseWalls[0];
    const door = wall.openings.find((opening) => opening.kind === "door")!;
    expect(next.metadata.revision).toBe(base.metadata.revision + 1);
    expect(next.platforms[0].edgeConditions.find((condition) => condition.edgeId === houseEdge.edgeId)).toMatchObject({ condition: "house_attachment", attachment: "ledger" });
    expect(wall).toMatchObject({ start: { x: -60, z: 0 }, end: { x: 252, z: 0 }, attachment: "ledger" });
    expect(door).toMatchObject({ offset: 84, width: 72, sillHeight: 48, height: 80 });
  });

  it("projects the same wall and door deterministically into 2D and 3D panels", () => {
    const next = applyHouseConnectionV3(base, platform.id, { edgeId: houseEdge.edgeId, attachment: "ledger", doorEnabled: true, doorOffset: 24, doorWidth: 72 });
    const first = deriveHouseContextGeometry(next.siteContext);
    const replayed = deriveHouseContextGeometry(JSON.parse(stableDeckDesignV3Json(next)).siteContext);
    expect(first).toEqual(replayed);
    expect(first.houseOpenings).toEqual([expect.objectContaining({ kind: "door", start: { x: 24, z: 0 }, end: { x: 96, z: 0 }, sillElevation: 48 })]);
    expect(first.houseWallPanels).toHaveLength(4);
  });

  it("derives editable feet-ready facts from the recorded wall", () => {
    const next = applyHouseConnectionV3(base, platform.id, { edgeId: houseEdge.edgeId, attachment: "non-ledger", doorEnabled: true, doorOffset: 36, doorWidth: 60 });
    expect(deriveHouseConnectionDraft(next, platform.id)).toMatchObject({ edgeId: houseEdge.edgeId, attachment: "non-ledger", doorEnabled: true, doorOffset: 36, doorWidth: 60, edgeLength: 192 });
  });

  it("rejects a door that does not fit the selected house side", () => {
    expect(() => applyHouseConnectionV3(base, platform.id, { edgeId: houseEdge.edgeId, attachment: "ledger", doorEnabled: true, doorOffset: 150, doorWidth: 72 })).toThrow(/fit this side/i);
  });

  it("does not silently replace a railing or stair reference with a house attachment", () => {
    const railedEdge = platform.construction.railing.enabledEdgeIds[0];
    expect(() => applyHouseConnectionV3(base, platform.id, { edgeId: railedEdge, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 })).toThrow(/remove railings or stairs/i);
  });

  it("atomically replaces only the selected railing after explicit intent", () => {
    const side = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.start.x === edge.end.x)!.id;
    const before = stableDeckDesignV3Json(base);
    const added = applyHouseConnectionV3(base, platform.id, { wallId: null, edgeId: side, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72, removeRailing: true });
    expect(stableDeckDesignV3Json(base)).toBe(before);
    expect(added.metadata.revision).toBe(base.metadata.revision + 1);
    expect(added.siteContext.houseWalls.map((wall) => wall.id)).toEqual(["house-wall-1", "house-wall-2"]);
    expect(added.platforms[0].construction.railing.enabledEdgeIds).toEqual(platform.construction.railing.enabledEdgeIds.filter((edgeId) => edgeId !== side));
    expect(added.platforms[0].edgeConditions.find((condition) => condition.edgeId === side)).toMatchObject({ condition: "house_attachment", attachment: "ledger" });
    const applied = designHistoryReducerV3(createHistoryV3(base), { type: "apply", design: added });
    expect(designHistoryReducerV3(applied, { type: "undo" }).present.platforms[0].construction.railing.enabledEdgeIds).toEqual(platform.construction.railing.enabledEdgeIds);
    const redone = designHistoryReducerV3(designHistoryReducerV3(applied, { type: "undo" }), { type: "redo" });
    expect({ ...redone.present, metadata: added.metadata }).toEqual(added);
  });

  it("keeps stairs and the complete rejected design unchanged", () => {
    const edgeId = platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const stairSystem = { id: "stair-system-test", locked: false, edgeId, offset: 24, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] } as const;
    const withStairs = { ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] };
    const before = stableDeckDesignV3Json(withStairs);
    expect(() => applyHouseConnectionV3(withStairs, platform.id, { wallId: null, edgeId, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72, removeRailing: true })).toThrow(/remove railings or stairs/i);
    expect(stableDeckDesignV3Json(withStairs)).toBe(before);
  });

  it("does not silently move recorded windows when the house side changes", () => {
    const withWindow = migrateDeckDesignToV3({
      ...DEFAULT_DESIGN,
      siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [{ ...DEFAULT_DESIGN.siteContext.houseWalls[0], openings: [{ id: "window-1", kind: "window", offset: 96, width: 36, sillHeight: 60, height: 36 }] }] },
    });
    const freeEdge = withWindow.platforms[0].edgeConditions.find((condition) => condition.condition === "free" && !withWindow.platforms[0].construction.railing.enabledEdgeIds.includes(condition.edgeId))?.edgeId;
    expect(freeEdge).toBeUndefined();
    const editable = { ...withWindow, platforms: [{ ...withWindow.platforms[0], construction: { ...withWindow.platforms[0].construction, railing: { ...withWindow.platforms[0].construction.railing, enabledEdgeIds: [] } } }] };
    const nextSide = editable.platforms[0].edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    expect(() => applyHouseConnectionV3(editable, platform.id, { edgeId: nextSide, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 })).toThrow(/move recorded windows/i);
  });

  it("adds and independently edits a second perpendicular wall without replacing the first", () => {
    const editable = { ...base, platforms: [{ ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [] }, stairSystems: [] } }] };
    const side = deriveGeometricPolygonEdges(editable.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!.id;
    const added = applyHouseConnectionV3(editable, platform.id, { wallId: null, edgeId: side, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    expect(added.siteContext.houseWalls.map((wall) => wall.id)).toEqual(["house-wall-1", "house-wall-2"]);
    expect(added.platforms[0].edgeConditions.filter((condition) => condition.condition === "house_attachment")).toHaveLength(2);
    expect(deriveHouseConnectionDraft(added, platform.id, "house-wall-1").edgeId).toBe(houseEdge.edgeId);
    expect(deriveHouseConnectionDraft(added, platform.id, "house-wall-2").edgeId).toBe(side);
    const revised = applyHouseConnectionV3(added, platform.id, { wallId: "house-wall-2", edgeId: side, attachment: "non-ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    expect(revised.siteContext.houseWalls.find((wall) => wall.id === "house-wall-1")).toEqual(added.siteContext.houseWalls[0]);
    expect(revised.siteContext.houseWalls.find((wall) => wall.id === "house-wall-2")?.attachment).toBe("non-ledger");
  });

  it("removes only the selected extra wall and restores its exact side to free", () => {
    const editable = { ...base, platforms: [{ ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [] }, stairSystems: [] } }] };
    const side = deriveGeometricPolygonEdges(editable.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!.id;
    const added = applyHouseConnectionV3(editable, platform.id, { wallId: null, edgeId: side, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    const removed = removeHouseConnectionV3(added, platform.id, "house-wall-2");
    expect(removed.metadata.revision).toBe(added.metadata.revision + 1);
    expect(removed.siteContext.houseWalls).toEqual([added.siteContext.houseWalls[0]]);
    expect(removed.platforms[0].edgeConditions.find((condition) => condition.edgeId === side)).toMatchObject({ condition: "free", attachment: "none" });
    expect(removed.platforms[0].edgeConditions.find((condition) => condition.edgeId === houseEdge.edgeId)).toEqual(added.platforms[0].edgeConditions.find((condition) => condition.edgeId === houseEdge.edgeId));
    expect(stableDeckDesignV3Json(removeHouseConnectionV3(added, platform.id, "house-wall-2"))).toBe(stableDeckDesignV3Json(removed));
  });

  it("restores the removed wall and exact edge condition through Undo and Redo", () => {
    const editable = { ...base, platforms: [{ ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [] }, stairSystems: [] } }] };
    const side = deriveGeometricPolygonEdges(editable.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!.id;
    const added = applyHouseConnectionV3(editable, platform.id, { wallId: null, edgeId: side, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    const removed = removeHouseConnectionV3(added, platform.id, "house-wall-2");
    const applied = designHistoryReducerV3(createHistoryV3(added), { type: "apply", design: removed });
    const undone = designHistoryReducerV3(applied, { type: "undo" });
    const redone = designHistoryReducerV3(undone, { type: "redo" });
    expect({ ...undone.present, metadata: added.metadata }).toEqual(added);
    expect({ ...redone.present, metadata: removed.metadata }).toEqual(removed);
  });

  it("rejects removal of the last wall or a missing wall without changing recorded facts", () => {
    const before = stableDeckDesignV3Json(base);
    expect(() => removeHouseConnectionV3(base, platform.id, "house-wall-1")).toThrow(/keep one/i);
    expect(() => removeHouseConnectionV3({ ...base, siteContext: { ...base.siteContext, houseWalls: [...base.siteContext.houseWalls, { ...base.siteContext.houseWalls[0], id: "house-wall-2" }] } }, platform.id, "missing-wall")).toThrow(/needs review/i);
    expect(stableDeckDesignV3Json(base)).toBe(before);
  });
});
