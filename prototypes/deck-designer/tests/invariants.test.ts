// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometry } from "../src/geometry";
import { DEFAULT_DESIGN, designFingerprint, normalizeDesign, stableDesignJson, updateDesign, type DeckDesignV1 } from "../src/model";
import { deriveQuantities } from "../src/quantities";

function polygonArea(points: readonly Readonly<{ x: number; z: number }>[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0)) / 2;
}

function assertProjectionInvariants(design: DeckDesignV1): void {
  const normalized = normalizeDesign(design);
  const first = deriveGeometry(normalized);
  const second = deriveGeometry(normalized);
  const quantities = deriveQuantities(normalized, first);
  expect(second).toEqual(first);
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
    expect(first.stairTreads.length).toBe(Math.ceil(normalized.platform.surfaceElevation / normalized.construction.stairs.maxRiserHeight));
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
});
