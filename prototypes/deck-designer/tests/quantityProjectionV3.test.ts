// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometry } from "../src/geometry";
import { normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";
import {
  deriveDeckAccessoryProjectionV3,
  stableDeckAccessoryProjectionV3Json,
} from "../src/quantityProjectionV3";
import { deriveQuantities } from "../src/quantities";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";
import multiWallContextFixture from "./fixtures/multi-wall-context.json";

const fixtures = [rectangleFoundationFixture, lShapeLandingFixture, multiWallContextFixture];
const accessoryKeys = [
  "railing-linear-feet",
  "railing-post-count",
  "stair-tread-count",
  "stair-run",
  "stair-stringer-count",
  "stair-stringer-linear-feet",
  "stair-landing-area",
  "landing-support-post-count",
  "landing-railing-linear-feet",
  "landing-railing-post-count",
] as const;

describe("v3 accessory quantity projection", () => {
  it.each(fixtures)("preserves $design.name accessory quantities", (fixture) => {
    const v2 = normalizeDesign(fixture.design);
    const expected = Object.fromEntries(
      deriveQuantities(v2, deriveGeometry(v2))
        .filter((line) => accessoryKeys.includes(line.id as typeof accessoryKeys[number]))
        .map((line) => [line.id, line.quantity]),
    );
    const report = deriveDeckAccessoryProjectionV3(migrateDeckDesignToV3(v2), "platform-1");
    const actual = Object.fromEntries(report.quantities
      .filter((line) => accessoryKeys.includes(line.key as typeof accessoryKeys[number]))
      .map((line) => [line.key, line.amount]));
    expect(actual).toEqual(expected);
    expect(report.quantities.every((line) => line.sourceGeometry.length > 0 || line.amount === 0)).toBe(true);
    expect(stableDeckAccessoryProjectionV3Json(report)).toBe(stableDeckAccessoryProjectionV3Json(report));
  });

  it("keeps commercial and structural conclusions outside the report", () => {
    const report = deriveDeckAccessoryProjectionV3(migrateDeckDesignToV3(lShapeLandingFixture.design), "platform-1");
    expect(report.warnings).toContain("structural_design_not_determined");
    expect(JSON.stringify(report)).not.toMatch(/price|cost|sku|margin|supplier/i);
    expect(report.quantities.filter((line) => line.key.includes("post") || line.key.includes("stringer"))
      .every((line) => line.quantityClass === "visualization")).toBe(true);
  });

  it("projects a turning landing from the same recorded geometry facts", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingDepth: 60, landingTurn: "left" } } }],
    });
    const report = deriveDeckAccessoryProjectionV3(design, platform.id);
    const byKey = Object.fromEntries(report.quantities.map((line) => [line.key, line]));
    expect(byKey["stair-landing-area"].amount).toBe(20);
    expect(byKey["landing-railing-linear-feet"].amount).toBe(9);
    expect(byKey["landing-railing-post-count"].amount).toBe(3);
    expect(byKey["stair-tread-count"].sourceGeometry).toHaveLength(7);
    expect(byKey["stair-railing-linear-feet"].amount).toBe(14.15);
    expect(byKey["stair-railing-post-count"].amount).toBe(4);
    expect(byKey["stair-railing-linear-feet"].assemblyIntent).toBe("stair_railing");
    expect(byKey["railing-linear-feet"].assemblyIntent).toBe("railing");
  });

  it("projects two stair flights and one midway landing without changing the total tread count", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingPosition: "midway", upperFlightRisers: 3, landingDepth: 48, landingTurn: "left" } } }],
    });
    const report = deriveDeckAccessoryProjectionV3(design, platform.id);
    const byKey = Object.fromEntries(report.quantities.map((line) => [line.key, line]));
    expect(byKey["stair-tread-count"].amount).toBe(7);
    expect(byKey["stair-stringer-count"].amount).toBe(4);
    expect(byKey["stair-railing-post-count"].amount).toBe(8);
    expect(byKey["stair-landing-area"].explanation).toMatch(/midway landing at 27\.43 in elevation/i);
    expect(stableDeckAccessoryProjectionV3Json(report)).toBe(stableDeckAccessoryProjectionV3Json(report));
  });

  it("projects exact landing area from independently recorded width and depth", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairs: { ...platform.construction.stairs, enabled: true, landingEnabled: true, landingWidth: 72, landingDepth: 60 } } }],
    });
    const landing = deriveDeckAccessoryProjectionV3(design, platform.id).quantities.find((line) => line.key === "stair-landing-area")!;
    expect(landing.amount).toBe(30);
    expect(landing.explanation).toMatch(/72 in by 60 in/i);
  });

  it("aggregates multiple stair systems and landings with system-scoped geometry references", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const freeEdges = platform.edgeConditions.filter((condition) => condition.condition === "free").map((condition) => condition.edgeId);
    const design = normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [
      { id: "stair-system-1", locked: true, edgeId: freeEdges[0], offset: 0, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "stair-system-1-landing-1", locked: true, afterRiser: 3, width: 48, depth: 48, turn: "left", connections: [] }] },
      { id: "stair-system-2", locked: true, edgeId: freeEdges[1], offset: 12, width: 36, treadDepth: 11, maxRiserHeight: 7.75, landings: [] },
    ] } }] });
    const report = deriveDeckAccessoryProjectionV3(design, platform.id);
    const byKey = Object.fromEntries(report.quantities.map((line) => [line.key, line]));
    expect(byKey["stair-tread-count"].amount).toBe(14);
    expect(byKey["stair-run"].amount).toBe(12.25);
    expect(byKey["stair-landing-area"].amount).toBe(16);
    expect(byKey["stair-tread-count"].sourceGeometry.some((id: string) => id.includes("stair-system-2"))).toBe(true);
  });

  it("counts a shared landing once while aggregating every connected flight", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const system = { id: "stair-system-1", locked: true, edgeId: platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId, offset: 48, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] } as const;
    const design = normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings: [{
      id: `${system.id}-landing-1`, locked: true, afterRiser: 3, width: 48, depth: 48, turn: "straight", connections: [
        { id: "merge-down", locked: true, destination: "grade", direction: "left", width: 48, treadDepth: 10 },
        { id: "merge-up", locked: true, destination: "deck", direction: "right", width: 48, treadDepth: 10 },
      ],
    }] }] } }] });
    const report = deriveDeckAccessoryProjectionV3(design, platform.id);
    const byKey = Object.fromEntries(report.quantities.map((line) => [line.key, line]));
    expect(byKey["stair-landing-area"].amount).toBe(16);
    expect(byKey["stair-landing-area"].sourceGeometry).toHaveLength(1);
    expect(byKey["stair-tread-count"].amount).toBe(14);
    expect(byKey["stair-stringer-count"].amount).toBe(8);
  });
});
