import { describe, expect, it } from "vitest";
import { fitConnectedStairAssemblyV3 } from "../src/connectedStairAssemblyV3";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, normalizeDeckDesignV3, type StairSystemV3 } from "../src/modelV3";
import { addPlatformLevelV3 } from "../src/platformCommandsV3";
import { deriveGeometricPolygonEdges, type PolygonEdge, type PolygonPoint } from "../src/polygon";

function distanceToEdge(point: PolygonPoint, edge: PolygonEdge): number {
  const dx = edge.end.x - edge.start.x, dz = edge.end.z - edge.start.z;
  const lengthSquared = dx * dx + dz * dz;
  const ratio = Math.max(0, Math.min(1, ((point.x - edge.start.x) * dx + (point.z - edge.start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (edge.start.x + ratio * dx), point.z - (edge.start.z + ratio * dz));
}

describe("fixed-level connected stair assembly", () => {
  it("turns from an upper landing and meets a lower landing without moving either deck", () => {
    const base = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, surfaceElevation: 168 } });
    const added = addPlatformLevelV3(base, "platform-1", "platform-2", 48, { x: 0, z: 0 }).design;
    const source = added.platforms[0], target = added.platforms[1];
    const originalRegions = added.platforms.map((platform) => platform.region);
    const sourceEdge = deriveGeometricPolygonEdges(source.region.outer).find((edge) => edge.outward.z > .9)!;
    const targetEdges = deriveGeometricPolygonEdges(target.region.outer).filter((edge) => target.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "free"));
    const riserCount = Math.ceil((source.elevation - target.elevation) / 7.75);
    const fit = fitConnectedStairAssemblyV3({ sourceEdge, targetEdges, riserCount, width: 48, preferredOffset: 48 });
    const system: StairSystemV3 = {
      id: "fixed-level-stairs", locked: false, edgeId: sourceEdge.id, offset: fit.offset, width: 48,
      treadDepth: fit.treadDepth, maxRiserHeight: 7.75,
      landings: [
        { id: "upper-top-landing", locked: true, afterRiser: 0, width: 48, depth: fit.topLandingDepth, turn: fit.turn, connections: [] },
        { id: "lower-top-landing", locked: true, afterRiser: riserCount, width: 48, depth: 48, turn: "straight", connections: [], terminalPlatformId: target.id, terminalEdgeId: fit.targetEdgeId },
      ],
    };
    const design = normalizeDeckDesignV3({ ...added, platforms: [{ ...source, construction: { ...source.construction, stairSystems: [system] } }, target] });
    const geometry = derivePlatformGeometryV3(design, source.id);
    const lowerLanding = geometry.landings.at(-1)!;
    const targetEdge = targetEdges.find((edge) => edge.id === fit.targetEdgeId)!;

    expect(fit.turn).not.toBe("straight");
    expect(geometry.landings.map((landing) => landing.y)).toEqual([168, 48]);
    expect(geometry.stairTreads).toHaveLength(riserCount);
    expect(Math.min(distanceToEdge(lowerLanding.corners[0], targetEdge), distanceToEdge(lowerLanding.corners[1], targetEdge))).toBeLessThanOrEqual(6);
    expect(design.platforms.map((platform) => platform.region)).toEqual(originalRegions);
  });

  it("rejects a requested exact target when the fixed decks cannot be joined within tolerance", () => {
    const sourceEdge: PolygonEdge = { id: "source", start: { x: 0, z: 0 }, end: { x: 120, z: 0 }, length: 120, outward: { x: 0, z: 1 } };
    const targetEdge: PolygonEdge = { id: "target", start: { x: 1000, z: 1000 }, end: { x: 1120, z: 1000 }, length: 120, outward: { x: 0, z: -1 } };
    expect(() => fitConnectedStairAssemblyV3({ sourceEdge, targetEdges: [targetEdge], riserCount: 12, width: 48 })).toThrow(/different stair side|another landing|level-position adjustment/);
  });
});
