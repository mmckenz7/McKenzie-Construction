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
    expect(byKey["landing-railing-linear-feet"].amount).toBe(5);
    expect(byKey["landing-railing-post-count"].amount).toBe(2);
    expect(byKey["stair-tread-count"].sourceGeometry).toHaveLength(7);
    expect(byKey["stair-railing-linear-feet"].amount).toBe(14.15);
    expect(byKey["stair-railing-post-count"].amount).toBe(4);
    expect(byKey["stair-railing-linear-feet"].assemblyIntent).toBe("stair_railing");
    expect(byKey["railing-linear-feet"].assemblyIntent).toBe("railing");
  });
});
