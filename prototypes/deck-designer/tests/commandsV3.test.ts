// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { applyPolygonRegionReplacement, planPolygonRegionReplacement, PolygonEdgeReviewRequiredError } from "../src/commandsV3";
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
      usages: expect.arrayContaining(["railing", "stairs"]),
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
    const unaffectedSideEdgeId = platform.edgeConditions.find((condition) =>
      condition.condition === "free" && condition.edgeId !== topEdgeId && !platform.construction.railing.enabledEdgeIds.includes(condition.edgeId))?.edgeId
      ?? platform.edgeConditions.find((condition) => condition.condition === "free" && condition.edgeId !== topEdgeId)!.edgeId;
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
          stairs: { ...platform.construction.stairs, edgeId: unaffectedSideEdgeId },
        },
      }],
    });
    const plan = planPolygonRegionReplacement(withoutTopRail, "platform-1", { outer: notchedTop, holes: [] });
    expect(plan.safeToApplyWithoutReview).toBe(true);
    expect(plan.impacts).toEqual([]);
    expect(plan.addedEdgeIds.length).toBeGreaterThan(2);
  });

  it("applies only a safe plan as one immutable monotonic revision", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = design.platforms[0];
    const blockingPlan = planPolygonRegionReplacement(design, "platform-1", { outer: notchedTop, holes: [] });
    const topEdgeId = blockingPlan.impacts.find((impact) => impact.usages.includes("railing"))!.previousEdgeId;
    const sideEdgeId = platform.edgeConditions.find((condition) => condition.condition === "free" && condition.edgeId !== topEdgeId)!.edgeId;
    const safeDesign = normalizeDeckDesignV3({
      ...design,
      platforms: [{
        ...platform,
        construction: {
          ...platform.construction,
          railing: { ...platform.construction.railing, enabledEdgeIds: platform.construction.railing.enabledEdgeIds.filter((edgeId) => edgeId !== topEdgeId) },
          stairs: { ...platform.construction.stairs, edgeId: sideEdgeId },
        },
      }],
    });
    const originalJson = JSON.stringify(safeDesign);
    const result = applyPolygonRegionReplacement(safeDesign, "platform-1", { outer: notchedTop, holes: [] });
    expect(result.command).toBe("replace_polygon_region");
    expect(result.design.metadata.revision).toBe(safeDesign.metadata.revision + 1);
    expect(result.design.platforms[0].region.outer).toEqual(notchedTop);
    expect(result.design.platforms[0].edgeConditions).toHaveLength(notchedTop.length);
    expect(result.notices.join(" ")).toMatch(/region replaced|new edges/i);
    expect(JSON.stringify(safeDesign)).toBe(originalJson);
    expect(normalizeDeckDesignV3(result.design)).toEqual(result.design);
  });

  it("throws a review error containing the complete plan instead of mutating ambiguous references", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    try {
      applyPolygonRegionReplacement(design, "platform-1", { outer: notchedTop, holes: [] });
      throw new Error("Expected review error");
    } catch (error) {
      expect(error).toBeInstanceOf(PolygonEdgeReviewRequiredError);
      expect((error as PolygonEdgeReviewRequiredError).plan.safeToApplyWithoutReview).toBe(false);
      expect((error as PolygonEdgeReviewRequiredError).plan.impacts.length).toBeGreaterThan(0);
    }
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
