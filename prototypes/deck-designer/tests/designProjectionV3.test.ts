// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import {
  deriveDeckDesignProjectionV3,
  stableDeckDesignProjectionV3Json,
} from "../src/designProjectionV3";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";

const quantityMap = (report: ReturnType<typeof deriveDeckDesignProjectionV3>) =>
  Object.fromEntries(report.aggregateQuantities.map((line) => [line.key, line.amount]));

describe("v3 design-level deterministic projection", () => {
  it("combines independently elevated platforms and preserves traceability", () => {
    const base = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const first = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [
        first,
        { ...first, id: "upper-platform", elevation: first.elevation + 48 },
      ],
    });
    const report = deriveDeckDesignProjectionV3(design);
    const single = deriveDeckDesignProjectionV3(base);
    const totals = quantityMap(report);
    const singleTotals = quantityMap(single);
    expect(report.platforms.map((platform) => [platform.platformId, platform.elevation])).toEqual([
      ["platform-1", first.elevation],
      ["upper-platform", first.elevation + 48],
    ]);
    expect(totals["platform-area"]).toBe(singleTotals["platform-area"] * 2);
    expect(totals["railing-linear-feet"]).toBe(singleTotals["railing-linear-feet"] * 2);
    expect(totals["stair-stringer-linear-feet"]).toBeGreaterThan(singleTotals["stair-stringer-linear-feet"]);
    expect(report.aggregateQuantities.every((line) => line.platformIds.length > 0)).toBe(true);
    expect(report.warnings).toContain("inter_platform_connections_not_determined");
  });

  it("keeps aggregate values stable when platform document order changes", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const first = base.platforms[0];
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [first, { ...first, id: "upper-platform", elevation: first.elevation + 36 }],
    });
    const reversed = normalizeDeckDesignV3({ ...design, platforms: [...design.platforms].reverse() });
    expect(deriveDeckDesignProjectionV3(reversed).aggregateQuantities)
      .toEqual(deriveDeckDesignProjectionV3(design).aggregateQuantities);
  });

  it("serializes the same normalized design projection byte-for-byte", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const first = stableDeckDesignProjectionV3Json(deriveDeckDesignProjectionV3(design));
    const second = stableDeckDesignProjectionV3Json(deriveDeckDesignProjectionV3(design));
    expect(second).toBe(first);
  });
});
