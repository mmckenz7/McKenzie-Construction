import { describe, expect, it } from "vitest";
import { deriveGeometryWarningsV3, positiveRegionOverlapArea } from "../src/geometryWarningsV3";
import { deriveLayoutReviewV3 } from "../src/layoutReviewV3";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";

describe("deterministic single-level geometry warnings", () => {
  it("measures narrow angled overlap while allowing boundary contact and cutout-only passage", () => {
    const outer = [{ x: 0, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 120 }, { x: 0, z: 120 }];
    const narrowAngledCrossing = [{ x: -103, z: 23 }, { x: -97, z: 17 }, { x: 33, z: 137 }, { x: 27, z: 143 }];
    const boundaryContact = [{ x: 120, z: 20 }, { x: 150, z: 20 }, { x: 150, z: 60 }, { x: 120, z: 60 }];
    const hole = [{ x: 40, z: 40 }, { x: 80, z: 40 }, { x: 80, z: 80 }, { x: 40, z: 80 }];
    const insideHole = [{ x: 50, z: 50 }, { x: 70, z: 50 }, { x: 70, z: 70 }, { x: 50, z: 70 }];
    const measured = positiveRegionOverlapArea(narrowAngledCrossing, outer, []);
    expect(measured).toBeGreaterThan(0);
    expect(positiveRegionOverlapArea(narrowAngledCrossing, outer, [])).toBe(measured);
    expect(positiveRegionOverlapArea(boundaryContact, outer, [])).toBe(0);
    expect(positiveRegionOverlapArea(insideHole, outer, [hole])).toBe(0);
    expect(() => positiveRegionOverlapArea([{ x: 0, z: 0 }, { x: 12, z: 12 }, { x: 0, z: 12 }, { x: 12, z: 0 }], outer, [])).toThrow(/intersect/i);
  });

  it("reports no conflicts for the clean rectangle foundation", () => {
    expect(deriveGeometryWarningsV3(migrateDeckDesignToV3(DEFAULT_DESIGN), "platform-1")).toEqual([]);
  });

  it("reports a measured non-blocking plan review when a vertically applicable wall passes through the solid deck region", () => {
    const crossingWall = { id: "house-wall-crossing", start: { x: -12, z: 72 }, end: { x: 204, z: 72 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [crossingWall] } });
    expect(deriveGeometryWarningsV3(design, "platform-1")).toContainEqual(expect.objectContaining({
      id: "platform-house-plan-review-platform-1-house-wall-crossing",
      severity: "clearance",
      geometryIds: ["platform-1", "house-wall-crossing"],
      message: expect.stringContaining("192 inches through the deck surface projection"),
    }));
    const review = deriveLayoutReviewV3(design, "platform-1");
    expect(review.readyToContinue).toBe(true);
    expect(review.fieldVerification).toContainEqual(expect.stringContaining("house-wall-crossing"));
  });

  it("allows exact deck-boundary contact and wall spans entirely above, below, or ending at deck elevation", () => {
    const walls = [
      DEFAULT_DESIGN.siteContext.houseWalls[0],
      { id: "house-wall-above", start: { x: -12, z: 72 }, end: { x: 204, z: 72 }, baseElevation: 60, height: 60, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-below", start: { x: -12, z: 84 }, end: { x: 204, z: 84 }, baseElevation: -60, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-top-contact", start: { x: -12, z: 96 }, end: { x: 204, z: 96 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
    ];
    const design = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: walls } });
    expect(deriveGeometryWarningsV3(design, "platform-1").filter((warning) => warning.id.startsWith("platform-house-plan-review-"))).toEqual([]);
  });

  it("excludes cutout voids and recorded opening-only passage from wall/platform plan review", () => {
    const wallThroughCutout = { id: "house-wall-cutout", start: { x: 78, z: 72 }, end: { x: 114, z: 72 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] };
    const wallWithDoor = {
      id: "house-wall-door", start: { x: -12, z: 108 }, end: { x: 204, z: 108 }, baseElevation: 0, height: 120, attachment: "unknown" as const,
      openings: [{ id: "door-1", kind: "door" as const, offset: 12, width: 192, sillHeight: 0, height: 80 }],
    };
    const migrated = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [wallThroughCutout, wallWithDoor] } });
    const platform = migrated.platforms[0];
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 48 }, { x: 120, z: 48 }, { x: 120, z: 96 }, { x: 72, z: 96 },
    ]] } }] });
    expect(deriveGeometryWarningsV3(design, platform.id).filter((warning) => warning.id.startsWith("platform-house-plan-review-"))).toEqual([]);
  });

  it("deduplicates split wall panels and preserves deterministic authored-wall warning order for rectangle and L-shape", () => {
    const splitWall = {
      id: "house-wall-z-split", start: { x: -12, z: 72 }, end: { x: 204, z: 72 }, baseElevation: 0, height: 120, attachment: "unknown" as const,
      openings: [{ id: "door-1", kind: "door" as const, offset: 96, width: 24, sillHeight: 0, height: 80 }],
    };
    const otherWall = { id: "house-wall-a-other", start: { x: -12, z: 108 }, end: { x: 204, z: 108 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] };
    const rectangle = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [splitWall, otherWall] } });
    const rectangleWarnings = deriveGeometryWarningsV3(rectangle, "platform-1").filter((warning) => warning.id.startsWith("platform-house-plan-review-"));
    expect(rectangleWarnings).toEqual([
      expect.objectContaining({ id: "platform-house-plan-review-platform-1-house-wall-a-other" }),
      expect.objectContaining({ id: "platform-house-plan-review-platform-1-house-wall-z-split", message: expect.stringContaining("168 inches") }),
    ]);
    expect(deriveGeometryWarningsV3(rectangle, "platform-1")).toEqual(deriveGeometryWarningsV3(rectangle, "platform-1"));

    const lShape = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, kind: "l-shape", width: 240, projection: 180, cutoutWidth: 72, cutoutDepth: 60 }, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [{ ...splitWall, id: "house-wall-l", end: { x: 252, z: 72 } }] } });
    expect(deriveGeometryWarningsV3(lShape, "platform-1")).toContainEqual(expect.objectContaining({ id: "platform-house-plan-review-platform-1-house-wall-l", severity: "clearance" }));
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

  it("reports every distinct recorded house wall crossed by one stair route", () => {
    const crossedWalls = [
      { id: "house-wall-near", start: { x: 60, z: 180 }, end: { x: 132, z: 180 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-far", start: { x: 60, z: 200 }, end: { x: 132, z: 200 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] },
    ];
    const migrated = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [...DEFAULT_DESIGN.siteContext.houseWalls, ...crossedWalls] } });
    const platform = migrated.platforms[0];
    const bottom = deriveGeometricPolygonEdges(platform.region.outer)[2];
    const stairSystem = { id: "stair-system-1", locked: true, edgeId: bottom.id, offset: 72, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] };
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] });
    const warnings = deriveGeometryWarningsV3(design, platform.id).filter((warning) => warning.id.startsWith("stair-route-house-collision-"));
    expect(warnings).toEqual([
      expect.objectContaining({ id: "stair-route-house-collision-stair-system-1-house-wall-far", geometryIds: ["stair-system-1", "house-wall-far"] }),
      expect.objectContaining({ id: "stair-route-house-collision-stair-system-1-house-wall-near", geometryIds: ["stair-system-1", "house-wall-near"] }),
    ]);
    expect(deriveGeometryWarningsV3(design, platform.id)).toEqual(deriveGeometryWarningsV3(design, platform.id));
    const review = deriveLayoutReviewV3(design, platform.id);
    expect(review.readyToContinue).toBe(false);
    expect(review.blockers.filter((blocker) => blocker.includes("crosses a recorded house wall"))).toHaveLength(2);
  });

  it("deduplicates split panels from one authored wall and allows exact stair-boundary contact", () => {
    const houseWalls = [
      {
        id: "house-wall-split", start: { x: 60, z: 180 }, end: { x: 132, z: 180 }, baseElevation: 0, height: 120, attachment: "unknown" as const,
        openings: [{ id: "door-gap", kind: "door" as const, offset: 30, width: 12, sillHeight: 0, height: 80 }],
      },
      { id: "house-wall-contact", start: { x: 60, z: 144 }, end: { x: 132, z: 144 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] },
    ];
    const migrated = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls } });
    const platform = migrated.platforms[0];
    const bottom = deriveGeometricPolygonEdges(platform.region.outer)[2];
    const stairSystem = { id: "stair-system-1", locked: true, edgeId: bottom.id, offset: 72, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] };
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [stairSystem] } }] });
    const warnings = deriveGeometryWarningsV3(design, platform.id).filter((warning) => warning.id.startsWith("stair-route-house-collision-"));
    expect(warnings).toEqual([
      expect.objectContaining({ id: "stair-route-house-collision-stair-system-1-house-wall-split", geometryIds: ["stair-system-1", "house-wall-split"] }),
    ]);
  });

  it("fails closed when house context geometry is invalid", () => {
    const migrated = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const invalid = { ...migrated, siteContext: { ...migrated.siteContext, houseWalls: [{ ...migrated.siteContext.houseWalls[0], end: migrated.siteContext.houseWalls[0].start }] } };
    expect(() => deriveGeometryWarningsV3(invalid as typeof migrated, migrated.platforms[0].id)).toThrow();
  });
});
