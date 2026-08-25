import { describe, expect, it } from "vitest";
import {
  EMPTY_DESIGN, addPoint, closestPointOnHouseEdge, deletePoint, feetAndInchesToMm, fenceLineCount, fencePathForPoint, formatFeetInches, insertGateAtPoint, insertGateOnSegment, isPointAttached, isPointOnHouseEdge, movePoint, movePointWithLockedFollowing,
  normalizeDesign, pointRole, removeHouseReference, segmentLengthMm, setHouseReference, setSegmentKind, setSegmentLengthKeepingEndMm, setSegmentLengthMm, snapPlanPosition, snapRunEndpoint, snapToFenceRun, snapToHouseEdge, solvePathBetweenFixedEndsMm, startFenceLine,
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

  it("solves a new angle while keeping a segment end and its preceding length fixed", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: 3_000, yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: 3_000, yMm: 4_000 }, "segment-2");
    const edited = setSegmentLengthKeepingEndMm(design, "segment-2", 3_000, true);
    expect(edited.points[2]).toEqual(design.points[2]);
    expect(segmentLengthMm(edited, edited.segments[0])).toBe(3_000);
    expect(segmentLengthMm(edited, edited.segments[1])).toBe(3_000);
    expect(edited.points[1]).not.toEqual(design.points[1]);
  });

  it("reports when locked geometry cannot reach a fixed endpoint", () => {
    const design = rectangleCorner();
    expect(() => setSegmentLengthKeepingEndMm(design, "segment-2", 305, true)).toThrow(/cannot reach/);
  });

  it("closes a multi-angle path between fixed endpoints while preserving every measured run", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: 3_000, yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: 5_000, yMm: 2_500 }, "segment-2");
    design = addPoint(design, { id: "point-4", xMm: 7_500, yMm: 4_000 }, "segment-3");
    design = addPoint(design, { id: "point-5", xMm: 9_500, yMm: 2_000 }, "segment-4");
    const lengths = design.segments.map((segment) => segmentLengthMm(design, segment));
    const solved = solvePathBetweenFixedEndsMm(design, { xMm: 8_000, yMm: 1_000 });
    expect(solved.points[0]).toEqual(design.points[0]);
    expect(solved.points.at(-1)).toMatchObject({ xMm: 8_000, yMm: 1_000 });
    solved.segments.forEach((segment, index) => expect(Math.abs(segmentLengthMm(solved, segment) - lengths[index])).toBeLessThanOrEqual(2));
    expect(solved.points.slice(1, -1)).not.toEqual(design.points.slice(1, -1));
  });

  it("re-solves all flexible angles when one closed-path measurement changes", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: 3_000, yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: 5_000, yMm: 2_500 }, "segment-2");
    design = addPoint(design, { id: "point-4", xMm: 7_500, yMm: 4_000 }, "segment-3");
    const originalLengths = design.segments.map((segment) => segmentLengthMm(design, segment));
    const solved = solvePathBetweenFixedEndsMm(design, design.points.at(-1)!, { segmentId: "segment-2", lengthMm: 3_500 });
    expect(solved.points[0]).toEqual(design.points[0]);
    expect(solved.points.at(-1)).toEqual(design.points.at(-1));
    expect(Math.abs(segmentLengthMm(solved, solved.segments[0]) - originalLengths[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(segmentLengthMm(solved, solved.segments[1]) - 3_500)).toBeLessThanOrEqual(2);
    expect(Math.abs(segmentLengthMm(solved, solved.segments[2]) - originalLengths[2])).toBeLessThanOrEqual(2);
  });

  it("rejects a closure point outside the measured chain reach", () => {
    expect(() => solvePathBetweenFixedEndsMm(rectangleCorner(), { xMm: 20_000, yMm: 0 })).toThrow(/cannot reach/);
  });

  it("recalculates connected lengths when a point moves", () => {
    const moved = movePoint(rectangleCorner(), "point-2", 1_524, 0);
    expect(totalLengthMm(moved)).toBe(1_524 + Math.round(Math.hypot(1_524, 3_048)));
  });

  it("rotates a selected point while translating the following chain with every length locked", () => {
    const design = rectangleCorner();
    const moved = movePointWithLockedFollowing(design, "point-2", 2_155, 2_155);
    expect(moved.points).toEqual([
      { id: "point-1", xMm: 0, yMm: 0 },
      { id: "point-2", xMm: 2_155, yMm: 2_155 },
      { id: "point-3", xMm: 2_155, yMm: 5_203 },
    ]);
    expect(moved.segments.map((segment) => segmentLengthMm(moved, segment))).toEqual([3_048, 3_048]);
  });

  it("translates the whole path when the first point moves with lengths locked", () => {
    const design = rectangleCorner();
    const moved = movePointWithLockedFollowing(design, "point-1", 500, -250);
    expect(moved.points).toEqual([
      { id: "point-1", xMm: 500, yMm: -250 },
      { id: "point-2", xMm: 3_548, yMm: -250 },
      { id: "point-3", xMm: 3_548, yMm: 2_798 },
    ]);
    expect(totalLengthMm(moved)).toBe(totalLengthMm(design));
  });

  it("starts a separate fence line without connecting it to the previous endpoint", () => {
    const perimeter = rectangleCorner();
    let design = startFenceLine(perimeter, { id: "point-4", xMm: 1_524, yMm: 0 });
    design = addPoint(design, { id: "point-5", xMm: 1_524, yMm: 2_000 }, "segment-4");
    expect(fenceLineCount(design)).toBe(2);
    expect(design.segments).toHaveLength(3);
    expect(fencePathForPoint(design, "point-4").points.map(({ id }) => id)).toEqual(["point-4", "point-5"]);
    expect(design.segments.some(({ fromPointId, toPointId }) => fromPointId === "point-3" && toPointId === "point-4")).toBe(false);
    expect(totalLengthMm(design)).toBe(totalLengthMm(perimeter) + 2_000);
  });

  it("snaps a divider start to the middle of an existing perimeter run", () => {
    const design = rectangleCorner();
    expect(snapToFenceRun(design, 1_524, 120)).toMatchObject({ xMm: 1_524, yMm: 0, segmentId: "segment-1" });
    expect(snapToFenceRun(design, 1_524, 800)).toBeNull();
  });

  it("identifies separate-line endpoints attached partway along perimeter runs", () => {
    let design = addPoint(rectangleCorner(), { id: "point-4", xMm: 0, yMm: 3_048 }, "segment-3");
    design = startFenceLine(design, { id: "point-5", xMm: 1_524, yMm: 0 });
    design = addPoint(design, { id: "point-6", xMm: 1_524, yMm: 1_524 }, "segment-4");
    design = addPoint(design, { id: "point-7", xMm: 0, yMm: 3_048 }, "segment-5");
    expect(isPointAttached(design, "point-5")).toBe(true);
    expect(isPointAttached(design, "point-7")).toBe(true);
    expect(pointRole(design, "point-5")).toBe("attached endpoint");
    const solved = solvePathBetweenFixedEndsMm(design, design.points.at(-1)!, { segmentId: "segment-4", lengthMm: 1_800 });
    expect(solved.points.find(({ id }) => id === "point-5")).toEqual(design.points.find(({ id }) => id === "point-5"));
    expect(solved.points.find(({ id }) => id === "point-7")).toEqual(design.points.find(({ id }) => id === "point-7"));
    expect(Math.abs(segmentLengthMm(solved, solved.segments.find(({ id }) => id === "segment-4")!) - 1_800)).toBeLessThanOrEqual(2);
  });

  it("moves a locked secondary line without moving the perimeter", () => {
    const perimeter = rectangleCorner();
    let design = startFenceLine(perimeter, { id: "point-4", xMm: 1_000, yMm: 1_000 });
    design = addPoint(design, { id: "point-5", xMm: 2_000, yMm: 1_000 }, "segment-4");
    design = addPoint(design, { id: "point-6", xMm: 2_000, yMm: 2_000 }, "segment-5");
    const moved = movePointWithLockedFollowing(design, "point-4", 1_500, 1_500);
    expect(moved.points.slice(0, 3)).toEqual(perimeter.points);
    expect(moved.points.slice(3)).toEqual([
      { id: "point-4", xMm: 1_500, yMm: 1_500 },
      { id: "point-5", xMm: 2_500, yMm: 1_500 },
      { id: "point-6", xMm: 2_500, yMm: 2_500 },
    ]);
  });

  it("adds a gate to a secondary line without joining it to the perimeter path", () => {
    const perimeter = rectangleCorner();
    let design = startFenceLine(perimeter, { id: "point-4", xMm: 1_000, yMm: 0 });
    design = addPoint(design, { id: "point-5", xMm: 1_000, yMm: 3_000 }, "segment-4");
    const edited = insertGateAtPoint(design, "point-4", 1_000, "single", "point-6", "segment-5");
    expect(fenceLineCount(edited)).toBe(2);
    expect(edited.segments.find(({ id }) => id === "segment-5")).toMatchObject({ fromPointId: "point-4", toPointId: "point-6", kind: "gate" });
    expect(fencePathForPoint(edited, "point-4").segments).toHaveLength(2);
    expect(edited.points.slice(0, 3)).toEqual(perimeter.points);
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

  it("finds and recognizes exact house connections independently of angle assistance", () => {
    const house = { xMm: 0, yMm: 0, lengthMm: 12_192, widthMm: 9_144 };
    expect(closestPointOnHouseEdge(house, 12_000, 4_600)).toEqual({ xMm: 12_192, yMm: 4_600 });
    expect(snapToHouseEdge(12_000, 4_600, house)).toEqual({ xMm: 12_192, yMm: 4_600 });
    expect(snapToHouseEdge(10_000, 4_600, house)).toBeNull();
    expect(isPointOnHouseEdge({ xMm: 12_192, yMm: 4_600 }, house)).toBe(true);
  });

  it("locks prospective runs to deterministic 45-degree bearings only when snap is on", () => {
    const anchor = { xMm: 1_000, yMm: 2_000 };
    expect(snapRunEndpoint(anchor, { xMm: 4_000, yMm: 2_400 }, true)).toEqual({ xMm: 4_027, yMm: 2_000 });
    expect(snapRunEndpoint(anchor, { xMm: 3_100, yMm: 4_000 }, true)).toEqual({ xMm: 3_051, yMm: 4_051 });
    expect(snapRunEndpoint(anchor, { xMm: 4_000, yMm: 2_400 }, false)).toEqual({ xMm: 4_000, yMm: 2_400 });
    expect(snapRunEndpoint(anchor, { xMm: 4_000, yMm: 2_400 }, true)).not.toEqual(snapRunEndpoint(anchor, snapPlanPosition(4_000, 2_400, true, null), true));
  });

  it("uses the previous segment bearing as the origin for relative angle assistance", () => {
    const referenceBearing = Math.PI / 6;
    const anchor = { xMm: 1_000, yMm: 1_000 };
    const snapped = snapRunEndpoint(anchor, { xMm: 4_000, yMm: 2_000 }, true, 45, referenceBearing);
    const snappedBearing = Math.atan2(snapped.yMm - anchor.yMm, snapped.xMm - anchor.xMm);
    expect(snappedBearing).toBeCloseTo(referenceBearing, 3);
    expect(snapped.yMm).not.toBe(anchor.yMm);
  });

  it("places a gate anywhere inside one straight fence run without changing its total or bearing", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: feetAndInchesToMm(20, 0), yMm: 0 }, "segment-1");
    const edited = insertGateOnSegment(design, "segment-1", feetAndInchesToMm(4, 0), feetAndInchesToMm(8, 0), "double", "point-3", "point-4", "segment-2", "segment-3");
    expect(edited.segments).toEqual([
      { id: "segment-1", fromPointId: "point-1", toPointId: "point-3", kind: "fence" },
      { id: "segment-2", fromPointId: "point-3", toPointId: "point-4", kind: "gate", gateType: "double" },
      { id: "segment-3", fromPointId: "point-4", toPointId: "point-2", kind: "fence" },
    ]);
    expect(edited.points.every(({ yMm }) => yMm === 0)).toBe(true);
    expect(segmentLengthMm(edited, edited.segments[1])).toBe(feetAndInchesToMm(4, 0));
    expect(totalLengthMm(edited)).toBe(totalLengthMm(design));
  });

  it("inserts a measured double gate from a selected point and preserves the original total", () => {
    const design = rectangleCorner();
    const edited = insertGateAtPoint(design, "point-1", feetAndInchesToMm(4, 0), "double", "point-4", "segment-4");
    expect(edited.points[1]).toEqual({ id: "point-4", xMm: 1_219, yMm: 0 });
    expect(edited.segments[0]).toEqual({ id: "segment-4", fromPointId: "point-1", toPointId: "point-4", kind: "gate", gateType: "double" });
    expect(edited.segments[1]).toMatchObject({ id: "segment-1", fromPointId: "point-4", toPointId: "point-2", kind: "fence" });
    expect(totalLengthMm(edited)).toBe(totalLengthMm(design));
  });

  it("extends a measured single gate from the final endpoint along the preceding bearing", () => {
    const design = rectangleCorner();
    const edited = insertGateAtPoint(design, "point-3", feetAndInchesToMm(3, 0), "single", "point-4", "segment-4");
    expect(edited.points.at(-1)).toEqual({ id: "point-4", xMm: 3_048, yMm: 3_962 });
    expect(edited.segments.at(-1)).toEqual({ id: "segment-4", fromPointId: "point-3", toPointId: "point-4", kind: "gate", gateType: "single" });
    expect(totalLengthMm(edited)).toBe(totalLengthMm(design) + 914);
  });

  it("rejects a gate wider than the fence span following its anchor", () => {
    expect(() => insertGateAtPoint(rectangleCorner(), "point-1", feetAndInchesToMm(12, 0), "single", "point-4", "segment-4")).toThrow(/must fit/);
  });
});

describe("validated serialization", () => {
  it("round-trips stable schema-versioned JSON", () => {
    const design = setSegmentKind(rectangleCorner(), "segment-2", "gate", "double");
    const json = stableDesignJson(design);
    const restored = normalizeDesign(JSON.parse(json));
    expect(stableDesignJson(restored)).toBe(json);
    expect(restored.segments[1]).toMatchObject({ kind: "gate", gateType: "double" });
  });

  it("accepts separate ordered fence lines and rejects branching topology", () => {
    const design = rectangleCorner();
    const separate = startFenceLine(design, { id: "point-4", xMm: 8_000, yMm: 8_000 });
    expect(normalizeDesign(separate)).toEqual(separate);
    expect(() => normalizeDesign({ ...design, segments: [...design.segments, { id: "segment-3", fromPointId: "point-1", toPointId: "point-3", kind: "fence" }] })).toThrow(/more than one/);
  });

  it("migrates saved schema-v1 layouts with no invented house measurement", () => {
    const design = rectangleCorner();
    const migrated = normalizeDesign({ ...design, schemaVersion: 1, house: undefined });
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.house).toBeNull();
  });
});
