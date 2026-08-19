// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, designFingerprint, normalizeDesign, stableDesignJson, updateDesign } from "../src/model";
import { deriveGeometry } from "../src/geometry";
import { deriveQuantities } from "../src/quantities";
import { createHistory, designHistoryReducer } from "../src/history";
import { dimensionsFromHandle, snapDimension } from "../src/editor";
import { formatFeetInches } from "../src/PlanView";
import { deriveDesignNotices } from "../src/notices";
import { GENERIC_DECK_TEMPLATES, applyTemplateToDesign, duplicateDesign, getDeckTemplate } from "../src/templates";
import { RENDER_QUALITY_POLICIES } from "../src/renderQuality";
import { createHouseOpening, createHouseWall } from "../src/siteContext";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";

describe("golden design fixtures", () => {
  const fixtures = [rectangleFoundationFixture, lShapeLandingFixture];

  it.each(fixtures)("keeps $design.name geometry and quantities stable", (fixture) => {
    expect(fixture.fixtureVersion).toBe(1);
    const design = normalizeDesign(fixture.design);
    const geometry = deriveGeometry(design);
    const actual = {
      schemaVersion: design.schemaVersion,
      fingerprint: designFingerprint(design),
      footprint: geometry.footprint,
      edgeIds: geometry.platformEdges.map((edge) => edge.id),
      boardCount: geometry.surfaceBoards.length,
      joistCount: geometry.joists.length,
      railSegmentCount: geometry.railSegments.length,
      stairTreadCount: geometry.stairTreads.length,
      stairStringerCount: geometry.stairStringers.length,
      gradeElevation: design.siteContext.gradeElevation,
      houseWallPanelCount: geometry.houseWallPanels.length,
      houseOpeningCount: geometry.houseOpenings.length,
      landingCenter: geometry.landing?.center ?? null,
      landingRailSegmentCount: geometry.landingRailSegments.length,
      landingRailPostCount: geometry.landingRailPosts.length,
      landingSupportPostCount: geometry.landingSupportPosts.length,
      quantities: Object.fromEntries(
        deriveQuantities(design, geometry).map((line) => [line.id, { quantity: line.quantity, unit: line.unit }]),
      ),
    };
    expect(actual).toEqual(fixture.expected);
  });
});

describe("generic design templates", () => {
  it("normalizes every template and keeps the set product-agnostic", () => {
    expect(GENERIC_DECK_TEMPLATES.map((template) => template.id)).toEqual([
      "compact-ground",
      "elevated-rectangle",
      "l-shape-landing",
    ]);
    for (const template of GENERIC_DECK_TEMPLATES) {
      expect(normalizeDesign(template.design)).toEqual(template.design);
      expect(stableDesignJson(template.design)).not.toMatch(/manufacturer|product|sku|price|cost|margin/i);
    }
  });

  it("applies a template as one revision while preserving design identity", () => {
    const applied = applyTemplateToDesign(DEFAULT_DESIGN, "l-shape-landing");
    expect(applied.id).toBe(DEFAULT_DESIGN.id);
    expect(applied.metadata.revision).toBe(2);
    expect(applied.platform.kind).toBe("l-shape");
    expect(applied.construction.stairs.edgeId).toBe("right");
    expect(applied.construction.stairs.landingEnabled).toBe(true);
  });

  it("duplicates facts into a new local identity with a fresh revision", () => {
    const source = applyTemplateToDesign(DEFAULT_DESIGN, "elevated-rectangle");
    const copy = duplicateDesign(source, "local-copy-001");
    expect(copy.id).toBe("local-copy-001");
    expect(copy.name).toBe("Elevated entertaining concept copy");
    expect(copy.metadata.revision).toBe(1);
    expect(copy.platform).toEqual(source.platform);
    expect(copy.construction).toEqual(source.construction);
  });

  it("rejects unknown template identifiers", () => {
    expect(() => getDeckTemplate("unknown" as never)).toThrow(/Unknown deck template/);
  });
});

describe("local 3D quality policy", () => {
  it("offers bounded presentation tiers without changing design facts", () => {
    expect(RENDER_QUALITY_POLICIES).toEqual({
      economy: { maxPixelRatio: 1, shadows: false, shadowMapSize: 512 },
      balanced: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024 },
      detailed: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048 },
    });
    expect(Object.isFrozen(RENDER_QUALITY_POLICIES)).toBe(true);
    expect(stableDesignJson(DEFAULT_DESIGN)).not.toMatch(/quality|pixelRatio|shadowMap/);
  });
});

describe("house opening commands", () => {
  it("adds a deterministic side wall and caps the prototype wall count", () => {
    const wall = createHouseWall(DEFAULT_DESIGN);
    expect(wall).toEqual({
      id: "house-wall-2",
      start: { x: -60, z: 0 },
      end: { x: -60, z: 204 },
      baseElevation: 0,
      height: 120,
      attachment: "unknown",
      openings: [],
    });
    expect(() => createHouseWall({
      ...DEFAULT_DESIGN,
      siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: Array.from({ length: 8 }, (_, index) => ({ ...wall, id: `wall-${index}` })) },
    })).toThrow(/no more than 8/);
  });

  it("places the first opening centrally and later openings in the first valid gap", () => {
    const wall = DEFAULT_DESIGN.siteContext.houseWalls[0];
    const first = createHouseOpening(wall, "door");
    expect(first).toEqual({ id: "door-1", kind: "door", offset: 138, width: 36, sillHeight: 0, height: 80 });
    const second = createHouseOpening({ ...wall, openings: [first] }, "window");
    expect(second).toEqual({ id: "window-1", kind: "window", offset: 0, width: 48, sillHeight: 36, height: 48 });
  });

  it("fails clearly when no opening fits", () => {
    const wall = {
      ...DEFAULT_DESIGN.siteContext.houseWalls[0],
      end: { x: 24, z: 0 },
      start: { x: 0, z: 0 },
      openings: [{ id: "existing", kind: "door" as const, offset: 0, width: 24, sillHeight: 0, height: 48 }],
    };
    expect(() => createHouseOpening(wall, "door")).toThrow(/No 36-inch opening fits/);
  });
});

describe("direct plan editing", () => {
  it("formats grade references below the local datum without floor-sign ambiguity", () => {
    expect(formatFeetInches(-6)).toBe("−0′ 6″");
    expect(formatFeetInches(-18)).toBe("−1′ 6″");
  });

  it("snaps dimensions deterministically", () => {
    expect(snapDimension(194.9, 6)).toBe(192);
    expect(snapDimension(195.1, 6)).toBe(198);
    expect(snapDimension(195.1, 1)).toBe(195);
  });

  it("derives rectangle width and projection edits from handle coordinates", () => {
    expect(dimensionsFromHandle(DEFAULT_DESIGN, "width", { x: 221, z: 50 }, 6)).toEqual({ width: 222 });
    expect(dimensionsFromHandle(DEFAULT_DESIGN, "projection", { x: 50, z: 161 }, 12)).toEqual({ projection: 156 });
  });

  it("derives both L-shape cutout facts from the elbow handle", () => {
    const design = updateDesign(DEFAULT_DESIGN, { kind: "l-shape" });
    expect(dimensionsFromHandle(design, "cutout", { x: 132, z: 84 }, 6)).toEqual({
      cutoutWidth: 60,
      cutoutDepth: 60,
    });
  });

  it("constrains drag edits so active stair openings remain valid", () => {
    const frontStairs = updateDesign(DEFAULT_DESIGN, { stairEnabled: true, stairOffset: 120, stairWidth: 48 });
    expect(dimensionsFromHandle(frontStairs, "width", { x: 60, z: 50 }, 6)).toEqual({ width: 168 });
    const notchStairs = updateDesign(updateDesign(DEFAULT_DESIGN, { kind: "l-shape" }), {
      stairEnabled: true,
      stairEdgeId: "notch-horizontal",
      stairOffset: 0,
      stairWidth: 48,
    });
    expect(dimensionsFromHandle(notchStairs, "cutout", { x: 190, z: 96 }, 6).cutoutWidth).toBe(48);
  });
});

describe("deterministic design checks", () => {
  it("flags open elevated edges and stair intent from recorded facts", () => {
    const design = updateDesign(DEFAULT_DESIGN, { railingEdges: ["front"], stairEnabled: true });
    const notices = deriveDesignNotices(design, deriveGeometry(design));
    expect(notices.map((notice) => notice.id)).toEqual([
      "open-elevated-edge:left",
      "open-elevated-edge:right",
      "house-attachment-unverified",
      "stairs-without-landing",
    ]);
    expect(notices.every((notice) => notice.message.length > 20)).toBe(true);
  });

  it("does not invent open-edge review flags below the prototype threshold", () => {
    const design = updateDesign(DEFAULT_DESIGN, { surfaceElevation: 24, railingEdges: [] });
    expect(deriveDesignNotices(design, deriveGeometry(design)).map((notice) => notice.id)).toEqual([
      "house-attachment-unverified",
    ]);
  });

  it("explains narrow L-legs and a shallow recorded landing", () => {
    const narrow = updateDesign(DEFAULT_DESIGN, {
      kind: "l-shape",
      cutoutWidth: 160,
      cutoutDepth: 112,
      stairEnabled: true,
      stairEdgeId: "left",
      landingEnabled: true,
      landingDepth: 36,
    });
    expect(deriveDesignNotices(narrow, deriveGeometry(narrow)).map((notice) => notice.id)).toContain("narrow-l-shape-leg");
    expect(deriveDesignNotices(narrow, deriveGeometry(narrow)).map((notice) => notice.id)).toContain("landing-shallower-than-stair");
  });
});

describe("DeckDesign normalization", () => {
  it("normalizes to an immutable, stable document", () => {
    const first = normalizeDesign(JSON.parse(JSON.stringify(DEFAULT_DESIGN)));
    const second = normalizeDesign(JSON.parse(stableDesignJson(first)));
    expect(second).toEqual(first);
    expect(stableDesignJson(second)).toBe(stableDesignJson(first));
    expect(designFingerprint(second)).toBe(designFingerprint(first));
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second.platform)).toBe(true);
  });

  it("rejects unsupported versions, units, shapes, and unsafe numbers", () => {
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, schemaVersion: 3 })).toThrow(/version 2/);
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, units: "ft" })).toThrow(/inches/);
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, kind: "circle" } })).toThrow(/rectangle or l-shape/);
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, width: Number.NaN } })).toThrow(/between/);
  });

  it("migrates schema v1 JSON to an explicit conceptual site context", () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_DESIGN));
    legacy.schemaVersion = 1;
    delete legacy.siteContext;
    const migrated = normalizeDesign(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.siteContext).toEqual({
      gradeElevation: 0,
      houseWalls: [{
        id: "house-wall-1",
        start: { x: -60, z: 0 },
        end: { x: 252, z: 0 },
        baseElevation: 0,
        height: 120,
        attachment: "unknown",
        openings: [],
      }],
    });
  });

  it("rejects overlapping or out-of-bounds house openings", () => {
    const wall = DEFAULT_DESIGN.siteContext.houseWalls[0];
    const withOpenings = (openings: unknown[]) => ({
      ...DEFAULT_DESIGN,
      siteContext: { ...DEFAULT_DESIGN.siteContext, houseWalls: [{ ...wall, openings }] },
    });
    expect(() => normalizeDesign(withOpenings([
      { id: "door-1", kind: "door", offset: 60, width: 36, sillHeight: 0, height: 80 },
      { id: "window-1", kind: "window", offset: 80, width: 36, sillHeight: 36, height: 48 },
    ]))).toThrow(/must not overlap/);
    expect(() => normalizeDesign(withOpenings([
      { id: "door-1", kind: "door", offset: 300, width: 36, sillHeight: 0, height: 80 },
    ]))).toThrow(/must fit within house wall/);
  });

  it("increments revision and rounds edited facts to hundredths", () => {
    const updated = updateDesign(DEFAULT_DESIGN, { width: 200.126, projection: 150.444 });
    expect(updated.platform.width).toBe(200.13);
    expect(updated.platform.projection).toBe(150.44);
    expect(updated.metadata.revision).toBe(2);
  });

  it("rejects an L-shape cutout that consumes either deck leg", () => {
    const lShape = updateDesign(DEFAULT_DESIGN, { kind: "l-shape" });
    expect(() => updateDesign(lShape, { cutoutWidth: 170 })).toThrow(/leave at least 24 inches/);
    expect(() => updateDesign(lShape, { cutoutDepth: 125 })).toThrow(/leave at least 24 inches/);
  });

  it("rejects stairs that do not fit their recorded outer-front edge", () => {
    expect(() => updateDesign(DEFAULT_DESIGN, { stairEnabled: true, stairOffset: 170 })).toThrow(/fit on the front edge/);
    const lShape = updateDesign(DEFAULT_DESIGN, { kind: "l-shape", cutoutWidth: 96 });
    expect(() => updateDesign(lShape, { stairEnabled: true, stairOffset: 60, stairWidth: 48 })).toThrow(/fit on the front edge/);
  });

  it("normalizes the previous local front-outer stair field", () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_DESIGN));
    legacy.construction.stairs.edge = "front-outer";
    delete legacy.construction.stairs.edgeId;
    delete legacy.construction.stairs.landingEnabled;
    delete legacy.construction.stairs.landingDepth;
    const normalized = normalizeDesign(legacy);
    expect(normalized.construction.stairs.edgeId).toBe("front");
    expect(normalized.construction.stairs.landingEnabled).toBe(false);
  });
});

describe("command history", () => {
  it("undoes and redoes facts while keeping revisions monotonic", () => {
    const initial = createHistory(DEFAULT_DESIGN);
    const wider = updateDesign(initial.present, { width: 240 });
    const applied = designHistoryReducer(initial, { type: "apply", design: wider });
    const undone = designHistoryReducer(applied, { type: "undo" });
    const redone = designHistoryReducer(undone, { type: "redo" });
    expect(applied.present.platform.width).toBe(240);
    expect(undone.present.platform.width).toBe(192);
    expect(redone.present.platform.width).toBe(240);
    expect([applied.present.metadata.revision, undone.present.metadata.revision, redone.present.metadata.revision]).toEqual([2, 3, 4]);
  });

  it("clears redo commands after a new branch edit", () => {
    const initial = createHistory(DEFAULT_DESIGN);
    const applied = designHistoryReducer(initial, { type: "apply", design: updateDesign(initial.present, { width: 240 }) });
    const undone = designHistoryReducer(applied, { type: "undo" });
    const branched = designHistoryReducer(undone, { type: "apply", design: updateDesign(undone.present, { projection: 180 }) });
    expect(branched.future).toHaveLength(0);
  });
});

describe("deterministic geometry", () => {
  it("derives identical geometry without mutating the design", () => {
    const before = stableDesignJson(DEFAULT_DESIGN);
    const first = deriveGeometry(DEFAULT_DESIGN);
    const second = deriveGeometry(DEFAULT_DESIGN);
    expect(second).toEqual(first);
    expect(stableDesignJson(DEFAULT_DESIGN)).toBe(before);
    expect(first.footprint).toEqual([
      { x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 144 }, { x: 0, z: 144 },
    ]);
    expect(first.surfaceBoards).toHaveLength(26);
    expect(first.joists).toHaveLength(13);
    expect(first.supportPosts).toHaveLength(4);
    expect(first.railPosts).toHaveLength(8);
  });

  it("never exceeds requested joist or support-post bay spacing", () => {
    const geometry = deriveGeometry(DEFAULT_DESIGN);
    const joistXs = geometry.joists.map((joist) => joist.start.x);
    const postXs = geometry.supportPosts.map((post) => post.x);
    expect(Math.max(...joistXs.slice(1).map((x, i) => x - joistXs[i]))).toBeLessThanOrEqual(16);
    expect(Math.max(...postXs.slice(1).map((x, i) => x - postXs[i]))).toBeLessThanOrEqual(72);
  });

  it("projects one parametric L-shape consistently across every geometry family", () => {
    const design = updateDesign(DEFAULT_DESIGN, { kind: "l-shape", cutoutWidth: 48, cutoutDepth: 48 });
    const geometry = deriveGeometry(design);
    expect(geometry.footprint).toEqual([
      { x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 96 },
      { x: 144, z: 96 }, { x: 144, z: 144 }, { x: 0, z: 144 },
    ]);
    expect(geometry.surfaceBoards.some((board) => board.end.x === 144)).toBe(true);
    expect(geometry.joists.some((joist) => joist.end.z === 96)).toBe(true);
    expect(geometry.railSegments).toHaveLength(5);
  });

  it("derives edge-attached stairs and splits railing at the explicit opening", () => {
    const design = updateDesign(DEFAULT_DESIGN, { stairEnabled: true, stairOffset: 48, stairWidth: 48 });
    const geometry = deriveGeometry(design);
    expect(geometry.stairOpening).toEqual({
      id: "stair-opening", start: { x: 48, z: 144 }, end: { x: 96, z: 144 },
    });
    expect(geometry.stairTreads).toHaveLength(7);
    expect(geometry.stairStringers).toHaveLength(2);
    expect(geometry.stairStringers[0]).toEqual({
      id: "stair-stringer-1",
      start: { x: 48.75, y: 48, z: 144 },
      end: { x: 48.75, y: 0, z: 214 },
    });
    expect(geometry.railSegments).toHaveLength(4);
    expect(geometry.railSegments.some((rail) => rail.start.x === 48 && rail.end.x === 96 && rail.start.z === 144)).toBe(false);
  });

  it("exposes stable free-edge identities and rotates side stairs outward", () => {
    const design = updateDesign(DEFAULT_DESIGN, {
      stairEnabled: true,
      stairEdgeId: "right",
      stairOffset: 24,
      stairWidth: 48,
      landingEnabled: true,
      landingDepth: 48,
    });
    const geometry = deriveGeometry(design);
    expect(geometry.platformEdges.map((edge) => edge.id)).toEqual(["front", "left", "right"]);
    expect(geometry.stairOpening).toEqual({
      id: "stair-opening", start: { x: 192, z: 24 }, end: { x: 192, z: 72 },
    });
    expect(geometry.stairTreads.every((tread) => tread.x > 240)).toBe(true);
    expect(geometry.stairTreads.every((tread) => tread.rotationY === -Math.PI / 2)).toBe(true);
    expect(geometry.landing?.center).toEqual({ x: 216, z: 48 });
    expect(geometry.landingRailSegments).toEqual([
      { id: "landing-rail-left", start: { x: 192, z: 24 }, end: { x: 240, z: 24 } },
      { id: "landing-rail-right", start: { x: 192, z: 72 }, end: { x: 240, z: 72 } },
    ]);
    expect(geometry.landingRailPosts).toHaveLength(4);
    expect(geometry.landingSupportPosts.map((post) => ({ x: post.x, z: post.z }))).toEqual([
      { x: 240, z: 72 }, { x: 240, z: 24 },
    ]);
  });

  it("creates two additional stable attachment edges for an L-shape", () => {
    const design = updateDesign(DEFAULT_DESIGN, { kind: "l-shape" });
    expect(deriveGeometry(design).platformEdges.map((edge) => edge.id)).toEqual([
      "front", "left", "right", "notch-horizontal", "notch-vertical",
    ]);
  });

  it("projects recorded house openings into deterministic wall panels", () => {
    const wall = DEFAULT_DESIGN.siteContext.houseWalls[0];
    const design = updateDesign(DEFAULT_DESIGN, {
      houseAttachment: "ledger",
      houseOpenings: [{ id: "door-1", kind: "door", offset: 120, width: 36, sillHeight: 0, height: 80 }],
    });
    const geometry = deriveGeometry(design);
    expect(geometry.houseOpenings).toEqual([{
      id: "door-1",
      wallId: wall.id,
      kind: "door",
      start: { x: 60, z: 0 },
      end: { x: 96, z: 0 },
      sillElevation: 0,
      height: 80,
    }]);
    expect(geometry.houseWallPanels.map((panel) => ({ id: panel.id, height: panel.height }))).toEqual([
      { id: "house-wall-1-full-0", height: 120 },
      { id: "house-wall-1-above-door-1", height: 40 },
      { id: "house-wall-1-full-156", height: 120 },
    ]);
  });

  it("uses recorded grade for stair rise and stringer endpoints", () => {
    const design = updateDesign(DEFAULT_DESIGN, { gradeElevation: 12, stairEnabled: true });
    const geometry = deriveGeometry(design);
    expect(geometry.stairRise).toBe(36);
    expect(geometry.stairTreads).toHaveLength(5);
    expect(geometry.stairStringers.every((stringer) => stringer.end.y === 12)).toBe(true);
    expect(deriveQuantities(design, geometry).find((line) => line.id === "stair-tread-count")?.quantity).toBe(5);
  });
});

describe("deterministic conceptual quantities", () => {
  it("produces the same traceable quantity lines for the same design", () => {
    const geometry = deriveGeometry(DEFAULT_DESIGN);
    const first = deriveQuantities(DEFAULT_DESIGN, geometry);
    const second = deriveQuantities(DEFAULT_DESIGN, deriveGeometry(DEFAULT_DESIGN));
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.fromEntries(first.map((line) => [line.id, line.quantity]))).toEqual({
      "platform-area": 192,
      "deck-board-rows": 26,
      "decking-linear-feet": 416,
      "joist-count": 13,
      "joist-linear-feet": 156,
      "beam-linear-feet": 16,
      "support-post-count": 4,
      "railing-linear-feet": 40,
      "railing-post-count": 8,
      "surface-screw-allowance": 676,
    });
    expect(first.every((line) => line.explanation.length > 10)).toBe(true);
  });

  it("removes railing quantities when no railing edges are enabled", () => {
    const design = updateDesign(DEFAULT_DESIGN, { railingEdges: [] });
    const quantities = deriveQuantities(design, deriveGeometry(design));
    expect(quantities.find((line) => line.id === "railing-linear-feet")?.quantity).toBe(0);
    expect(quantities.find((line) => line.id === "railing-post-count")?.quantity).toBe(0);
  });

  it("subtracts an L-shape cutout and sums shortened members", () => {
    const design = updateDesign(DEFAULT_DESIGN, { kind: "l-shape", cutoutWidth: 48, cutoutDepth: 48 });
    const quantities = deriveQuantities(design, deriveGeometry(design));
    const byId = Object.fromEntries(quantities.map((line) => [line.id, line.quantity]));
    expect(byId["platform-area"]).toBe(176);
    expect(byId["decking-linear-feet"]).toBeLessThan(416);
    expect(byId["joist-linear-feet"]).toBeLessThan(156);
    expect(byId["railing-linear-feet"]).toBe(40);
    expect(byId["surface-screw-allowance"]).toBeLessThan(676);
  });

  it("reports stair intent without introducing products or commercial calculations", () => {
    const design = updateDesign(DEFAULT_DESIGN, { stairEnabled: true });
    const quantities = deriveQuantities(design, deriveGeometry(design));
    const byId = Object.fromEntries(quantities.map((line) => [line.id, line.quantity]));
    expect(byId["stair-tread-count"]).toBe(7);
    expect(byId["stair-run"]).toBe(5.83);
    expect(byId["stair-stringer-count"]).toBe(2);
    expect(byId["stair-stringer-linear-feet"]).toBe(14.15);
    expect(byId["railing-linear-feet"]).toBe(36);
    expect(quantities.map((line) => line.id).join(" ")).not.toMatch(/price|cost|sku|margin/);
  });

  it("reports a conceptual landing from recorded dimensions", () => {
    const design = updateDesign(DEFAULT_DESIGN, {
      stairEnabled: true,
      stairEdgeId: "right",
      landingEnabled: true,
      landingDepth: 48,
    });
    const quantities = deriveQuantities(design, deriveGeometry(design));
    expect(quantities.find((line) => line.id === "stair-landing-area")?.quantity).toBe(16);
    expect(quantities.find((line) => line.id === "landing-support-post-count")?.quantity).toBe(2);
    expect(quantities.find((line) => line.id === "landing-railing-linear-feet")?.quantity).toBe(8);
    expect(quantities.find((line) => line.id === "landing-railing-post-count")?.quantity).toBe(4);
    expect(quantities.find((line) => line.id === "stair-tread-count")?.explanation).toMatch(/^right edge:/);
  });
});
