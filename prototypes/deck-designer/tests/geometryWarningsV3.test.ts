import { describe, expect, it } from "vitest";
import { deriveGeometryWarningsV3 } from "../src/geometryWarningsV3";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";

describe("deterministic single-level geometry warnings", () => {
  it("reports no conflicts for the clean rectangle foundation", () => {
    expect(deriveGeometryWarningsV3(migrateDeckDesignToV3(DEFAULT_DESIGN), "platform-1")).toEqual([]);
  });

  it("warns when two turned stair routes overlap outside adjacent sides", () => {
    const migrated = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const platform = migrated.platforms[0];
    const edges = deriveGeometricPolygonEdges(platform.region.outer);
    const system = (id: string, edgeId: string, offset: number, turn: "left" | "right") => ({
      id, locked: true, edgeId, offset, width: 48, treadDepth: 10, maxRiserHeight: 7.75,
      landings: [{ id: `${id}-landing-1`, locked: true, afterRiser: 0, width: 48, depth: 48, turn, connections: [] }],
    });
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [system("stair-system-1", edges[1].id, 96, "right"), system("stair-system-2", edges[2].id, 0, "left")] } }] });
    const warnings = deriveGeometryWarningsV3(design, platform.id);
    expect(warnings).toEqual([expect.objectContaining({ severity: "collision", geometryIds: ["stair-system-1", "stair-system-2"] })]);
    expect(deriveGeometryWarningsV3(design, platform.id)).toEqual(warnings);
  });

  it("reports a non-blocking clearance note for a cutout near the deck edge", () => {
    const migrated = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const platform = migrated.platforms[0];
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, region: { ...platform.region, holes: [[{ x: 6, z: 48 }, { x: 36, z: 48 }, { x: 36, z: 84 }, { x: 6, z: 84 }]] } }] });
    expect(deriveGeometryWarningsV3(design, platform.id)).toEqual([expect.objectContaining({ id: "cutout-edge-clearance-1", severity: "clearance", message: expect.stringContaining("6 inches") })]);
  });

  it("reports when a recorded cutout interrupts the conceptual beam route", () => {
    const migrated = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const platform = migrated.platforms[0];
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, region: { ...platform.region, holes: [[{ x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 }]] } }] });
    const warnings = deriveGeometryWarningsV3(design, platform.id);
    expect(warnings).toContainEqual(expect.objectContaining({ id: "beam-cutout-interruption-1", severity: "clearance", geometryIds: ["beam", "platform-1:hole-1"] }));
    expect(deriveGeometryWarningsV3(design, platform.id)).toEqual(warnings);
  });

  it("blocks a turned stair route that comes back through an L-shaped deck", () => {
    const migrated = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, kind: "l-shape", width: 240, projection: 180, cutoutWidth: 72, cutoutDepth: 60 } });
    const platform = migrated.platforms[0];
    const notch = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.start.z === 120 && edge.end.z === 120)!;
    const stairSystem = { id: "stair-system-1", locked: true, edgeId: notch.id, offset: 12, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "stair-system-1-landing-1", locked: true, afterRiser: 0, width: 48, depth: 48, turn: "right" as const, connections: [] }] };
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] });
    expect(deriveGeometryWarningsV3(design, platform.id)).toContainEqual(expect.objectContaining({ id: "stair-route-deck-collision-stair-system-1", severity: "collision" }));
  });

  it("blocks a stair route that crosses a separately recorded house wall", () => {
    const migrated = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [...DEFAULT_DESIGN.siteContext.houseWalls, { id: "house-wall-2", start: { x: 60, z: 180 }, end: { x: 132, z: 180 }, baseElevation: 0, height: 120, attachment: "unknown", openings: [] }] } });
    const platform = migrated.platforms[0];
    const bottom = deriveGeometricPolygonEdges(platform.region.outer)[2];
    const stairSystem = { id: "stair-system-1", locked: true, edgeId: bottom.id, offset: 72, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] };
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] });
    expect(deriveGeometryWarningsV3(design, platform.id)).toContainEqual(expect.objectContaining({ id: "stair-route-house-collision-stair-system-1-house-wall-2", severity: "collision" }));
  });
});
