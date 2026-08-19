// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import {
  horizontalRegionIntervalsAt,
  normalizePolygonRegion,
  polygonRegionArea,
  verticalRegionIntervalsAt,
} from "../src/polygonRegion";

const outer = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 180 }, { x: 0, z: 180 }];
const hole = [{ x: 72, z: 60 }, { x: 168, z: 60 }, { x: 168, z: 120 }, { x: 72, z: 120 }];

describe("polygon region hole spike", () => {
  it("normalizes contained holes and subtracts their area", () => {
    const region = normalizePolygonRegion({ outer, holes: [hole] });
    expect(Object.isFrozen(region)).toBe(true);
    expect(Object.isFrozen(region.holes)).toBe(true);
    expect(polygonRegionArea(region)).toBe(37440);
  });

  it("splits horizontal and vertical member intervals around holes", () => {
    const region = { outer, holes: [hole] };
    expect(horizontalRegionIntervalsAt(region, 30)).toEqual([{ start: 0, end: 240 }]);
    expect(horizontalRegionIntervalsAt(region, 90)).toEqual([{ start: 0, end: 72 }, { start: 168, end: 240 }]);
    expect(verticalRegionIntervalsAt(region, 24)).toEqual([{ start: 0, end: 180 }]);
    expect(verticalRegionIntervalsAt(region, 120)).toEqual([{ start: 0, end: 60 }, { start: 120, end: 180 }]);
  });

  it("rejects holes outside, touching, overlapping, or nested within another hole", () => {
    expect(() => normalizePolygonRegion({ outer, holes: [[{ x: 220, z: 60 }, { x: 260, z: 60 }, { x: 260, z: 120 }, { x: 220, z: 120 }]] })).toThrow(/strictly inside/);
    expect(() => normalizePolygonRegion({ outer, holes: [[{ x: 0, z: 60 }, { x: 48, z: 60 }, { x: 48, z: 120 }, { x: 0, z: 120 }]] })).toThrow(/strictly inside/);
    expect(() => normalizePolygonRegion({ outer, holes: [hole, [{ x: 120, z: 90 }, { x: 204, z: 90 }, { x: 204, z: 150 }, { x: 120, z: 150 }]] })).toThrow(/touch, overlap/);
    expect(() => normalizePolygonRegion({ outer, holes: [hole, [{ x: 96, z: 72 }, { x: 144, z: 72 }, { x: 144, z: 108 }, { x: 96, z: 108 }]] })).toThrow(/touch, overlap/);
  });
});
