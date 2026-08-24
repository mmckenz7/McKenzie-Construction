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
import { addPlatformLevelV3 } from "../src/platformCommandsV3";

const fixtures = [rectangleFoundationFixture, lShapeLandingFixture, multiWallContextFixture];
const totalLength = (members: readonly Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>[]) =>
  Math.round(members.reduce((sum, member) => sum + Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z), 0) * 100) / 100;

describe("v3 free-edge geometry equivalence", () => {
  it("projects the legacy-equivalent conceptual beam and support locations", () => {
    const rectangle = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const rectangleGeometry = derivePlatformGeometryV3(rectangle, "platform-1");
    expect(rectangleGeometry.beams).toEqual([{ id: "beam-1", start: { x: 0, z: 120 }, end: { x: 192, z: 120 } }]);
    expect(rectangleGeometry.supportPosts).toHaveLength(4);
    expect(rectangleGeometry.supportPosts.map((post) => post.top)).toEqual([40, 40, 40, 40]);
    const lShape = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const lGeometry = derivePlatformGeometryV3(lShape, "platform-1");
    expect(totalLength(lGeometry.beams)).toBe(168);
    expect(lGeometry.supportPosts).toHaveLength(4);
  });

  it("rotates the conceptual beam with framing direction and splits it around a cutout", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const rotated = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, decking: { ...platform.construction.decking, direction: "house_yard" } } }],
    });
    const rotatedGeometry = derivePlatformGeometryV3(rotated, platform.id);
    expect(rotatedGeometry.beams).toEqual([{ id: "beam-1", start: { x: 168, z: 0 }, end: { x: 168, z: 144 } }]);
    expect(rotatedGeometry.supportPosts).toHaveLength(3);
    const cutout = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, region: { ...platform.region, holes: [[{ x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 }]] } }],
    });
    const split = derivePlatformGeometryV3(cutout, platform.id);
    expect(split.beams).toEqual([
      { id: "beam-1", start: { x: 0, z: 120 }, end: { x: 72, z: 120 } },
      { id: "beam-2", start: { x: 120, z: 120 }, end: { x: 192, z: 120 } },
    ]);
    expect(split.supportPosts).toHaveLength(4);
  });

  it("uses the authoritative picture-frame pattern for outer and cutout borders", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{
        ...platform,
        region: { ...platform.region, holes: [[{ x: 48, z: 48 }, { x: 96, z: 48 }, { x: 96, z: 96 }, { x: 48, z: 96 }]] },
        construction: { ...platform.construction, decking: { ...platform.construction.decking, pattern: "picture_frame" } },
      }],
    });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    expect(geometry.surfaceBoards.filter((board) => board.id.startsWith("picture-frame-border-"))).toHaveLength(4);
    expect(geometry.surfaceBoards.filter((board) => board.id.startsWith("picture-frame-hole-1-border-"))).toHaveLength(4);
    expect(geometry.surfaceBoards.some((board) => board.id.startsWith("picture-frame-field-"))).toBe(true);
    expect(derivePlatformGeometryV3(design, platform.id)).toEqual(geometry);
  });

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
    expect(geometry.stairTreads.map(({ systemId: _systemId, ...tread }) => tread)).toEqual(oldGeometry.stairTreads);
    expect(geometry.stairStringers).toEqual(oldGeometry.stairStringers);
    expect(geometry.stairRise).toBe(oldGeometry.stairRise);
    if (oldGeometry.landing) {
      expect(geometry.landing).toMatchObject(oldGeometry.landing);
      expect(geometry.landing?.position).toBe("top");
    } else {
      expect(geometry.landing).toBeNull();
    }
    expect(geometry.landingRailSegments.map(({ id, start, end }) => ({ id, start, end }))).toEqual(oldGeometry.landingRailSegments);
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
    expect(geometry.stairRailSegments[0].id).toBe("stair-rail-side-1");
    expect(geometry.stairRailSegments.every((rail) => rail.start.y - rail.end.y === 48)).toBe(true);
    expect(geometry.stairRailSegments.every((rail) => Math.hypot(rail.end.x - rail.start.x, rail.end.z - rail.start.z) === 70)).toBe(true);
  });

  it("normalizes older v3 stairs to a straight landing and round-trips the explicit turn", () => {
    const design = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const legacyV3 = JSON.parse(stableDeckDesignV3Json(design));
    delete legacyV3.platforms[0].construction.stairSystems[0].landings[0].turn;
    const normalized = normalizeDeckDesignV3(legacyV3);
    expect(normalized.platforms[0].construction.stairSystems[0].landings[0].turn).toBe("straight");
    expect(JSON.parse(stableDeckDesignV3Json(normalized)).platforms[0].construction.stairSystems[0].landings[0].turn).toBe("straight");
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
    const leftDirection = { x: left.stairTreads[1].x - left.stairTreads[0].x, z: left.stairTreads[1].z - left.stairTreads[0].z };
    const rightDirection = { x: right.stairTreads[1].x - right.stairTreads[0].x, z: right.stairTreads[1].z - right.stairTreads[0].z };
    expect(Math.hypot(leftDirection.x, leftDirection.z)).toBe(10);
    expect(rightDirection.x).toBeCloseTo(-leftDirection.x);
    expect(rightDirection.z).toBeCloseTo(-leftDirection.z);
    expect(left.stairRailPosts).toHaveLength(4);
    expect(right.stairRailPosts).toHaveLength(4);
    expect(left.landingRailSegments.map((segment) => segment.id)).toEqual(["landing-rail-right", "landing-rail-outer"]);
    expect(right.landingRailSegments.map((segment) => segment.id)).toEqual(["landing-rail-left", "landing-rail-outer"]);
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
    const upperDirection = { x: geometry.stairTreads[1].x - geometry.stairTreads[0].x, z: geometry.stairTreads[1].z - geometry.stairTreads[0].z };
    const lowerDirection = { x: geometry.stairTreads[4].x - geometry.stairTreads[3].x, z: geometry.stairTreads[4].z - geometry.stairTreads[3].z };
    expect(Math.hypot(upperDirection.x, upperDirection.z)).toBe(10);
    expect(Math.hypot(lowerDirection.x, lowerDirection.z)).toBe(10);
    expect(upperDirection.x * lowerDirection.x + upperDirection.z * lowerDirection.z).toBe(0);
    expect(geometry.stairTreads[2].y).toBeCloseTo(geometry.landing!.y);
    expect(geometry.stairTreads[3].y).toBeCloseTo(geometry.landing!.y - rise);
    expect(geometry.stairStringers.map((stringer) => stringer.id)).toEqual(["stair-stringer-upper-1", "stair-stringer-upper-2", "stair-stringer-lower-1", "stair-stringer-lower-2"]);
    expect(geometry.stairRailSegments).toHaveLength(4);
    expect(geometry.stairRailPosts).toHaveLength(8);
    expect(geometry.landingSupportPosts.every((post) => post.top < platform.elevation)).toBe(true);
  });

  it("reverses a lower flight beside the upper flight on a wide midway switchback landing", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingPosition: "midway", upperFlightRisers: 4, landingWidth: 96, landingDepth: 48, landingTurn: "switchback" } } }],
    });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    expect(geometry.stairTreads).toHaveLength(7);
    expect(geometry.stairStringers).toHaveLength(4);
    expect(geometry.stairRailSegments).toHaveLength(4);
    expect(geometry.landing).toMatchObject({ afterRiser: 4, width: 96, depth: 48 });
    const upperDirection = { x: geometry.stairTreads[1].x - geometry.stairTreads[0].x, z: geometry.stairTreads[1].z - geometry.stairTreads[0].z };
    const lowerDirection = { x: geometry.stairTreads[5].x - geometry.stairTreads[4].x, z: geometry.stairTreads[5].z - geometry.stairTreads[4].z };
    expect(upperDirection.x * lowerDirection.x + upperDirection.z * lowerDirection.z).toBeLessThan(0);
    expect(Math.hypot(geometry.stairTreads[3].x - geometry.stairTreads[4].x, geometry.stairTreads[3].z - geometry.stairTreads[4].z)).toBeCloseTo(48);
  });

  it("derives top and midway landings independently or together", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const system = { id: "stair-system-1", locked: true, edgeId: platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId, offset: 12, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] } as const;
    const landing = (id: string, afterRiser: number) => ({ id, locked: true, afterRiser, width: system.width, depth: 48, turn: "straight" as const, connections: [] });
    const positionsFor = (landings: readonly ReturnType<typeof landing>[]) => derivePlatformGeometryV3(normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings }] } }] }), platform.id).landings.map((item) => item.afterRiser);
    expect(positionsFor([landing("top-only", 0)])).toEqual([0]);
    expect(positionsFor([landing("midway-only", 3)])).toEqual([3]);
    expect(positionsFor([landing("top", 0), landing("midway", 3)])).toEqual([0, 3]);
  });

  it("keeps multiple unfinished landings deterministic without requiring lock order", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const edgeId = platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const system = {
      id: "stair-system-1", locked: false, edgeId, offset: 12, width: 48,
      treadDepth: 10, maxRiserHeight: 7.75,
      landings: [
        { id: "landing-1", locked: false, afterRiser: 2, width: 48, depth: 48, turn: "straight" as const, connections: [] },
        { id: "landing-2", locked: false, afterRiser: 4, width: 60, depth: 48, turn: "left" as const, connections: [] },
      ],
    };
    const design = normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [system] } }] });
    const first = derivePlatformGeometryV3(design, platform.id);
    const second = derivePlatformGeometryV3(design, platform.id);
    expect(first.landings.map((landing) => landing.afterRiser)).toEqual([2, 4]);
    expect(first).toEqual(second);
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

  it("derives multiple locked stair systems with ordered system-associated landings", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const freeEdges = platform.edgeConditions.filter((condition) => condition.condition === "free").map((condition) => condition.edgeId);
    const design = normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [
      { id: "stair-system-1", locked: true, edgeId: freeEdges[0], offset: 12, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [
        { id: "stair-system-1-landing-1", locked: true, afterRiser: 0, width: 48, depth: 48, turn: "straight", connections: [] },
        { id: "stair-system-1-landing-2", locked: true, afterRiser: 3, width: 60, depth: 48, turn: "left", connections: [] },
      ] },
      { id: "stair-system-2", locked: true, edgeId: freeEdges[1], offset: 24, width: 36, treadDepth: 10, maxRiserHeight: 7.75, landings: [] },
    ] } }] });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    expect(geometry.stairOpenings).toHaveLength(2);
    expect(geometry.landings.map((landing) => landing.systemId)).toEqual(["stair-system-1", "stair-system-1"]);
    expect(geometry.landings.map((landing) => landing.landingId)).toEqual(["stair-system-1-landing-1", "stair-system-1-landing-2"]);
    expect(geometry.stairTreads).toHaveLength(14);
    expect(new Set(geometry.stairTreads.map((tread) => tread.systemId))).toEqual(new Set(["stair-system-1", "stair-system-2"]));
    expect(geometry.stairStringers).toHaveLength(6);
    expect(geometry.stairRailSegments).toHaveLength(6);
    expect(geometry.stairRailPosts).toHaveLength(12);
    expect(new Set(geometry.stairTreads.map((tread) => tread.id)).size).toBe(14);
  });

  it("treats converging and diverging stair flights as one shared landing junction", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const system = { id: "stair-system-1", locked: true, edgeId: platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId, offset: 48, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] } as const;
    const design = normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, locked: true, landings: [{
      id: `${system.id}-landing-1`, locked: true, afterRiser: 3, width: 48, depth: 48, turn: "straight", connections: [
        { id: "merge-down", locked: true, destination: "grade", direction: "left", width: 48, treadDepth: 10 },
        { id: "merge-up", locked: true, destination: "deck", direction: "right", width: 48, treadDepth: 10 },
      ],
    }] }] } }] });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    expect(geometry.landings).toHaveLength(1);
    expect(geometry.stairTreads).toHaveLength(14);
    expect(geometry.stairStringers).toHaveLength(8);
    expect(geometry.stairRailSegments).toHaveLength(8);
    expect(geometry.landingRailSegments).toHaveLength(0);
    expect(geometry.landingRailPosts).toHaveLength(0);
    expect(new Set(geometry.stairTreads.map((tread) => tread.id)).size).toBe(14);
    expect(geometry.stairTreads.find((tread) => tread.id.includes("merge-up-tread-3"))?.y).toBeCloseTo(platform.elevation);
    expect(geometry.stairTreads.find((tread) => tread.id.includes("merge-down-tread-4"))?.y).toBeCloseTo(base.siteContext.gradeElevation);
  });

  it("derives a connected flight to the exact elevation of another recorded level", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const added = addPlatformLevelV3(base, "platform-1", "platform-2", 84, { x: 300, z: 0 }).design;
    const platform = added.platforms[0];
    const system = { id: "stair-system-1", locked: true, edgeId: platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId, offset: 48, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "landing-1", locked: true, afterRiser: 3, width: 48, depth: 48, turn: "straight" as const, connections: [{ id: "to-platform-2", locked: true, destination: "deck" as const, targetPlatformId: "platform-2", direction: "left" as const, width: 48, treadDepth: 10 }] }] };
    const design = normalizeDeckDesignV3({ ...added, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [system] } }, added.platforms[1]] });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    const connected = geometry.stairTreads.filter((tread) => tread.id.includes("to-platform-2"));
    expect(connected).toHaveLength(8);
    expect(connected.at(-1)?.y).toBeCloseTo(84);
    expect(derivePlatformGeometryV3(design, platform.id)).toEqual(geometry);
  });

  it("stops an upper stair route at a shared lower-level landing instead of continuing to grade", () => {
    const migrated = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const raised = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...migrated.platforms[0], elevation: 168 }] });
    const added = addPlatformLevelV3(raised, "platform-1", "platform-2", 48, { x: 0, z: 0 }).design;
    const source = added.platforms[0], target = added.platforms[1];
    const edgeId = source.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const targetEdgeId = target.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const system = { id: "upper-stairs", locked: true, edgeId, offset: 48, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "shared-landing", locked: true, afterRiser: 16, width: 48, depth: 48, turn: "straight" as const, connections: [], terminalPlatformId: target.id, terminalEdgeId: targetEdgeId }] };
    const design = normalizeDeckDesignV3({ ...added, platforms: [{ ...source, construction: { ...source.construction, stairSystems: [system] } }, target] });
    const geometry = derivePlatformGeometryV3(design, source.id);
    expect(geometry.stairTreads).toHaveLength(16);
    expect(geometry.stairTreads.at(-1)?.y).toBeCloseTo(target.elevation);
    expect(geometry.landings).toHaveLength(1);
    expect(geometry.landings[0].y).toBeCloseTo(target.elevation);
    expect(geometry.stairRailSegments.every((rail) => rail.end.y >= target.elevation + source.construction.railing.height - 2)).toBe(true);
    expect(derivePlatformGeometryV3(design, source.id)).toEqual(geometry);
  });
});
