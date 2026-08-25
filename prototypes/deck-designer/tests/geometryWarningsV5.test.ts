import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveGeometryWarningsV5 } from "../src/geometryWarningsV5";
import { deriveLayoutReviewV5 } from "../src/layoutReviewV5";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";
import { deriveGeometricPolygonEdges } from "../src/polygon";

describe("DeckDesign v5 explainable framing warnings", () => {
  it("keeps the clean rectangle free of framing conflicts", () => {
    const design = migrateDeckDesignToV5(DEFAULT_DESIGN);
    expect(deriveGeometryWarningsV5(design, "platform-1")).toEqual([]);
  });

  it("identifies exact interrupted beam and joist paths for a cutout", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 },
    ]] } }] });
    const warnings = deriveGeometryWarningsV5(design, platform.id);
    expect(deriveGeometryWarningsV5(design, platform.id)).toEqual(warnings);
    expect(warnings).toContainEqual(expect.objectContaining({
      id: "beam-cutout-interruption-beam-line-1-1",
      geometryIds: ["beam-line-1", "platform-1:hole-1"],
    }));
    expect(warnings).toContainEqual(expect.objectContaining({
      id: "joist-cutout-interruption-1",
      geometryIds: ["platform-1:hole-1", "joist-6", "joist-7", "joist-8"],
      message: "Cutout 1 interrupts 3 conceptual joist paths; header and trimmer framing is not designed and requires qualified review.",
    }));
    expect(warnings).toContainEqual(expect.objectContaining({
      id: "joist-cutout-clearance-1",
      geometryIds: ["platform-1:hole-1", "joist-5", "joist-9"],
      message: "Cutout 1 is 8 inches from 2 adjacent conceptual joist paths; verify the intended framing clearance.",
    }));
  });

  it("surfaces framing interruptions as field verification without claiming a design", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 },
    ]] } }] });
    const review = deriveLayoutReviewV5(design, platform.id);
    expect(review.readyToContinue).toBe(true);
    expect(review.items.find((item) => item.id === "geometry")).toEqual(expect.objectContaining({ status: "field_verify", value: "0 collisions · 3 clearance notes" }));
    expect(review.fieldVerification).toContain("Cutout 1 interrupts 3 conceptual joist paths; header and trimmer framing is not designed and requires qualified review.");
  });

  it("reports measured beam clearance near a cutout without calling it an interruption", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 },
    ]] }, construction: { ...platform.construction, framing: { ...platform.construction.framing, beamLines: [
      { ...platform.construction.framing.beamLines[0], offsetFromOutside: 54 },
    ] } } }] });
    const warnings = deriveGeometryWarningsV5(design, platform.id);
    expect(warnings).toContainEqual(expect.objectContaining({
      id: "beam-cutout-clearance-beam-line-1-1",
      geometryIds: ["beam-line-1", "platform-1:hole-1"],
      message: "Conceptual beam 1 is 6 inches from cutout 1; verify the intended framing clearance.",
    }));
    expect(warnings.some((warning) => warning.id.startsWith("beam-cutout-interruption"))).toBe(false);
  });

  it("reports a small nonzero stair-edge remainder but accepts exact corner alignment", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const lowerEdge = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.outward.z > 0)!;
    const withOffset = (offset: number) => normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{
      id: "stair-system-1", locked: true, edgeId: lowerEdge.id, offset, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [],
    }] } }] });
    expect(deriveGeometryWarningsV5(withOffset(6), platform.id)).toContainEqual(expect.objectContaining({
      id: "stair-edge-remainder-stair-system-1-1",
      geometryIds: ["stair-system-1", lowerEdge.id],
      message: "Stair system 1 leaves 6 inches of deck edge near the right end of its selected side; verify the intended corner placement.",
    }));
    expect(deriveGeometryWarningsV5(withOffset(0), platform.id).some((warning) => warning.id.startsWith("stair-edge-remainder"))).toBe(false);
  });

  it("reports measured spacing between closely recorded conceptual beam lines", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, framing: { ...platform.construction.framing, beamLines: [
      { id: "beam-line-yard", offsetFromOutside: 24, maxSupportSpacing: 72 },
      { id: "beam-line-near-yard", offsetFromOutside: 30, maxSupportSpacing: 72 },
    ] } } }] });
    expect(deriveGeometryWarningsV5(design, platform.id)).toContainEqual(expect.objectContaining({
      id: "beam-line-clearance-beam-line-yard-beam-line-near-yard",
      geometryIds: ["beam-line-yard", "beam-line-near-yard"],
      message: "Conceptual beams 1 and 2 are 6 inches apart in plan; verify that both recorded beam routes are intended.",
    }));
  });

  it("reports an exact short projected beam segment without prescribing a framing solution", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 6, z: 96 }, { x: 180, z: 96 }, { x: 180, z: 132 }, { x: 6, z: 132 },
    ]] } }] });
    expect(deriveGeometryWarningsV5(design, platform.id)).toContainEqual(expect.objectContaining({
      id: "beam-short-segment-beam-line-1-segment-1",
      geometryIds: ["beam-line-1", "beam-line-1-segment-1"],
      message: "Conceptual beam 1 has a 6-inch projected segment; verify that the recorded beam route is intended.",
    }));
  });
});
