// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometry } from "../src/geometry";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { stairOffsetFromPoint } from "../src/editor";
import { normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
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
});
