// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { PhotoOutlineTracer, validatePhotoTrace } from "../src/PhotoOutlineTracer";
import { photoTraceCornerFromPointer, photoTraceSegmentFromPointer, photoTraceStairOffsetFromPointer, samePhotoTrace } from "../src/photoTracePointer";

const rectangle = Object.freeze([{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: 0, z: 144 }]);

describe("temporary photo trace pointer transactions", () => {
  it("moves a free corner by snapped pointer delta instead of absolute touch position", () => {
    const moved = photoTraceCornerFromPointer(rectangle, 2, { x: 151, z: 137 }, { x: 163, z: 131 }, 6);
    expect(moved[2]).toEqual({ x: 156, z: 138 });
    expect(validatePhotoTrace(moved)).toEqual(moved);
  });

  it("keeps house corners on z=0 while honoring horizontal pointer delta", () => {
    const moved = photoTraceCornerFromPointer(rectangle, 0, { x: 7, z: 4 }, { x: 19, z: 28 }, 6, true);
    expect(moved[0]).toEqual({ x: 12, z: 0 });
  });

  it("moves horizontal and vertical segments only along their perpendicular axes", () => {
    const horizontal = photoTraceSegmentFromPointer(rectangle, 2, { x: 70, z: 151 }, { x: 100, z: 163 }, 6);
    const vertical = photoTraceSegmentFromPointer(rectangle, 1, { x: 151, z: 70 }, { x: 139, z: 100 }, 6);
    expect(horizontal[2].z).toBe(156);
    expect(horizontal[3].z).toBe(156);
    expect(vertical[1].x).toBe(132);
    expect(vertical[2].x).toBe(132);
  });

  it("treats tap, sub-snap motion, and return-to-origin as exact no-ops", () => {
    expect(photoTraceCornerFromPointer(rectangle, 2, { x: 151, z: 137 }, { x: 151, z: 137 }, 6)).toBe(rectangle);
    expect(photoTraceCornerFromPointer(rectangle, 2, { x: 151, z: 137 }, { x: 153, z: 135 }, 6)).toBe(rectangle);
    expect(photoTraceSegmentFromPointer(rectangle, 2, { x: 70, z: 151 }, { x: 70, z: 151 }, 6)).toBe(rectangle);
    expect(samePhotoTrace(photoTraceSegmentFromPointer(rectangle, 2, { x: 70, z: 151 }, { x: 70, z: 151 }, 6), rectangle)).toBe(true);
  });

  it("moves temporary stairs along either selected-edge direction and clamps both bounds", () => {
    const edges = deriveGeometricPolygonEdges(rectangle);
    expect(photoTraceStairOffsetFromPointer(edges[2], 24, 48, { x: 100, z: 150 }, { x: 88, z: 150 }, 6)).toBe(36);
    expect(photoTraceStairOffsetFromPointer(edges[0], 24, 48, { x: 50, z: 4 }, { x: 38, z: 4 }, 6)).toBe(12);
    expect(photoTraceStairOffsetFromPointer(edges[2], 24, 48, { x: 100, z: 150 }, { x: -1000, z: 150 }, 6)).toBe(96);
    expect(photoTraceStairOffsetFromPointer(edges[2], 24, 48, { x: 100, z: 150 }, { x: 1000, z: 150 }, 6)).toBe(0);
  });

  it("keeps temporary stair tap and sub-snap movement unchanged", () => {
    const edge = deriveGeometricPolygonEdges(rectangle)[2];
    expect(photoTraceStairOffsetFromPointer(edge, 24, 48, { x: 100, z: 150 }, { x: 100, z: 150 }, 6)).toBe(24);
    expect(photoTraceStairOffsetFromPointer(edge, 24, 48, { x: 100, z: 150 }, { x: 98, z: 150 }, 6)).toBe(24);
  });

  it("wires owning-pointer, cancel, lost-capture, pinch takeover, and one-snapshot completion", () => {
    const source = PhotoOutlineTracer.toString();
    expect(source).toContain("pointerId");
    expect(source).toContain("onLostPointerCapture");
    expect(source).toContain("cancelDrag");
    expect(source).toContain("cancelStairDrag");
    expect(source).toContain("rememberSnapshot(finished.start)");
    expect(source).toContain("touchPoints.current.size !== 2");
    expect((source.match(/cancelDrag/g) ?? []).length).toBeGreaterThan(3);
    expect((source.match(/cancelStairDrag/g) ?? []).length).toBeGreaterThan(3);
  });

  it("treats focused exact fields as one temporary factual transaction", () => {
    const source = PhotoOutlineTracer.toString();
    expect(source).toContain("exactEditStart");
    expect(source).toContain("beginExactEdit");
    expect(source).toContain("finishExactEdit");
    expect(source).toContain("cancelExactEdit");
    expect(source).toMatch(/traceExactGroup\s*===\s*group/);
    expect(source).toMatch(/event\.key\s*===\s*"Enter"/);
    expect(source).toMatch(/event\.key\s*===\s*"Escape"/);
    expect((source.match(/data-trace-exact-group/g) ?? []).length).toBe(6);
  });
});
