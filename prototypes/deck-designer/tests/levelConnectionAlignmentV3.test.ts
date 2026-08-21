import { describe, expect, it } from "vitest";
import { alignLevelConnectionV3 } from "../src/levelConnectionAlignmentV3";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";
import { DEFAULT_DESIGN } from "../src/model";
import { addPlatformLevelV3 } from "../src/platformCommandsV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

describe("level connection alignment", () => {
  it("moves the destination layer so its selected free side meets the connected stair endpoint", () => {
    const base = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, surfaceElevation: 120 } });
    const added = addPlatformLevelV3(base, "platform-1", "platform-2", 48, { x: 0, z: 0 }).design;
    const source = added.platforms[0], target = added.platforms[1];
    const edgeId = source.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const targetEdgeId = target.edgeConditions[0].edgeId;
    const system = { id: "stair-system-1", locked: false, edgeId, offset: 48, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "landing-1", locked: true, afterRiser: 8, width: 48, depth: 48, turn: "straight" as const, connections: [{ id: "level-link", locked: true, destination: "deck" as const, direction: "left" as const, width: 48, treadDepth: 10, targetPlatformId: target.id, targetEdgeId }] }] };
    const design = normalizeDeckDesignV3({ ...added, platforms: [{ ...source, construction: { ...source.construction, stairSystems: [system] } }, target] });
    const aligned = alignLevelConnectionV3(design, source.id, system.id, "landing-1", "level-link");
    const geometry = derivePlatformGeometryV3(aligned.design, source.id);
    const ends = geometry.stairStringers.filter((stringer) => stringer.id.includes("level-link")).map((stringer) => stringer.end);
    const edge = deriveGeometricPolygonEdges(aligned.design.platforms[1].region.outer).find((item) => item.id === aligned.design.platforms[0].construction.stairSystems[0].landings[0].connections[0].targetEdgeId)!;
    expect((ends[0].x + ends[1].x) / 2).toBeCloseTo((edge.start.x + edge.end.x) / 2);
    expect((ends[0].z + ends[1].z) / 2).toBeCloseTo((edge.start.z + edge.end.z) / 2);
    expect(aligned.design.metadata.revision).toBe(design.metadata.revision + 1);
    expect(alignLevelConnectionV3(design, source.id, system.id, "landing-1", "level-link")).toEqual(aligned);
  });
});
