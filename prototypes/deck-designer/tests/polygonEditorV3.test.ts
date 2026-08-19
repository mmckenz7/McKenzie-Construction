// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { addBumpoutOnEdge, movePolygonCorner, movePolygonSegment } from "../src/polygonEditorV3";
import { normalizePolygon } from "../src/polygon";

const rectangle = Object.freeze([{ x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 144 }, { x: 0, z: 144 }]);

describe("direct v3 polygon authoring", () => {
  it("adds a snapped rectangular bumpout whose center segment remains parallel", () => {
    const next = addBumpoutOnEdge(rectangle, 1, { x: 192, z: 61 }, 6);
    expect(next).toHaveLength(8);
    expect(next.slice(2, 6)).toEqual([
      { x: 192, z: 48 }, { x: 198, z: 48 }, { x: 198, z: 72 }, { x: 192, z: 72 },
    ]);
    expect(normalizePolygon(next)).toEqual(next);
  });

  it("moves both segment endpoints while adjacent segments remain attached", () => {
    const next = movePolygonSegment(rectangle, 2, 24, 6);
    expect(next).toEqual([{ x: 0, z: 0 }, { x: 192, z: 0 }, { x: 192, z: 168 }, { x: 0, z: 168 }]);
    expect(normalizePolygon(next)).toEqual(next);
  });

  it("anchors a bumpout to an existing corner when the click is near the edge endpoint", () => {
    const next = addBumpoutOnEdge(rectangle, 1, { x: 192, z: 2 }, 6);
    expect(next).toHaveLength(6);
    expect(next.slice(1, 4)).toEqual([
      { x: 198, z: 0 }, { x: 198, z: 24 }, { x: 192, z: 24 },
    ]);
    expect(normalizePolygon(next)).toEqual(next);
  });

  it("merges a bumpout side or corner when it aligns with an existing corner", () => {
    const bumpout = addBumpoutOnEdge(rectangle, 1, { x: 192, z: 60 }, 6);
    const movedSide = movePolygonSegment(bumpout, 2, 48, 6);
    expect(movedSide).toHaveLength(6);
    expect(movedSide[1]).toEqual({ x: 198, z: 0 });
    expect(normalizePolygon(movedSide)).toEqual(movedSide);
    const mergedCorner = movePolygonCorner(bumpout, 2, bumpout[1]);
    expect(mergedCorner).toHaveLength(7);
    expect(normalizePolygon(mergedCorner)).toEqual(mergedCorner);
  });

  it("magnetically aligns a dragged corner to nearby corner axes", () => {
    const bumpout = addBumpoutOnEdge(rectangle, 1, { x: 192, z: 60 }, 6);
    const next = movePolygonCorner(bumpout, 2, { x: 197, z: 5 }, true, 6);
    expect(next).toHaveLength(6);
    expect(next[1]).toEqual({ x: 198, z: 0 });
    expect(normalizePolygon(next)).toEqual(next);
  });

  it("magnetically aligns a moved side to a nearby corner line", () => {
    const bumpout = addBumpoutOnEdge(rectangle, 1, { x: 192, z: 60 }, 6);
    const next = movePolygonSegment(bumpout, 2, 43, 6);
    expect(next).toHaveLength(6);
    expect(next[1]).toEqual({ x: 198, z: 0 });
    expect(normalizePolygon(next)).toEqual(next);
  });

  it("rejects corner insertion on segments too short for snapped placement", () => {
    const narrow = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 60 }, { x: 0, z: 60 }];
    expect(() => addBumpoutOnEdge(narrow, 0, { x: 6, z: 0 }, 6)).toThrow(/too short/i);
  });
});
