import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, designFingerprint, normalizeDesign, stableDesignJson, updateDesign } from "../src/model";
import { deriveGeometry } from "../src/geometry";
import { deriveQuantities } from "../src/quantities";
import { createHistory, designHistoryReducer } from "../src/history";

describe("DeckDesignV1 normalization", () => {
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
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, schemaVersion: 2 })).toThrow(/version 1/);
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, units: "ft" })).toThrow(/inches/);
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, kind: "circle" } })).toThrow(/rectangle or l-shape/);
    expect(() => normalizeDesign({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, width: Number.NaN } })).toThrow(/between/);
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
  });

  it("creates two additional stable attachment edges for an L-shape", () => {
    const design = updateDesign(DEFAULT_DESIGN, { kind: "l-shape" });
    expect(deriveGeometry(design).platformEdges.map((edge) => edge.id)).toEqual([
      "front", "left", "right", "notch-horizontal", "notch-vertical",
    ]);
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
    expect(quantities.find((line) => line.id === "stair-tread-count")?.explanation).toMatch(/^right edge:/);
  });
});
