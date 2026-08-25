import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveWarningSelectionV5 } from "../src/warningLocatorV5";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";
import type { GeometryWarningV5 } from "../src/geometryWarningsV5";
import { deriveGeometryWarningsV5 } from "../src/geometryWarningsV5";
import { deriveGeometricPolygonEdges } from "../src/polygon";

describe("v5 contextual warning locator", () => {
  it("selects the exact cutout and beam from stable geometry IDs", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 48 }, { x: 120, z: 48 }, { x: 120, z: 84 }, { x: 72, z: 84 },
    ]] } }] });
    const warning: GeometryWarningV5 = Object.freeze({ id: "beam-note", severity: "clearance", geometryIds: Object.freeze(["beam-line-1", "platform-1:hole-1"]), message: "Review beam and cutout." });
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: 0, beamLineId: "beam-line-1", stairSystemId: null, edgeId: null });
  });

  it("fails closed when warning IDs are stale", () => {
    const platform = migrateDeckDesignToV5(DEFAULT_DESIGN).platforms[0];
    const warning: GeometryWarningV5 = Object.freeze({ id: "stale", severity: "clearance", geometryIds: Object.freeze(["beam-missing", "platform-1:hole-9"]), message: "Stale references." });
    expect(deriveWarningSelectionV5(platform, warning)).toEqual({ holeIndex: null, beamLineId: null, stairSystemId: null, edgeId: null });
  });

  it("selects the authored beam and recorded cutout from a displayed support-footprint review", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 },
    ]] } }] });
    const warning = deriveGeometryWarningsV5(design, platform.id).find((candidate) => candidate.id === "beam-support-cutout-review-beam-line-1-1")!;
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: 0, beamLineId: "beam-line-1", stairSystemId: null, edgeId: null });
  });

  it("selects the exact stair and attached side for a deck-overlap blocker", () => {
    const base = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, kind: "l-shape", width: 240, projection: 180, cutoutWidth: 72, cutoutDepth: 60 } });
    const platform = base.platforms[0];
    const edge = deriveGeometricPolygonEdges(platform.region.outer).find((candidate) => candidate.start.z === 120 && candidate.end.z === 120)!;
    const stairSystem = { id: "stair-system-1", locked: true, edgeId: edge.id, offset: 12, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "stair-system-1-landing-1", locked: true, afterRiser: 0, width: 48, depth: 48, turn: "right" as const, connections: [] }] };
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] });
    const warning = deriveGeometryWarningsV5(design, platform.id).find((candidate) => candidate.id === "stair-route-deck-collision-stair-system-1")!;
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: null, beamLineId: null, stairSystemId: "stair-system-1", edgeId: edge.id });
  });

  it("selects the authoritative stair and side from a wall-crossing blocker while retaining wall traceability", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const edge = deriveGeometricPolygonEdges(platform.region.outer)[2];
    const stairSystem = { id: "stair-system-1", locked: true, edgeId: edge.id, offset: 72, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] };
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] });
    const warning: GeometryWarningV5 = Object.freeze({
      id: "stair-route-house-collision-stair-system-1-house-wall-2",
      severity: "collision",
      geometryIds: Object.freeze(["stair-system-1", "house-wall-2"]),
      message: "Stair crosses recorded wall.",
    });
    expect(warning.geometryIds).toContain("house-wall-2");
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: null, beamLineId: null, stairSystemId: "stair-system-1", edgeId: edge.id });
  });

  it("selects only the authored beam from a beam/wall review while retaining wall traceability", () => {
    const wall = { id: "house-wall-beam", start: { x: 96, z: 60 }, end: { x: 96, z: 180 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [wall] } });
    const warning = deriveGeometryWarningsV5(design, "platform-1").find((candidate) => candidate.id === "beam-house-plan-review-beam-line-1-house-wall-beam")!;
    expect(warning.geometryIds).toContain("house-wall-beam");
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: null, beamLineId: "beam-line-1", stairSystemId: null, edgeId: null });
  });

  it("selects only the authored beam from a displayed support-post/wall review", () => {
    const wall = { id: "house-wall-post", start: { x: 0, z: 100 }, end: { x: 0, z: 140 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [wall] } });
    const warning = deriveGeometryWarningsV5(design, "platform-1").find((candidate) => candidate.id === "beam-support-house-review-beam-line-1-house-wall-post")!;
    expect(warning.geometryIds).toContain("house-wall-post");
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: null, beamLineId: "beam-line-1", stairSystemId: null, edgeId: null });
  });
});
