// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometry } from "../src/geometry";
import { DEFAULT_DESIGN, designFingerprint, normalizeDesign, stableDesignJson, updateDesign, type DeckDesign } from "../src/model";
import { deriveQuantities } from "../src/quantities";

function polygonArea(points: readonly Readonly<{ x: number; z: number }>[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0)) / 2;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

const randomBetween = (random: () => number, minimum: number, maximum: number): number =>
  Math.round((minimum + random() * (maximum - minimum)) * 100) / 100;

function assertProjectionInvariants(design: DeckDesign): void {
  const normalized = normalizeDesign(design);
  const first = deriveGeometry(normalized);
  const second = deriveGeometry(normalized);
  const quantities = deriveQuantities(normalized, first);
  const repeatedQuantities = deriveQuantities(normalized, second);
  expect(second).toEqual(first);
  expect(repeatedQuantities).toEqual(quantities);
  expect(stableDesignJson(normalized)).toBe(stableDesignJson(normalizeDesign(JSON.parse(stableDesignJson(normalized)))));
  expect(designFingerprint(normalized)).toBe(designFingerprint(normalized));
  expect(new Set(first.platformEdges.map((edge) => edge.id)).size).toBe(first.platformEdges.length);
  expect(first.platformEdges.every((edge) => edge.length > 0)).toBe(true);
  expect(new Set(quantities.map((line) => line.id)).size).toBe(quantities.length);
  expect(quantities.every((line) => Number.isFinite(line.quantity) && line.quantity >= 0)).toBe(true);
  expect(quantities.find((line) => line.id === "platform-area")?.quantity).toBe(
    Math.round((polygonArea(first.footprint) / 144) * 100) / 100,
  );

  const joistXs = first.joists.map((joist) => joist.start.x);
  expect(Math.max(...joistXs.slice(1).map((x, index) => x - joistXs[index]))).toBeLessThanOrEqual(
    normalized.construction.framing.joistSpacing,
  );
  expect(first.surfaceBoards.every((board) =>
    board.start.x >= 0 && board.end.x <= normalized.platform.width &&
    board.start.z >= 0 && board.end.z <= normalized.platform.projection
  )).toBe(true);

  if (normalized.construction.stairs.enabled) {
    const stairEdge = first.platformEdges.find((edge) => edge.id === normalized.construction.stairs.edgeId);
    expect(stairEdge).toBeDefined();
    expect(normalized.construction.stairs.offset + normalized.construction.stairs.width).toBeLessThanOrEqual(stairEdge!.length);
    expect(first.stairTreads.length).toBe(Math.ceil(
      (normalized.platform.surfaceElevation - normalized.siteContext.gradeElevation) /
      normalized.construction.stairs.maxRiserHeight,
    ));
    expect(first.stairStringers).toHaveLength(2);
    expect(first.stairStringers.every((stringer) =>
      stringer.start.y === normalized.platform.surfaceElevation && stringer.end.y === normalized.siteContext.gradeElevation
    )).toBe(true);
  } else {
    expect(first.stairStringers).toHaveLength(0);
  }
}

describe("property-style deterministic projection matrix", () => {
  it("holds core invariants across rectangle dimensions and elevations", () => {
    let checked = 0;
    for (const width of [96, 144, 192, 240]) {
      for (const projection of [72, 120, 180]) {
        for (const surfaceElevation of [18, 48, 84]) {
          const design = updateDesign(DEFAULT_DESIGN, { width, projection, surfaceElevation });
          assertProjectionInvariants(design);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(36);
  });

  it("holds core invariants across valid L-shape legs and cutouts", () => {
    let checked = 0;
    for (const width of [144, 192, 240]) {
      for (const projection of [120, 180]) {
        for (const cutoutWidth of [24, 48, 72]) {
          for (const cutoutDepth of [24, 60, 96]) {
            if (cutoutWidth >= width - 24 || cutoutDepth >= projection - 24) continue;
            const design = updateDesign(DEFAULT_DESIGN, {
              kind: "l-shape",
              width,
              projection,
              surfaceElevation: 60,
              cutoutWidth,
              cutoutDepth,
              railingEdges: ["front", "left", "right", "notch-horizontal", "notch-vertical"],
            });
            assertProjectionInvariants(design);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(25);
  });

  it("holds stair and landing invariants on every available edge", () => {
    for (const kind of ["rectangle", "l-shape"] as const) {
      const base = updateDesign(DEFAULT_DESIGN, {
        kind,
        width: 240,
        projection: 180,
        cutoutWidth: 72,
        cutoutDepth: 60,
        railingEdges: kind === "rectangle"
          ? ["front", "left", "right"]
          : ["front", "left", "right", "notch-horizontal", "notch-vertical"],
      });
      for (const [index, edge] of deriveGeometry(base).platformEdges.entries()) {
        const design = updateDesign(base, {
          stairEnabled: true,
          stairEdgeId: edge.id,
          stairOffset: 0,
          stairWidth: 36,
          landingEnabled: index % 2 === 0,
          landingDepth: 48,
        });
        assertProjectionInvariants(design);
      }
    }
  });

  it("replays a seeded fuzz corpus across valid geometry and quantity combinations", () => {
    const random = seededRandom(0x4D434B5A);
    const cases = 250;
    for (let index = 0; index < cases; index += 1) {
      const kind = random() < 0.5 ? "rectangle" as const : "l-shape" as const;
      const width = randomBetween(random, 72, 600);
      const projection = randomBetween(random, 72, 360);
      const cutoutWidth = randomBetween(random, 12, Math.min(480, Math.max(12, width - 24.01)));
      const cutoutDepth = randomBetween(random, 12, Math.min(480, Math.max(12, projection - 24.01)));
      const surfaceElevation = randomBetween(random, 12, 120);
      const gradeElevation = randomBetween(random, -36, surfaceElevation - 6);
      const base = updateDesign(DEFAULT_DESIGN, {
        kind,
        width,
        projection,
        surfaceElevation,
        gradeElevation,
        cutoutWidth,
        cutoutDepth,
        joistSpacing: randomBetween(random, 8, 24),
        railingEdges: kind === "rectangle"
          ? ["front", "left", "right"]
          : ["front", "left", "right", "notch-horizontal", "notch-vertical"],
      });
      const edges = deriveGeometry(base).platformEdges;
      const stairEdge = edges[Math.floor(random() * edges.length)];
      const stairWidth = Math.min(96, Math.max(30, Math.floor(stairEdge.length)));
      const stairEnabled = stairEdge.length >= 30 && random() < 0.75;
      const maximumOffset = Math.max(0, Math.floor((stairEdge.length - stairWidth) * 100) / 100);
      const design = updateDesign(base, {
        stairEnabled,
        stairEdgeId: stairEdge.id,
        stairWidth,
        stairOffset: stairEnabled ? randomBetween(random, 0, maximumOffset) : 0,
        treadDepth: randomBetween(random, 9, 14),
        landingEnabled: stairEnabled && random() < 0.5,
        landingDepth: randomBetween(random, 24, 120),
      });
      assertProjectionInvariants(design);
    }
    expect(cases).toBe(250);
  });
});
