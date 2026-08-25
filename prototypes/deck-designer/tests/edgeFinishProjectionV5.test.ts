import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveEdgeFinishGeometryV5 } from "../src/edgeFinishProjectionV5";
import { deriveDeckAccessoryProjectionV5 } from "../src/quantityProjectionV5";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";

function finishedFrontWithStairs() {
  const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
  const platform = base.platforms[0];
  const front = platform.edgeConditions.find((condition) => condition.condition === "free" && condition.edgeId.includes("p14400--p0-p14400"))?.edgeId
    ?? platform.edgeConditions.filter((condition) => condition.condition === "free")[0].edgeId;
  return normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: {
    ...platform.construction,
    stairSystems: [{ id: "stair-system-1", locked: false, edgeId: front, offset: 48, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] }],
    edgeFinishes: [{ edgeId: front, fasciaEnabled: true, skirtingEnabled: true }],
  } }] });
}

describe("v5 finish geometry and quantities", () => {
  it("splits both finishes around an exact stair opening", () => {
    const design = finishedFrontWithStairs();
    const geometry = deriveEdgeFinishGeometryV5(design, "platform-1");
    expect(geometry.fasciaSpans).toHaveLength(2);
    expect(geometry.skirtingPanels).toHaveLength(2);
    expect(geometry.fasciaSpans.map((span) => Math.hypot(span.end.x - span.start.x, span.end.z - span.start.z))).toEqual([48, 96]);
    expect(geometry.skirtingPanels.every((panel) => panel.bottom === 0 && panel.top === 48)).toBe(true);
  });

  it("produces traceable generic quantities without product assumptions", () => {
    const report = deriveDeckAccessoryProjectionV5(finishedFrontWithStairs(), "platform-1");
    expect(report.designSchemaVersion).toBe(5);
    expect(report.quantities.find((line) => line.key === "fascia-linear-feet")).toEqual(expect.objectContaining({ amount: 12, unit: "lin ft", quantityClass: "visualization" }));
    expect(report.quantities.find((line) => line.key === "skirting-area")).toEqual(expect.objectContaining({ amount: 48, unit: "sq ft", quantityClass: "visualization" }));
    expect(report.quantities.find((line) => line.key === "skirting-area")?.explanation).toContain("not determined");
  });
});
