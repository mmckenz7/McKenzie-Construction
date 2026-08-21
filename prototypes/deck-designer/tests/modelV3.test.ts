// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import {
  deckDesignV3Fingerprint,
  migrateDeckDesignToV3,
  normalizeDeckDesignV3,
  stableDeckDesignV3Json,
} from "../src/modelV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";
import multiWallContextFixture from "./fixtures/multi-wall-context.json";

describe("isolated DeckDesign v3 migration spike", () => {
  it("migrates a rectangle into one canonical platform without duplicate shape dimensions", () => {
    const migrated = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.platforms).toHaveLength(1);
    expect(migrated.platforms[0].region).toEqual({
      outer: [{ x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 144 }, { x: 0, z: 144 }],
      holes: [],
    });
    expect(migrated.platforms[0].edgeConditions.filter((condition) => condition.condition === "house_attachment")).toHaveLength(1);
    expect(migrated.platforms[0].edgeConditions.filter((condition) => condition.condition === "free")).toHaveLength(3);
    expect(migrated.platforms[0].construction.railing.enabledEdgeIds).toHaveLength(3);
    expect(migrated.platforms[0].construction.stairs).toMatchObject({ landingPosition: "top", upperFlightRisers: 3, landingWidth: 48 });
    expect(Object.keys(migrated.platforms[0])).not.toEqual(expect.arrayContaining(["kind", "width", "projection", "cutoutWidth", "cutoutDepth"]));
  });

  it("migrates an L-shape cutout into a concave outer ring and remaps attachments", () => {
    const migrated = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const platform = migrated.platforms[0];
    expect(platform.region.outer).toEqual(lShapeLandingFixture.expected.footprint);
    expect(platform.region.holes).toEqual([]);
    expect(platform.construction.railing.enabledEdgeIds).toHaveLength(5);
    expect(platform.construction.stairs.enabled).toBe(true);
    expect(platform.edgeConditions.find((condition) => condition.edgeId === platform.construction.stairs.edgeId)?.condition).toBe("free");
    expect(deriveGeometricPolygonEdges(platform.region.outer).map((edge) => edge.id)).toContain(platform.construction.stairs.edgeId);
  });

  it("preserves global site context and is stable across repeated v3 normalization", () => {
    const first = migrateDeckDesignToV3(multiWallContextFixture.design);
    const second = migrateDeckDesignToV3(JSON.parse(stableDeckDesignV3Json(first)));
    expect(second.siteContext).toEqual(first.siteContext);
    expect(second.metadata.revision).toBe(first.metadata.revision);
    expect(stableDeckDesignV3Json(second)).toBe(stableDeckDesignV3Json(first));
    expect(deckDesignV3Fingerprint(second)).toBe(deckDesignV3Fingerprint(first));
    expect(deckDesignV3Fingerprint(first)).toMatch(/^v3-[0-9a-f]{8}$/);
  });

  it("defaults older v3 landings to top and validates a recorded midway split", () => {
    const migrated = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const legacy = JSON.parse(stableDeckDesignV3Json(migrated));
    delete legacy.platforms[0].construction.stairSystems[0].landings[0]?.locked;
    expect(migrateDeckDesignToV3(legacy).platforms[0].construction.stairSystems[0].landings[0]?.locked).toBe(false);
    const platform = migrated.platforms[0];
    expect(() => normalizeDeckDesignV3({
      ...migrated,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingPosition: "midway", upperFlightRisers: 7 } } }],
    })).toThrow(/below the total stair rise/i);
    expect(() => normalizeDeckDesignV3({
      ...migrated,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, width: 60, landingWidth: 48 } } }],
    })).toThrow(/at least as wide as (the|its) stairs/i);
  });

  it("rejects railing or stairs that reference attached or missing edges", () => {
    const migrated = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = migrated.platforms[0];
    const houseEdgeId = platform.edgeConditions.find((condition) => condition.condition === "house_attachment")!.edgeId;
    expect(() => normalizeDeckDesignV3({
      ...migrated,
      platforms: [{ ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [houseEdgeId] } } }],
    })).toThrow(/railing.*free edges/i);
    expect(() => normalizeDeckDesignV3({
      ...migrated,
      platforms: [{ ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [platform.construction.railing.enabledEdgeIds[0], platform.construction.railing.enabledEdgeIds[0]] } } }],
    })).toThrow(/unique list/i);
    expect(() => normalizeDeckDesignV3({
      ...migrated,
      platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...platform.construction.stairSystems[0], edgeId: "edge-missing" }] } }],
    })).toThrow(/stairs.*free edge/i);
  });

  it("writes grouped stairs as the only serialized authority and rejects overlapping systems", () => {
    const migrated = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const serialized = JSON.parse(stableDeckDesignV3Json(migrated));
    expect(serialized.platforms[0].construction.stairSystems).toHaveLength(1);
    expect(serialized.platforms[0].construction).not.toHaveProperty("stairs");
    const platform = migrated.platforms[0];
    const first = platform.construction.stairSystems[0];
    expect(() => normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [first, { ...first, id: "stair-system-2" }] } }] })).toThrow(/cannot overlap/i);
  });

  it("validates shared-landing merger sides and deck-bound rise", () => {
    const migrated = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const platform = migrated.platforms[0];
    const system = platform.construction.stairSystems[0];
    const landing = system.landings[0];
    expect(() => normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings: [{ ...landing, connections: [{ id: "duplicate-side", locked: true, destination: "grade", direction: landing.turn, width: system.width, treadDepth: 10 }] }] }] } }] })).toThrow(/different open sides/i);
    expect(() => normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings: [{ ...landing, afterRiser: 0, connections: [{ id: "deck-at-deck", locked: true, destination: "deck", direction: "left", width: system.width, treadDepth: 10 }] }] }] } }] })).toThrow(/below deck elevation/i);
  });

  it("requires an explicit level connection to reference another existing platform", () => {
    const migrated = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const platform = migrated.platforms[0], system = platform.construction.stairSystems[0], landing = system.landings[0];
    const connection = { id: "level-link", locked: true, destination: "deck" as const, direction: "left" as const, width: system.width, treadDepth: 10 };
    const withConnection = (targetPlatformId: string) => ({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings: [{ ...landing, connections: [{ ...connection, targetPlatformId }] }] }] } }] });
    expect(() => normalizeDeckDesignV3(withConnection("platform-1"))).toThrow(/another stable platform/i);
    expect(() => normalizeDeckDesignV3(withConnection("missing-level"))).toThrow(/does not exist/i);
  });

  it("records an exact free destination side for a level connection", () => {
    const migrated = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const platform = migrated.platforms[0], system = platform.construction.stairSystems[0], landing = system.landings[0];
    const second = { ...platform, id: "platform-2", elevation: 24, edgeConditions: platform.edgeConditions.map((condition) => ({ ...condition, condition: "free" as const, attachment: "none" as const })), construction: { ...platform.construction, stairSystems: [] } };
    const targetEdgeId = second.edgeConditions[0].edgeId;
    const connection = { id: "exact-level-link", locked: true, destination: "deck" as const, direction: "left" as const, width: system.width, treadDepth: 10, targetPlatformId: second.id, targetEdgeId };
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings: [{ ...landing, connections: [connection] }] }] } }, second] });
    expect(design.platforms[0].construction.stairSystems[0].landings[0].connections[0]).toMatchObject({ targetPlatformId: "platform-2", targetEdgeId });
    expect(() => normalizeDeckDesignV3({ ...design, platforms: [{ ...design.platforms[0], construction: { ...design.platforms[0].construction, stairSystems: [{ ...design.platforms[0].construction.stairSystems[0], landings: [{ ...design.platforms[0].construction.stairSystems[0].landings[0], connections: [{ ...connection, targetEdgeId: "missing-edge" }] }] }] } }, design.platforms[1]] })).toThrow(/exact free side/i);
  });
});
