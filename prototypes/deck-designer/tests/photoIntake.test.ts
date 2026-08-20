// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { DEFAULT_DESIGN } from "../src/model";
import { createDesignFromConfirmedPhotoFacts, normalizeConfirmedPhotoFacts, reviewConfirmedPhotoFacts, reviewPhotoCoverage } from "../src/photoIntake";
import { isRectangleTrace, moveTraceCornerToFeet, moveTraceSegmentToFeet, rectangleTrace, resizeTraceSegmentToFeet, validatePhotoTrace } from "../src/PhotoOutlineTracer";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { deriveDeckAccessoryProjectionV3, stableDeckAccessoryProjectionV3Json } from "../src/quantityProjectionV3";
import { planEdgeDimensionLabel } from "../src/PlanViewV3";

const base = migrateDeckDesignToV3(DEFAULT_DESIGN);

describe("local-only photo-assisted start", () => {
  it("creates exact rectangle geometry only from confirmed dimensional facts", () => {
    const next = createDesignFromConfirmedPhotoFacts(base, {
      designName: "Recent visit",
      layoutIntent: "rectangle",
      width: 144,
      projection: 144,
      surfaceElevation: 52,
      doorWidth: 72,
      attachment: "ledger",
    });
    expect(next.name).toBe("Recent visit");
    expect(next.platforms[0].region.outer).toEqual([{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: 0, z: 144 }]);
    expect(next.platforms[0].elevation).toBe(52);
    expect(next.platforms[0].edgeConditions.find((condition) => condition.condition === "house_attachment")?.attachment).toBe("ledger");
    expect(next.siteContext.houseWalls[0].openings).toEqual([]);
    expect(next.metadata.revision).toBe(base.metadata.revision + 1);
  });

  it("creates a confirmed non-standard polygon instead of a rectangle envelope", () => {
    const base = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const outer = [{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 72 }, { x: 96, z: 72 }, { x: 96, z: 144 }, { x: 0, z: 144 }];
    const next = createDesignFromConfirmedPhotoFacts(base, {
      designName: "Photo trace",
      layoutIntent: "non-standard",
      width: 144,
      projection: 144,
      surfaceElevation: 48,
      doorWidth: 72,
      attachment: "ledger",
    }, outer);
    expect(next.platforms[0].region.outer).toEqual(outer);
    expect(next.platforms[0].region.outer).toHaveLength(6);
    expect(next.platforms[0].construction.stairs.enabled).toBe(false);
    expect(derivePlatformGeometryV3(next, "platform-1").footprint).toEqual(outer);
    const firstProjection = deriveDeckAccessoryProjectionV3(next, "platform-1");
    const replayedProjection = deriveDeckAccessoryProjectionV3(createDesignFromConfirmedPhotoFacts(base, {
      designName: "Photo trace", layoutIntent: "non-standard", width: 144, projection: 144,
      surfaceElevation: 48, doorWidth: 72, attachment: "ledger",
    }, outer), "platform-1");
    expect(stableDeckAccessoryProjectionV3Json(firstProjection)).toBe(stableDeckAccessoryProjectionV3Json(replayedProjection));
    expect(reviewConfirmedPhotoFacts({ designName: "Photo trace", layoutIntent: "non-standard", width: 144, projection: 144, surfaceElevation: 48, doorWidth: 72, attachment: "ledger" }, true).outlineWarning).toBeNull();
  });

  it("carries a user-selected exact stair side from the confirmed outline", () => {
    const outer = [{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 72 }, { x: 96, z: 72 }, { x: 96, z: 144 }, { x: 0, z: 144 }];
    const edges = deriveGeometricPolygonEdges(outer);
    const stairEdge = edges[2];
    const facts = { designName: "Stair photo trace", layoutIntent: "non-standard" as const, width: 144, projection: 144, surfaceElevation: 48, doorWidth: null, attachment: "ledger" as const };
    const next = createDesignFromConfirmedPhotoFacts(base, facts, outer, stairEdge.id);
    expect(next.platforms[0].construction.stairs).toMatchObject({ enabled: true, edgeId: stairEdge.id, offset: 0 });
    expect(derivePlatformGeometryV3(next, "platform-1").stairTreads.length).toBeGreaterThan(0);
    expect(() => createDesignFromConfirmedPhotoFacts(base, facts, outer, "missing-edge")).toThrow(/no longer exists/i);
    expect(() => createDesignFromConfirmedPhotoFacts(base, facts, outer, edges[0].id)).toThrow(/no longer exists/i);
  });

  it("keeps one straight house edge while allowing an aligned corner to extend it", () => {
    const rectangle = rectangleTrace(144, 144);
    expect(isRectangleTrace(rectangle, 144, 144)).toBe(true);
    expect(validatePhotoTrace(rectangle)).toEqual(rectangle);
    const extended = [{ x: -24, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: -24, z: 144 }];
    expect(validatePhotoTrace(extended)).toEqual(extended);
    const alignedStep = [{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: 0, z: 144 }, { x: 0, z: 60 }, { x: -24, z: 60 }, { x: -24, z: 0 }];
    expect(validatePhotoTrace(alignedStep)).toEqual([{ x: -24, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: 0, z: 144 }, { x: 0, z: 60 }, { x: -24, z: 60 }]);
    expect(() => validatePhotoTrace([{ x: 0, z: 6 }, { x: 144, z: 6 }, { x: 144, z: 144 }, { x: 0, z: 144 }])).toThrow(/house line/i);
  });

  it("records the extended aligned edge as the exact house attachment", () => {
    const outer = [{ x: -24, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: -24, z: 144 }];
    const next = createDesignFromConfirmedPhotoFacts(base, { designName: "Aligned corner", layoutIntent: "non-standard", width: 144, projection: 144, surfaceElevation: 48, doorWidth: null, attachment: "ledger" }, outer);
    const house = next.platforms[0].edgeConditions.find((condition) => condition.condition === "house_attachment");
    expect(house?.attachment).toBe("ledger");
    expect(next.platforms[0].region.outer).toEqual(outer);
  });

  it("places bumpout edges and corners at exact feet-based dimensions", () => {
    const bumpout = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 144 }, { x: 132, z: 144 }, { x: 132, z: 150 }, { x: 108, z: 150 }, { x: 108, z: 144 }, { x: 0, z: 144 }];
    const deepened = moveTraceSegmentToFeet(bumpout, 4, 18);
    expect(deepened[4].z).toBe(216);
    expect(deepened[5].z).toBe(216);
    const exactCorner = moveTraceCornerToFeet(deepened, 4, 10.5, 18);
    expect(exactCorner[4]).toEqual({ x: 126, z: 216 });
  });

  it("moves both ends of a traced segment and updates both attached side lengths", () => {
    const stepped = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 144 }, { x: 120, z: 144 }, { x: 120, z: 90 }, { x: 0, z: 90 }];
    const moved = moveTraceSegmentToFeet(stepped, 2, 11);
    expect(moved[2]).toEqual({ x: 240, z: 132 });
    expect(moved[3]).toEqual({ x: 120, z: 132 });
    expect(deriveGeometricPolygonEdges(moved).map((edge) => edge.length)).toEqual([240, 132, 120, 42, 120, 90]);
  });

  it("places the right-side length outside the edge and keeps it readable", () => {
    const right = deriveGeometricPolygonEdges(rectangleTrace(240, 144))[1];
    expect(planEdgeDimensionLabel(right)).toEqual({ x: 258, z: 72, angle: 90, text: "12′ 0″" });
  });

  it("resizes a tapped segment to an exact length while keeping its following side attached", () => {
    const stepped = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 144 }, { x: 120, z: 144 }, { x: 120, z: 90 }, { x: 0, z: 90 }];
    const resized = resizeTraceSegmentToFeet(stepped, 2, 8);
    expect(resized[2]).toEqual({ x: 240, z: 144 });
    expect(resized[3]).toEqual({ x: 144, z: 144 });
    expect(resized[4]).toEqual({ x: 144, z: 90 });
    expect(deriveGeometricPolygonEdges(resized).map((edge) => edge.length)).toEqual([240, 144, 96, 54, 144, 90]);
  });

  it("carries the existing height only when the intake leaves height unknown", () => {
    const next = createDesignFromConfirmedPhotoFacts(base, {
      designName: "Manual start",
      layoutIntent: "rectangle",
      width: 144,
      projection: 144,
      surfaceElevation: null,
      doorWidth: null,
      attachment: "unknown",
    });
    expect(next.platforms[0].elevation).toBe(base.platforms[0].elevation);
    expect(reviewConfirmedPhotoFacts({ designName: "Manual start", layoutIntent: "rectangle", width: 144, projection: 144, surfaceElevation: null, doorWidth: null, attachment: "unknown" }).fieldVerification.join(" ")).toMatch(/height.*current design|attachment remains unknown/i);
  });

  it("normalizes exact facts and rejects unsupported or incomplete entries", () => {
    expect(normalizeConfirmedPhotoFacts({ designName: "  Job visit  ", layoutIntent: "rectangle", width: 144, projection: 144, surfaceElevation: 48, doorWidth: 72, attachment: "non-ledger" }).designName).toBe("Job visit");
    expect(() => normalizeConfirmedPhotoFacts({ designName: "", layoutIntent: "rectangle", width: 144, projection: 144, surfaceElevation: null, doorWidth: null, attachment: "unknown" })).toThrow(/name/i);
    expect(() => normalizeConfirmedPhotoFacts({ designName: "Job", layoutIntent: "rectangle", width: 24, projection: 144, surfaceElevation: null, doorWidth: null, attachment: "unknown" })).toThrow(/width/i);
  });

  it("reviews non-standard photo coverage without blocking manual design", () => {
    const incomplete = reviewPhotoCoverage("non-standard", ["wide-site", "house-connection"], 1);
    expect(incomplete.addedCount).toBe(3);
    expect(incomplete.missingRecommendedRoles).toEqual(["left-corner", "right-corner", "elevated-overview"]);
    expect(incomplete.message).toMatch(/3 recommended/i);
    const complete = reviewPhotoCoverage("non-standard", ["wide-site", "house-connection", "left-corner", "right-corner", "elevated-overview"], 2);
    expect(complete.missingRecommendedRoles).toEqual([]);
    expect(complete.message).toMatch(/good multi-angle/i);
    expect(reviewPhotoCoverage("rectangle", [], 0).message).toMatch(/manual design remains available/i);
  });
});
