// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { planPolygonRegionReplacement } from "../src/commandsV3";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";

const notchedTop = [
  { x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 144 },
  { x: 132, z: 144 }, { x: 132, z: 168 }, { x: 60, z: 168 }, { x: 60, z: 144 }, { x: 0, z: 144 },
];

describe("DeckDesign v3 region replacement planning", () => {
  it("blocks an ambiguous split when the old edge carries railing intent", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const originalJson = JSON.stringify(design);
    const plan = planPolygonRegionReplacement(design, "platform-1", { outer: notchedTop, holes: [] });
    expect(plan.safeToApplyWithoutReview).toBe(false);
    expect(plan.impacts).toEqual([expect.objectContaining({
      usages: ["railing"],
      status: "review_required",
      candidateEdgeIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
    })]);
    expect(JSON.stringify(design)).toBe(originalJson);
  });

  it("allows the same split when the affected free edge has no active attachment", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = design.platforms[0];
    const topEdgeId = planPolygonRegionReplacement(design, "platform-1", { outer: notchedTop, holes: [] })
      .impacts[0].previousEdgeId;
    const withoutTopRail = normalizeDeckDesignV3({
      ...design,
      platforms: [{
        ...platform,
        construction: {
          ...platform.construction,
          railing: {
            ...platform.construction.railing,
            enabledEdgeIds: platform.construction.railing.enabledEdgeIds.filter((edgeId) => edgeId !== topEdgeId),
          },
        },
      }],
    });
    const plan = planPolygonRegionReplacement(withoutTopRail, "platform-1", { outer: notchedTop, holes: [] });
    expect(plan.safeToApplyWithoutReview).toBe(true);
    expect(plan.impacts).toEqual([]);
    expect(plan.addedEdgeIds.length).toBeGreaterThan(2);
  });

  it("reports unambiguous geometric remaps separately from review impacts", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const widened = [{ x: 0, z: 0 }, { x: 216, z: 0 }, { x: 216, z: 144 }, { x: 0, z: 144 }];
    const plan = planPolygonRegionReplacement(design, "platform-1", { outer: widened, holes: [] });
    expect(plan.automaticRemaps.length).toBeGreaterThan(0);
    expect(plan.impacts.some((impact) => impact.status === "missing" && impact.usages.includes("railing"))).toBe(true);
    expect(plan.safeToApplyWithoutReview).toBe(false);
  });

  it("rejects unknown platforms and invalid proposed regions", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    expect(() => planPolygonRegionReplacement(design, "missing", { outer: notchedTop, holes: [] })).toThrow(/does not exist/);
    expect(() => planPolygonRegionReplacement(design, "platform-1", { outer: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 12 }], holes: [] })).toThrow(/4 square feet/);
  });
});
