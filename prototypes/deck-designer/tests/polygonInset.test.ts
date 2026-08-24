import { describe, expect, it } from "vitest";
import { signedPolygonArea } from "../src/polygon";
import { deriveInsetPolygon } from "../src/polygonInset";

const rectangle = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 192, z: 0 }),
  Object.freeze({ x: 192, z: 144 }),
  Object.freeze({ x: 0, z: 144 }),
]);

const lShape = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 240, z: 0 }),
  Object.freeze({ x: 240, z: 120 }),
  Object.freeze({ x: 168, z: 120 }),
  Object.freeze({ x: 168, z: 180 }),
  Object.freeze({ x: 0, z: 180 }),
]);

describe("deterministic polygon inset groundwork", () => {
  it("creates an exact mitered rectangle inset", () => {
    const inset = deriveInsetPolygon(rectangle, 6);
    expect(inset).toEqual([
      { x: 6, z: 6 },
      { x: 186, z: 6 },
      { x: 186, z: 138 },
      { x: 6, z: 138 },
    ]);
    expect(signedPolygonArea(inset)).toBe(23_760);
    expect(Object.isFrozen(inset)).toBe(true);
  });

  it("expands the inside corner while shrinking a concave L-shape", () => {
    const inset = deriveInsetPolygon(lShape, 6);
    expect(inset).toEqual([
      { x: 6, z: 6 },
      { x: 234, z: 6 },
      { x: 234, z: 114 },
      { x: 162, z: 114 },
      { x: 162, z: 174 },
      { x: 6, z: 174 },
    ]);
    expect(signedPolygonArea(inset)).toBeLessThan(signedPolygonArea(lShape));
    expect(deriveInsetPolygon([...lShape].reverse(), 6)).toEqual(inset);
  });

  it("returns the normalized source for a zero inset", () => {
    expect(deriveInsetPolygon([...rectangle].reverse(), 0)).toEqual(rectangle);
  });

  it("rejects invalid and collapsed inset requests", () => {
    expect(() => deriveInsetPolygon(rectangle, -1)).toThrow(/non-negative/i);
    expect(() => deriveInsetPolygon(rectangle, Number.NaN)).toThrow(/finite/i);
    expect(() => deriveInsetPolygon(rectangle, 72)).toThrow(/collapse|inside/i);
  });
});
