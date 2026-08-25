import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { applyPolygonRegionReplacementV5, planPolygonRegionReplacementV5, PolygonEdgeReviewRequiredErrorV5 } from "../src/commandsV5";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";

function withFinish() {
  const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
  const platform = base.platforms[0];
  const front = platform.edgeConditions.find((condition) => condition.condition === "free" && condition.edgeId.includes("p14400--p0-p14400"))?.edgeId
    ?? platform.edgeConditions.filter((condition) => condition.condition === "free")[0].edgeId;
  return normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: {
    ...platform.construction,
    railing: { ...platform.construction.railing, enabledEdgeIds: [] },
    edgeFinishes: [{ edgeId: front, fasciaEnabled: true, skirtingEnabled: true }],
  } }] });
}

describe("v5 safe region replacement", () => {
  it("preserves a finish reference when an unrelated edge moves", () => {
    const design = withFinish();
    const platform = design.platforms[0];
    const nextOuter = [
      platform.region.outer[0], platform.region.outer[1],
      { x: 192, z: 48 }, { x: 204, z: 48 }, { x: 204, z: 96 }, { x: 192, z: 96 },
      platform.region.outer[2], platform.region.outer[3],
    ];
    const result = applyPolygonRegionReplacementV5(design, platform.id, { ...platform.region, outer: nextOuter });
    expect(result.design.platforms[0].construction.edgeFinishes).toEqual(platform.construction.edgeFinishes);
    expect(result.design.platforms[0].construction.framing.beamLines).toEqual(platform.construction.framing.beamLines);
  });

  it("fails closed when a selected finish edge is split", () => {
    const design = withFinish();
    const platform = design.platforms[0];
    const nextOuter = [
      platform.region.outer[0], platform.region.outer[1], platform.region.outer[2],
      { x: 144, z: 144 }, { x: 144, z: 156 }, { x: 48, z: 156 }, { x: 48, z: 144 },
      platform.region.outer[3],
    ];
    const plan = planPolygonRegionReplacementV5(design, platform.id, { ...platform.region, outer: nextOuter });
    expect(plan.safeToApplyWithoutReview).toBe(false);
    expect(plan.impacts.flatMap((impact) => impact.usages)).toEqual(expect.arrayContaining(["fascia", "skirting"]));
    expect(() => applyPolygonRegionReplacementV5(design, platform.id, { ...platform.region, outer: nextOuter })).toThrow(PolygonEdgeReviewRequiredErrorV5);
  });
});
