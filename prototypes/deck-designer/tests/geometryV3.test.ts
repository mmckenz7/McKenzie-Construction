// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometry } from "../src/geometry";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { stairOffsetFromPoint } from "../src/editor";
import { normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3, normalizeDeckDesignV3, stableDeckDesignV3Json } from "../src/modelV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";
import multiWallContextFixture from "./fixtures/multi-wall-context.json";

const fixtures = [rectangleFoundationFixture, lShapeLandingFixture, multiWallContextFixture];
const totalLength = (members: readonly Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>[]) =>
  Math.round(members.reduce((sum, member) => sum + Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z), 0) * 100) / 100;

describe("v3 free-edge geometry equivalence", () => {
  it("moves stairs within exact geometric-edge bounds", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = design.platforms[0];
    const geometry = derivePlatformGeometryV3(design, platform.id);
    const edge = geometry.platformEdges.find((item) => item.id === platform.construction.stairs.edgeId)!;
    expect(stairOffsetFromPoint(edge, platform.construction.stairs.width, edge.start, 6)).toBe(0);
    const farPoint = { x: edge.end.x + (edge.end.x - edge.start.x) * 10, z: edge.end.z + (edge.end.z - edge.start.z) * 10 };
    expect(stairOffsetFromPoint(edge, platform.construction.stairs.width, farPoint, 6)).toBe(edge.length - platform.construction.stairs.width);
  });
  it.each(fixtures)("preserves $design.name railing, stair, and landing geometry", (fixture) => {
    const v2 = normalizeDesign(fixture.design);
    const oldGeometry = deriveGeometry(v2);
    const v3 = migrateDeckDesignToV3(v2);
    const geometry = derivePlatformGeometryV3(v3, "platform-1");
    expect(geometry.footprint).toEqual(oldGeometry.footprint);
    expect(geometry.railSegments).toHaveLength(oldGeometry.railSegments.length);
    expect(totalLength(geometry.railSegments)).toBe(totalLength(oldGeometry.railSegments));
    expect(geometry.railPosts).toHaveLength(oldGeometry.railPosts.length);
    expect(geometry.stairTreads).toEqual(oldGeometry.stairTreads);
    expect(geometry.stairStringers).toEqual(oldGeometry.stairStringers);
    expect(geometry.stairRise).toBe(oldGeometry.stairRise);
    if (oldGeometry.landing) {
      expect(geometry.landing).toMatchObject(oldGeometry.landing);
      expect(geometry.landing?.position).toBe("top");
    } else {
      expect(geometry.landing).toBeNull();
    }
    expect(geometry.landingRailSegments).toEqual(oldGeometry.landingRailSegments);
    expect(geometry.landingRailPosts).toEqual(oldGeometry.landingRailPosts);
    expect(geometry.landingSupportPosts).toEqual(oldGeometry.landingSupportPosts);
  });

  it("fails clearly for an unknown platform", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    expect(() => derivePlatformGeometryV3(design, "missing")).toThrow(/does not exist/);
  });

  it("projects two deterministic sloped stair rails and four endpoint posts", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, offset: 48, width: 48 } } }],
    });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    expect(geometry.stairRailSegments).toHaveLength(2);
    expect(geometry.stairRailPosts).toHaveLength(4);
    expect(geometry.stairRailSegments[0]).toEqual({
      id: "stair-rail-side-1",
      start: { x: 142, y: 82, z: 144 },
      end: { x: 142, y: 34, z: 214 },
    });
    expect(geometry.stairRailSegments[1].start.x).toBe(98);
    expect(geometry.stairRailSegments.every((rail) => rail.end.z - rail.start.z === 70)).toBe(true);
  });

  it("normalizes older v3 stairs to a straight landing and round-trips the explicit turn", () => {
    const design = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const legacyV3 = JSON.parse(stableDeckDesignV3Json(design));
    delete legacyV3.platforms[0].construction.stairs.landingTurn;
    const normalized = normalizeDeckDesignV3(legacyV3);
    expect(normalized.platforms[0].construction.stairs.landingTurn).toBe("straight");
    expect(JSON.parse(stableDeckDesignV3Json(normalized)).platforms[0].construction.stairs.landingTurn).toBe("straight");
  });

  it("turns the descending flight left or right from one deterministic landing", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const designFor = (landingTurn: "left" | "right") => normalizeDeckDesignV3({
      ...base,
      platforms: [{
        ...platform,
        construction: {
          ...platform.construction,
          stairs: { ...platform.construction.stairs, enabled: true, offset: 48, width: 48, landingEnabled: true, landingDepth: 60, landingTurn },
        },
      }],
    });
    const left = derivePlatformGeometryV3(designFor("left"), platform.id);
    const right = derivePlatformGeometryV3(designFor("right"), platform.id);
    expect(left.landing).toEqual(right.landing);
    expect(left.stairTreads).toHaveLength(7);
    expect(right.stairTreads).toHaveLength(7);
    expect(left.stairTreads[1].x - left.stairTreads[0].x).toBe(10);
    expect(left.stairTreads[1].z - left.stairTreads[0].z).toBe(0);
    expect(right.stairTreads[1].x - right.stairTreads[0].x).toBe(-10);
    expect(right.stairTreads[1].z - right.stairTreads[0].z).toBe(0);
    expect(left.stairRailSegments.every((rail) => rail.end.x > rail.start.x)).toBe(true);
    expect(right.stairRailSegments.every((rail) => rail.end.x < rail.start.x)).toBe(true);
    expect(left.stairRailPosts).toHaveLength(4);
    expect(right.stairRailPosts).toHaveLength(4);
    expect(left.landingRailSegments.map((segment) => segment.id)).toEqual(["landing-rail-right", "landing-rail-outer"]);
    expect(right.landingRailSegments.map((segment) => segment.id)).toEqual(["landing-rail-left", "landing-rail-outer"]);
    const leftFirstTreadCenterX = left.stairTreads[0].corners.reduce((sum, corner) => sum + corner.x, 0) / 4;
    const rightFirstTreadCenterX = right.stairTreads[0].corners.reduce((sum, corner) => sum + corner.x, 0) / 4;
    expect(left.landingRailSegments[0].start.x).toBeLessThan(leftFirstTreadCenterX);
    expect(right.landingRailSegments[0].start.x).toBeGreaterThan(rightFirstTreadCenterX);
    expect(left.landingRailPosts).toHaveLength(3);
    expect(right.landingRailPosts).toHaveLength(3);
    expect(totalLength(left.landingRailSegments)).toBe(108);
    expect(totalLength(right.landingRailSegments)).toBe(108);
  });

  it("rejects a turning landing that is shallower than the stair width", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = design.platforms[0];
    expect(() => normalizeDeckDesignV3({
      ...design,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingDepth: 36, width: 48, landingTurn: "left" } } }],
    })).toThrow(/at least as deep as the stair width/i);
  });

  it("splits one recorded stair into deterministic upper and lower flights around a midway landing", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, offset: 48, width: 48, landingEnabled: true, landingDepth: 48, landingTurn: "left", landingPosition: "midway", upperFlightRisers: 3 } } }],
    });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    const rise = 48 / 7;
    expect(geometry.landing).toMatchObject({ position: "midway", y: 48 - rise * 3 });
    expect(geometry.stairTreads).toHaveLength(7);
    expect(geometry.stairTreads[1].z - geometry.stairTreads[0].z).toBe(10);
    expect(geometry.stairTreads[4].x - geometry.stairTreads[3].x).toBe(10);
    expect(geometry.stairTreads[2].y).toBeCloseTo(geometry.landing!.y);
    expect(geometry.stairTreads[3].y).toBeCloseTo(geometry.landing!.y - rise);
    expect(geometry.stairStringers.map((stringer) => stringer.id)).toEqual(["stair-stringer-upper-1", "stair-stringer-upper-2", "stair-stringer-lower-1", "stair-stringer-lower-2"]);
    expect(geometry.stairRailSegments).toHaveLength(4);
    expect(geometry.stairRailPosts).toHaveLength(8);
    expect(geometry.landingSupportPosts.every((post) => post.top < platform.elevation)).toBe(true);
  });

  it("sizes a landing independently while keeping both flights centered on it", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingPosition: "midway", upperFlightRisers: 3, landingWidth: 72, landingDepth: 60, landingTurn: "right" } } }],
    });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    expect(geometry.landing).toMatchObject({ width: 72, depth: 60 });
    expect(Math.hypot(geometry.landing!.corners[1].x - geometry.landing!.corners[0].x, geometry.landing!.corners[1].z - geometry.landing!.corners[0].z)).toBeCloseTo(72);
    expect(Math.hypot(geometry.stairTreads[3].x - geometry.landing!.center.x, geometry.stairTreads[3].z - geometry.landing!.center.z)).toBeCloseTo(41);
  });
});
