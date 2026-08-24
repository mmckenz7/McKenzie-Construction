import { describe, expect, it } from "vitest";
import {
  EMPTY_DESIGN, addPoint, deletePoint, feetAndInchesToMm, formatFeetInches, movePoint,
  normalizeDesign, pointRole, removeHouseReference, segmentLengthMm, setHouseReference, setSegmentKind, setSegmentLengthMm, snapPlanPosition, snapRunEndpoint,
  stableDesignJson, totalLengthMm,
} from "../src/model";

const rectangleCorner = () => {
  let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
  design = addPoint(design, { id: "point-2", xMm: 3_048, yMm: 0 }, "segment-1");
  return addPoint(design, { id: "point-3", xMm: 3_048, yMm: 3_048 }, "segment-2");
};

describe("deterministic fence geometry", () => {
  it("rounds each Euclidean segment once to integer millimeters and sums those values", () => {
    const design = rectangleCorner();
    expect(segmentLengthMm(design, design.segments[0])).toBe(3_048);
    expect(segmentLengthMm(design, design.segments[1])).toBe(3_048);
    expect(totalLengthMm(design)).toBe(6_096);
    expect(formatFeetInches(totalLengthMm(design))).toBe("20′ 0″");
  });

  it("moves the selected segment end along the existing bearing for exact edits", () => {
    const design = rectangleCorner();
    const edited = setSegmentLengthMm(design, "segment-1", feetAndInchesToMm(12, 6));
    expect(edited.points[0]).toMatchObject({ xMm: 0, yMm: 0 });
    expect(edited.points[1]).toMatchObject({ xMm: 3_810, yMm: 0 });
    expect(segmentLengthMm(edited, edited.segments[0])).toBe(3_810);
    expect(segmentLengthMm(edited, edited.segments[1])).toBe(Math.round(Math.hypot(762, 3_048)));
  });

  it("recalculates connected lengths when a point moves", () => {
    const moved = movePoint(rectangleCorner(), "point-2", 1_524, 0);
    expect(totalLengthMm(moved)).toBe(1_524 + Math.round(Math.hypot(1_524, 3_048)));
  });

  it("identifies open endpoints, corners, and inline points", () => {
    const design = rectangleCorner();
    expect(pointRole(design, "point-1")).toBe("open endpoint");
    expect(pointRole(design, "point-2")).toBe("corner");
    expect(pointRole(design, "point-3")).toBe("open endpoint");
    const inline = movePoint(design, "point-3", 6_096, 0);
    expect(pointRole(inline, "point-2")).toBe("inline");
  });

  it("reconnects adjacent points after deleting an interior point", () => {
    const design = setSegmentKind(rectangleCorner(), "segment-1", "gate");
    const edited = deletePoint(design, "point-2", "segment-3");
    expect(edited.points.map(({ id }) => id)).toEqual(["point-1", "point-3"]);
    expect(edited.segments).toEqual([{ id: "segment-3", fromPointId: "point-1", toPointId: "point-3", kind: "fence" }]);
  });

  it("adds, edits, and removes an exact house reference without changing fence totals", () => {
    const design = rectangleCorner();
    const withHouse = setHouseReference(design, feetAndInchesToMm(42, 6), feetAndInchesToMm(30, 0));
    expect(withHouse.house).toEqual({ xMm: 0, yMm: 0, lengthMm: 12_954, widthMm: 9_144 });
    expect(totalLengthMm(withHouse)).toBe(totalLengthMm(design));
    expect(removeHouseReference(withHouse).house).toBeNull();
  });

  it("snaps fence points to the middle of any nearby house edge only when snap is on", () => {
    const house = { xMm: 0, yMm: 0, lengthMm: 12_192, widthMm: 9_144 };
    expect(snapPlanPosition(6_100, 120, true, house)).toEqual({ xMm: 6_100, yMm: 0 });
    expect(snapPlanPosition(12_050, 4_570, true, house)).toEqual({ xMm: 12_192, yMm: 4_575 });
    expect(snapPlanPosition(6_100, 120, false, house)).toEqual({ xMm: 6_100, yMm: 120 });
  });

  it("locks prospective runs to deterministic 45-degree bearings only when snap is on", () => {
    const anchor = { xMm: 1_000, yMm: 2_000 };
    expect(snapRunEndpoint(anchor, { xMm: 4_000, yMm: 2_400 }, true)).toEqual({ xMm: 4_027, yMm: 2_000 });
    expect(snapRunEndpoint(anchor, { xMm: 3_100, yMm: 4_000 }, true)).toEqual({ xMm: 3_051, yMm: 4_051 });
    expect(snapRunEndpoint(anchor, { xMm: 4_000, yMm: 2_400 }, false)).toEqual({ xMm: 4_000, yMm: 2_400 });
  });
});

describe("validated serialization", () => {
  it("round-trips stable schema-versioned JSON", () => {
    const design = setSegmentKind(rectangleCorner(), "segment-2", "gate");
    const json = stableDesignJson(design);
    expect(stableDesignJson(normalizeDesign(JSON.parse(json)))).toBe(json);
  });

  it("rejects disconnected segment topology", () => {
    const design = rectangleCorner();
    expect(() => normalizeDesign({ ...design, segments: [{ ...design.segments[0], toPointId: "point-3" }, design.segments[1]] })).toThrow(/adjacent points/);
  });

  it("migrates saved schema-v1 layouts with no invented house measurement", () => {
    const design = rectangleCorner();
    const migrated = normalizeDesign({ ...design, schemaVersion: 1, house: undefined });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.house).toBeNull();
  });
});
