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
    expect(geometry.landing).toEqual(oldGeometry.landing);
    expect(geometry.landingRailSegments).toEqual(oldGeometry.landingRailSegments);
    expect(geometry.landingRailPosts).toEqual(oldGeometry.landingRailPosts);
    expect(geometry.landingSupportPosts).toEqual(oldGeometry.landingSupportPosts);
  });

  it("fails clearly for an unknown platform", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    expect(() => derivePlatformGeometryV3(design, "missing")).toThrow(/does not exist/);
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
    expect(left.landingRailSegments.map((segment) => segment.id)).toEqual(["landing-rail-right"]);
    expect(right.landingRailSegments.map((segment) => segment.id)).toEqual(["landing-rail-left"]);
    expect(left.landingRailPosts).toHaveLength(2);
    expect(right.landingRailPosts).toHaveLength(2);
  });

  it("rejects a turning landing that is shallower than the stair width", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = design.platforms[0];
    expect(() => normalizeDeckDesignV3({
      ...design,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingDepth: 36, width: 48, landingTurn: "left" } } }],
    })).toThrow(/at least as deep as the stair width/i);
  });
});
