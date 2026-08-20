// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveHouseConnectionDraft, applyHouseConnectionV3 } from "../src/houseConnectionV3";
import { deriveHouseContextGeometry } from "../src/houseContextGeometry";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, stableDeckDesignV3Json } from "../src/modelV3";

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
    expect(() => applyHouseConnectionV3(base, platform.id, { edgeId: houseEdge.edgeId, attachment: "ledger", doorEnabled: true, doorOffset: 150, doorWidth: 72 })).toThrow(/fit completely/i);
  });

  it("does not silently replace a railing or stair reference with a house attachment", () => {
    const railedEdge = platform.construction.railing.enabledEdgeIds[0];
    expect(() => applyHouseConnectionV3(base, platform.id, { edgeId: railedEdge, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 })).toThrow(/remove railings or stairs/i);
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
});
