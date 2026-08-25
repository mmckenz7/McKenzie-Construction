// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { movePolygonSegment } from "../src/polygonEditorV3";
import { validatePhotoTrace } from "../src/PhotoOutlineTracer";
import { photoTraceCornerKeyboardMove, photoTraceSegmentKeyboardMove } from "../src/photoTraceKeyboard";

const rectangle = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 144, z: 0 }),
  Object.freeze({ x: 144, z: 144 }),
  Object.freeze({ x: 0, z: 144 }),
]);

describe("temporary photo-trace keyboard movement", () => {
  it("moves a free corner in both plan axes on the fixed trace snap", () => {
    const left = photoTraceCornerKeyboardMove(rectangle, 2, "ArrowLeft", 6);
    const down = photoTraceCornerKeyboardMove(rectangle, 2, "ArrowDown", 6);
    expect(left).toEqual({ handled: true, outer: [{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 138, z: 144 }, { x: 0, z: 144 }] });
    expect(down.outer[2]).toEqual({ x: 144, z: 150 });
    expect(validatePhotoTrace(left.outer)).toEqual(left.outer);
  });

  it("keeps a house-line corner on the exact house line", () => {
    expect(photoTraceCornerKeyboardMove(rectangle, 0, "ArrowRight", 6, true).outer[0]).toEqual({ x: 6, z: 0 });
    const blockedAxis = photoTraceCornerKeyboardMove(rectangle, 0, "ArrowDown", 6, true);
    expect(blockedAxis).toEqual({ handled: true, outer: rectangle });
  });

  it("moves horizontal and vertical segments only on their perpendicular axes", () => {
    const edges = deriveGeometricPolygonEdges(rectangle);
    const horizontal = photoTraceSegmentKeyboardMove(rectangle, 2, "ArrowUp", 6);
    const vertical = photoTraceSegmentKeyboardMove(rectangle, 1, "ArrowLeft", 6);
    expect(horizontal.handled).toBe(true);
    expect(horizontal.outer.slice(2, 4)).toEqual([{ x: 144, z: 138 }, { x: 0, z: 138 }]);
    expect(vertical.handled).toBe(true);
    expect(vertical.outer.slice(1, 3)).toEqual([{ x: 138, z: 0 }, { x: 138, z: 144 }]);
    expect(photoTraceSegmentKeyboardMove(rectangle, 2, "ArrowRight", 6)).toEqual({ handled: false, outer: rectangle });
    expect(edges[2].outward).toEqual({ x: 0, z: 1 });
  });

  it("matches the existing pointer segment operation for the same snapped move", () => {
    const keyboard = photoTraceSegmentKeyboardMove(rectangle, 2, "ArrowDown", 6);
    const pointer = movePolygonSegment(rectangle, 2, 6, 6, false);
    expect(keyboard.outer).toEqual(pointer);
  });

  it("ignores unrelated keys without changing temporary state", () => {
    expect(photoTraceCornerKeyboardMove(rectangle, 2, "Enter", 6)).toEqual({ handled: false, outer: rectangle });
    expect(photoTraceSegmentKeyboardMove(rectangle, 2, "Tab", 6)).toEqual({ handled: false, outer: rectangle });
  });
});
