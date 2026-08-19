// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import {
  derivePolygonEdges,
  horizontalIntervalsAt,
  normalizePolygon,
  signedPolygonArea,
  verticalIntervalsAt,
} from "../src/polygon";

const lShape = [
  { x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 120 },
  { x: 168, z: 120 }, { x: 168, z: 180 }, { x: 0, z: 180 },
];

describe("custom polygon kernel spike", () => {
  it("canonicalizes winding, closing points, coordinate precision, and start vertex", () => {
    const clockwiseRotated = [
      { x: 240, z: 120 }, { x: 240, z: 0.004 }, { x: 0, z: 0 },
      { x: 0, z: 180 }, { x: 168, z: 180 }, { x: 168, z: 120 },
      { x: 240, z: 120 },
    ];
    expect(normalizePolygon(clockwiseRotated)).toEqual(lShape);
    expect(Object.isFrozen(normalizePolygon(clockwiseRotated))).toBe(true);
  });

  it("derives stable edges, outward directions, and area", () => {
    const normalized = normalizePolygon(lShape);
    expect(signedPolygonArea(normalized)).toBe(38880);
    const edges = derivePolygonEdges(normalized);
    expect(edges.map((edge) => [edge.id, edge.length])).toEqual([
      ["custom-edge-1", 240], ["custom-edge-2", 120], ["custom-edge-3", 72],
      ["custom-edge-4", 60], ["custom-edge-5", 168], ["custom-edge-6", 180],
    ]);
    expect(edges[0].outward).toEqual({ x: 0, z: -1 });
  });

  it("projects deterministic horizontal and vertical member intervals through concavity", () => {
    expect(horizontalIntervalsAt(lShape, 60)).toEqual([{ start: 0, end: 240 }]);
    expect(horizontalIntervalsAt(lShape, 150)).toEqual([{ start: 0, end: 168 }]);
    expect(verticalIntervalsAt(lShape, 120)).toEqual([{ start: 0, end: 180 }]);
    expect(verticalIntervalsAt(lShape, 200)).toEqual([{ start: 0, end: 120 }]);
  });

  it("fails closed on duplicate, collinear, tiny, and self-intersecting outlines", () => {
    expect(() => normalizePolygon([{ x: 0, z: 0 }, { x: 48, z: 0 }, { x: 48, z: 0 }, { x: 0, z: 48 }])).toThrow(/distinct/);
    expect(() => normalizePolygon([{ x: 0, z: 0 }, { x: 24, z: 0 }, { x: 48, z: 0 }, { x: 48, z: 48 }, { x: 0, z: 48 }])).toThrow(/collinear/);
    expect(() => normalizePolygon([{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 12 }, { x: 0, z: 12 }])).toThrow(/4 square feet/);
    expect(() => normalizePolygon([{ x: 0, z: 0 }, { x: 72, z: 72 }, { x: 0, z: 72 }, { x: 72, z: 0 }])).toThrow(/intersect|4 square feet/);
  });
});
