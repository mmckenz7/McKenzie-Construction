import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveGeometryWarningsV5, usesPrototypeReviewThresholdV5, type GeometryWarningV5 } from "../src/geometryWarningsV5";
import { deriveLayoutReviewV5 } from "../src/layoutReviewV5";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { conceptualSupportPostTop } from "../src/beamProjection";

describe("DeckDesign v5 explainable framing warnings", () => {
  it("shares the renderer's exact displayed support-post vertical range", () => {
    expect(conceptualSupportPostTop(40, 0)).toBe(40);
    expect(conceptualSupportPostTop(0, 0)).toBe(1);
  });

  it("identifies every prototype-threshold note without classifying collisions or interruptions", () => {
    const warning = (id: string): GeometryWarningV5 => ({ id, severity: "clearance", geometryIds: [], message: id });
    [
      "beam-cutout-clearance-beam-line-1-1",
      "beam-line-clearance-beam-line-1-beam-line-2",
      "beam-short-segment-beam-line-1-segment-1",
      "cutout-clearance-1-2",
      "cutout-edge-clearance-1",
      "joist-cutout-clearance-1",
      "stair-edge-remainder-stair-system-1-1",
      "stair-house-clearance-stair-system-1-house-wall-1",
      "stair-route-clearance-stair-system-1-stair-system-2",
    ].forEach((id) => expect(usesPrototypeReviewThresholdV5(warning(id))).toBe(true));
    [
      "beam-cutout-interruption-beam-line-1-1",
      "beam-support-cutout-review-beam-line-1-1",
      "beam-support-house-review-beam-line-1-house-wall-2",
      "joist-cutout-interruption-1",
      "joist-house-plan-review-platform-1-house-wall-2",
      "beam-house-plan-review-beam-line-1-house-wall-2",
      "platform-house-plan-review-platform-1-house-wall-2",
      "stair-route-collision-stair-system-1-stair-system-2",
    ].forEach((id) => expect(usesPrototypeReviewThresholdV5(warning(id))).toBe(false));
  });

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

  it("keeps exact joist path identities isolated across multiple cutouts", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [
      [{ x: 20, z: 24 }, { x: 44, z: 24 }, { x: 44, z: 60 }, { x: 20, z: 60 }],
      [{ x: 68, z: 84 }, { x: 92, z: 84 }, { x: 92, z: 120 }, { x: 68, z: 120 }],
    ] } }] });
    const warnings = deriveGeometryWarningsV5(design, platform.id).filter((warning) => warning.id.startsWith("joist-cutout-interruption-"));
    expect(warnings).toEqual([
      expect.objectContaining({ id: "joist-cutout-interruption-1", geometryIds: ["platform-1:hole-1", "joist-3"] }),
      expect.objectContaining({ id: "joist-cutout-interruption-2", geometryIds: ["platform-1:hole-2", "joist-6"] }),
    ]);
    expect(deriveGeometryWarningsV5(design, platform.id).filter((warning) => warning.id.startsWith("joist-cutout-interruption-"))).toEqual(warnings);
  });

  it("surfaces framing interruptions as field verification without claiming a design", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 },
    ]] } }] });
    const review = deriveLayoutReviewV5(design, platform.id);
    expect(review.readyToContinue).toBe(true);
    expect(review.items.find((item) => item.id === "geometry")).toEqual(expect.objectContaining({ status: "field_verify", value: "0 collisions · 4 clearance notes" }));
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

  it("reports exact displayed support-post footprints inside a recorded cutout without blocking", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 96 }, { x: 120, z: 96 }, { x: 120, z: 132 }, { x: 72, z: 132 },
    ]] } }] });
    const warning = deriveGeometryWarningsV5(design, platform.id).find((item) => item.id === "beam-support-cutout-review-beam-line-1-1")!;
    expect(warning).toEqual(expect.objectContaining({
      severity: "clearance",
      geometryIds: ["beam-line-1", "platform-1:hole-1", "beam-line-1-segment-1-support-2", "beam-line-1-segment-2-support-1"],
    }));
    expect(warning.message).toContain("structural post placement may change");
    expect(deriveLayoutReviewV5(design, platform.id).readyToContinue).toBe(true);
    expect(deriveGeometryWarningsV5(design, platform.id)).toEqual(deriveGeometryWarningsV5(design, platform.id));
  });

  it("allows exact support-post footprint contact and nearby separation from a cutout", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const withHoleAt = (nearZ: number) => normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 36, z: nearZ }, { x: 92, z: nearZ }, { x: 92, z: 136 }, { x: 36, z: 136 },
    ]] } }] });
    for (const design of [withHoleAt(122.75), withHoleAt(123)]) {
      expect(deriveGeometryWarningsV5(design, platform.id).some((item) => item.id.startsWith("beam-support-cutout-review-"))).toBe(false);
    }
  });

  it("reports an exact displayed support-post footprint passing through recorded wall context without blocking", () => {
    const wall = { id: "house-wall-post", start: { x: 0, z: 100 }, end: { x: 0, z: 140 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [wall] } });
    const warnings = deriveGeometryWarningsV5(design, "platform-1");
    const warning = warnings.find((candidate) => candidate.id === "beam-support-house-review-beam-line-1-house-wall-post")!;
    expect(warning).toEqual({
      id: "beam-support-house-review-beam-line-1-house-wall-post",
      severity: "clearance",
      geometryIds: ["beam-line-1", "beam-line-1-segment-1-support-1", "house-wall-post"],
      message: "Support-post footprints crossing wall: 1. Field review required; structural post placement may change.",
    });
    expect(warnings.some((candidate) => candidate.id === "beam-house-plan-review-beam-line-1-house-wall-post")).toBe(false);
    expect(usesPrototypeReviewThresholdV5(warning)).toBe(false);
    expect(deriveLayoutReviewV5(design, "platform-1").readyToContinue).toBe(true);
    expect(deriveGeometryWarningsV5(design, "platform-1")).toEqual(warnings);
  });

  it("allows support-post wall boundary/contact, opening-only passage, and vertical separation", () => {
    const walls = [
      { id: "house-wall-post-boundary", start: { x: 2.75, z: 100 }, end: { x: 2.75, z: 140 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-post-point", start: { x: -30, z: 122.75 }, end: { x: -2.75, z: 122.75 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-post-separated", start: { x: 3, z: 100 }, end: { x: 3, z: 140 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-post-above", start: { x: 0, z: 100 }, end: { x: 0, z: 140 }, baseElevation: 40, height: 48, attachment: "unknown" as const, openings: [] },
      {
        id: "house-wall-post-opening", start: { x: 0, z: 100 }, end: { x: 0, z: 140 }, baseElevation: 0, height: 48, attachment: "unknown" as const,
        openings: [{ id: "opening-at-post", kind: "door" as const, offset: 0, width: 40, sillHeight: 0, height: 48 }],
      },
    ];
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: walls } });
    expect(deriveGeometryWarningsV5(design, "platform-1").filter((warning) => warning.id.startsWith("beam-support-house-review-"))).toEqual([]);
  });

  it("deduplicates split wall panels and sorts exact displayed support-post IDs deterministically", () => {
    const splitWall = {
      id: "house-wall-z-post", start: { x: 0, z: 100 }, end: { x: 0, z: 140 }, baseElevation: 0, height: 48, attachment: "unknown" as const,
      openings: [{ id: "opening-splitting-post", kind: "window" as const, offset: 14, width: 12, sillHeight: 12, height: 12 }],
    };
    const allPostsWall = { id: "house-wall-a-post", start: { x: -12, z: 120 }, end: { x: 204, z: 120 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [splitWall, allPostsWall] } });
    const warnings = deriveGeometryWarningsV5(design, "platform-1").filter((warning) => warning.id.startsWith("beam-support-house-review-"));
    expect(warnings).toEqual([
      expect.objectContaining({
        id: "beam-support-house-review-beam-line-1-house-wall-a-post",
        geometryIds: ["beam-line-1", "beam-line-1-segment-1-support-1", "beam-line-1-segment-1-support-2", "beam-line-1-segment-1-support-3", "beam-line-1-segment-1-support-4", "house-wall-a-post"],
      }),
      expect.objectContaining({
        id: "beam-support-house-review-beam-line-1-house-wall-z-post",
        geometryIds: ["beam-line-1", "beam-line-1-segment-1-support-1", "house-wall-z-post"],
      }),
    ]);
    expect(deriveGeometryWarningsV5(design, "platform-1")).toEqual(deriveGeometryWarningsV5(design, "platform-1"));
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

  it("keeps wall crossings blocking while reporting a distinct measured near-wall stair route", () => {
    const base = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [...DEFAULT_DESIGN.siteContext.houseWalls, {
      id: "house-wall-2", start: { x: 66, z: 144 }, end: { x: 66, z: 240 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [],
    }] } });
    const platform = base.platforms[0];
    const lowerEdge = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.outward.z > 0)!;
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{
      id: "stair-system-1", locked: true, edgeId: lowerEdge.id, offset: 72, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [],
    }] } }] });
    expect(deriveGeometryWarningsV5(design, platform.id)).toContainEqual(expect.objectContaining({
      id: "stair-house-clearance-stair-system-1-house-wall-2",
      geometryIds: ["stair-system-1", "house-wall-2"],
      message: "Stair system 1 passes 6 inches from a recorded house wall; verify the intended site clearance.",
    }));
  });

  it("retains one blocking warning per distinct authored wall crossed by a stair route", () => {
    const walls = [
      { id: "house-wall-near", start: { x: 60, z: 180 }, end: { x: 132, z: 180 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-far", start: { x: 60, z: 200 }, end: { x: 132, z: 200 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] },
    ];
    const base = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: walls } });
    const platform = base.platforms[0];
    const lowerEdge = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.outward.z > 0)!;
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{
      id: "stair-system-1", locked: true, edgeId: lowerEdge.id, offset: 72, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [],
    }] } }] });
    expect(deriveGeometryWarningsV5(design, platform.id).filter((warning) => warning.id.startsWith("stair-route-house-collision-"))).toEqual([
      expect.objectContaining({ id: "stair-route-house-collision-stair-system-1-house-wall-far", geometryIds: ["stair-system-1", "house-wall-far"] }),
      expect.objectContaining({ id: "stair-route-house-collision-stair-system-1-house-wall-near", geometryIds: ["stair-system-1", "house-wall-near"] }),
    ]);
  });

  it("retains provenance-safe wall/platform plan review without blocking layout", () => {
    const wall = { id: "house-wall-crossing", start: { x: -12, z: 72 }, end: { x: 204, z: 72 }, baseElevation: 0, height: 120, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [wall] } });
    const warning = deriveGeometryWarningsV5(design, "platform-1").find((candidate) => candidate.id === "platform-house-plan-review-platform-1-house-wall-crossing")!;
    expect(warning).toEqual(expect.objectContaining({ severity: "clearance", geometryIds: ["platform-1", "house-wall-crossing"], message: expect.stringContaining("192 inches") }));
    expect(usesPrototypeReviewThresholdV5(warning)).toBe(false);
    const review = deriveLayoutReviewV5(design, "platform-1");
    expect(review.readyToContinue).toBe(true);
    expect(review.items.find((item) => item.id === "geometry")).toEqual(expect.objectContaining({ status: "field_verify", value: "0 collisions · 2 clearance notes" }));
  });

  it("reports an exact beam-route and wall-context crossing without blocking layout", () => {
    const wall = { id: "house-wall-beam", start: { x: 96, z: 60 }, end: { x: 96, z: 180 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [wall] } });
    const warning = deriveGeometryWarningsV5(design, "platform-1").find((candidate) => candidate.id === "beam-house-plan-review-beam-line-1-house-wall-beam")!;
    expect(warning).toEqual({
      id: "beam-house-plan-review-beam-line-1-house-wall-beam",
      severity: "clearance",
      geometryIds: ["beam-line-1", "beam-line-1-segment-1", "house-wall-beam"],
      message: "Conceptual beam route (beam-line-1) passes through recorded house-wall context (house-wall-beam) where their displayed vertical ranges overlap; field-verify the intended framing and wall layout.",
    });
    expect(usesPrototypeReviewThresholdV5(warning)).toBe(false);
    const review = deriveLayoutReviewV5(design, "platform-1");
    expect(review.readyToContinue).toBe(true);
    expect(review.items.find((item) => item.id === "geometry")).toEqual(expect.objectContaining({ status: "field_verify", value: "0 collisions · 2 clearance notes" }));
  });

  it("excludes vertical separation, exact vertical contact, endpoint contact, and opening-only passage", () => {
    const walls = [
      { id: "house-wall-above", start: { x: 48, z: 60 }, end: { x: 48, z: 180 }, baseElevation: 39.63, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-below", start: { x: 72, z: 60 }, end: { x: 72, z: 180 }, baseElevation: -48, height: 78.37, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-endpoint", start: { x: 192, z: 120 }, end: { x: 192, z: 180 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
      {
        id: "house-wall-opening", start: { x: 120, z: 60 }, end: { x: 120, z: 180 }, baseElevation: 0, height: 48, attachment: "unknown" as const,
        openings: [{ id: "opening-at-beam", kind: "door" as const, offset: 48, width: 24, sillHeight: 0, height: 48 }],
      },
    ];
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: walls } });
    expect(deriveGeometryWarningsV5(design, "platform-1").filter((warning) => warning.id.startsWith("beam-house-plan-review-"))).toEqual([]);
  });

  it("deduplicates projected panels and beam segments by authored beam-line and wall with deterministic replay", () => {
    const splitWall = {
      id: "house-wall-z", start: { x: 12, z: 120 }, end: { x: 180, z: 120 }, baseElevation: 0, height: 48, attachment: "unknown" as const,
      openings: [{ id: "opening-splitting-wall", kind: "door" as const, offset: 72, width: 24, sillHeight: 0, height: 48 }],
    };
    const collinearWall = { id: "house-wall-a", start: { x: 36, z: 120 }, end: { x: 84, z: 120 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const base = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [splitWall, collinearWall] } });
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 108, z: 108 }, { x: 132, z: 108 }, { x: 132, z: 132 }, { x: 108, z: 132 },
    ]] } }] });
    const warnings = deriveGeometryWarningsV5(design, platform.id).filter((warning) => warning.id.startsWith("beam-house-plan-review-"));
    expect(warnings).toEqual([
      expect.objectContaining({ id: "beam-house-plan-review-beam-line-1-house-wall-a", geometryIds: ["beam-line-1", "beam-line-1-segment-1", "house-wall-a"] }),
      expect.objectContaining({ id: "beam-house-plan-review-beam-line-1-house-wall-z", geometryIds: ["beam-line-1", "beam-line-1-segment-1", "beam-line-1-segment-2", "house-wall-z"] }),
    ]);
    expect(deriveGeometryWarningsV5(design, platform.id)).toEqual(deriveGeometryWarningsV5(design, platform.id));
  });

  it("reports exact transient joist paths crossing recorded wall context in both joist directions", () => {
    const horizontalWall = { id: "house-wall-horizontal", start: { x: -12, z: 72 }, end: { x: 204, z: 72 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const leftRightBoards = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [horizontalWall] } });
    const horizontalWarning = deriveGeometryWarningsV5(leftRightBoards, "platform-1").find((warning) => warning.id === "joist-house-plan-review-platform-1-house-wall-horizontal")!;
    expect(horizontalWarning.severity).toBe("clearance");
    expect(horizontalWarning.geometryIds).toEqual(["platform-1", ...Array.from({ length: 13 }, (_, index) => `joist-${index + 1}`), "house-wall-horizontal"]);
    expect(horizontalWarning.message).toContain("13 conceptual joist paths");
    expect(usesPrototypeReviewThresholdV5(horizontalWarning)).toBe(false);
    expect(deriveLayoutReviewV5(leftRightBoards, "platform-1").readyToContinue).toBe(true);

    const platform = leftRightBoards.platforms[0];
    const verticalWall = { id: "house-wall-vertical", start: { x: 96, z: -12 }, end: { x: 96, z: 156 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] };
    const houseYardBoards = normalizeDeckDesignV5({
      ...leftRightBoards,
      siteContext: { ...leftRightBoards.siteContext, houseWalls: [verticalWall] },
      platforms: [{ ...platform, construction: { ...platform.construction, decking: { ...platform.construction.decking, direction: "house_yard" as const } } }],
    });
    const verticalWarning = deriveGeometryWarningsV5(houseYardBoards, platform.id).find((warning) => warning.id === "joist-house-plan-review-platform-1-house-wall-vertical")!;
    expect(verticalWarning.geometryIds[0]).toBe("platform-1");
    expect(verticalWarning.geometryIds.at(-1)).toBe("house-wall-vertical");
    expect(verticalWarning.geometryIds.length).toBeGreaterThan(3);
  });

  it("excludes joist/wall vertical separation, exact contact, endpoint contact, and opening-only passage", () => {
    const walls = [
      { id: "house-wall-above-joists", start: { x: 48, z: 24 }, end: { x: 48, z: 120 }, baseElevation: 46.63, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-below-joists", start: { x: 72, z: 24 }, end: { x: 72, z: 120 }, baseElevation: -48, height: 87.37, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-joist-endpoint", start: { x: 36, z: 144 }, end: { x: 156, z: 144 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
      {
        id: "house-wall-joist-opening", start: { x: 84, z: 72 }, end: { x: 108, z: 72 }, baseElevation: 0, height: 48, attachment: "unknown" as const,
        openings: [{ id: "opening-across-wall", kind: "door" as const, offset: 0, width: 24, sillHeight: 0, height: 48 }],
      },
    ];
    const design = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: walls } });
    expect(deriveGeometryWarningsV5(design, "platform-1").filter((warning) => warning.id.startsWith("joist-house-plan-review-"))).toEqual([]);
  });

  it("deduplicates split joist segments per path and preserves authored-wall warning order and replay", () => {
    const walls = [
      { id: "house-wall-z-joist", start: { x: 96, z: 12 }, end: { x: 96, z: 132 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
      { id: "house-wall-a-joist", start: { x: 32, z: 48 }, end: { x: 64, z: 48 }, baseElevation: 0, height: 48, attachment: "unknown" as const, openings: [] },
    ];
    const base = migrateDeckDesignToV5({ ...DEFAULT_DESIGN, siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: walls } });
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 84, z: 60 }, { x: 108, z: 60 }, { x: 108, z: 84 }, { x: 84, z: 84 },
    ]] } }] });
    const warnings = deriveGeometryWarningsV5(design, platform.id).filter((warning) => warning.id.startsWith("joist-house-plan-review-"));
    expect(warnings).toEqual([
      expect.objectContaining({ id: "joist-house-plan-review-platform-1-house-wall-a-joist", geometryIds: ["platform-1", "joist-4", "house-wall-a-joist"] }),
      expect.objectContaining({ id: "joist-house-plan-review-platform-1-house-wall-z-joist", geometryIds: ["platform-1", "joist-7", "house-wall-z-joist"] }),
    ]);
    expect(deriveGeometryWarningsV5(design, platform.id)).toEqual(deriveGeometryWarningsV5(design, platform.id));
  });

  it("keeps stair overlap blocking while reporting distinct measured spacing between nearby routes", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const lowerEdge = deriveGeometricPolygonEdges(platform.region.outer).find((edge) => edge.outward.z > 0)!;
    const stairSystem = (id: string, offset: number) => ({
      id, locked: true, edgeId: lowerEdge.id, offset, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [],
    });
    const nearby = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [
      stairSystem("stair-system-left", 24), stairSystem("stair-system-right", 78),
    ] } }] });
    expect(deriveGeometryWarningsV5(nearby, platform.id)).toContainEqual(expect.objectContaining({
      id: "stair-route-clearance-stair-system-left-stair-system-right",
      geometryIds: ["stair-system-left", "stair-system-right"],
      message: "Stair systems 1 and 2 pass 6 inches apart in plan; verify the intended route clearance.",
    }));

    const edges = deriveGeometricPolygonEdges(platform.region.outer);
    const turnedSystem = (id: string, edgeId: string, offset: number, turn: "left" | "right") => ({
      id, locked: true, edgeId, offset, width: 48, treadDepth: 10, maxRiserHeight: 7.75,
      landings: [{ id: `${id}-landing-1`, locked: true, afterRiser: 0, width: 48, depth: 48, turn, connections: [] }],
    });
    const overlapping = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [
      turnedSystem("stair-system-left", edges[1].id, 96, "right"), turnedSystem("stair-system-right", edges[2].id, 0, "left"),
    ] } }] });
    const overlapWarnings = deriveGeometryWarningsV5(overlapping, platform.id);
    expect(overlapWarnings).toContainEqual(expect.objectContaining({
      id: "stair-route-collision-stair-system-left-stair-system-right",
      severity: "collision",
    }));
    expect(overlapWarnings.some((warning) => warning.id.startsWith("stair-route-clearance"))).toBe(false);

    const touching = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [
      stairSystem("stair-system-left", 24), stairSystem("stair-system-right", 72),
    ] } }] });
    const contactWarnings = deriveGeometryWarningsV5(touching, platform.id);
    expect(contactWarnings.some((warning) => warning.id.startsWith("stair-route-collision"))).toBe(false);
    expect(contactWarnings.some((warning) => warning.id.startsWith("stair-route-clearance"))).toBe(false);
  });
});
