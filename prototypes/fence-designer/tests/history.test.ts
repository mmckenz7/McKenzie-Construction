import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redo, undo } from "../src/history";
import { EMPTY_DESIGN, addPoint, feetAndInchesToMm, gateOffsetFromReferenceMm, insertGateOnSegment, setSegmentLengthMm } from "../src/model";

describe("undo and redo", () => {
  it("restores deterministic whole-document states and clears redo after a new edit", () => {
    const first = { revision: 0, value: "empty" };
    const second = { revision: 1, value: "one point" };
    const third = { revision: 2, value: "one span" };
    const history = pushHistory(pushHistory(createHistory(first), second), third);
    const undone = undo(history);
    expect(undone.present).toBe(second);
    expect(redo(undone).present).toBe(third);
    const branched = pushHistory(undone, { revision: 3, value: "different span" });
    expect(branched.future).toEqual([]);
    expect(redo(branched)).toBe(branched);
  });

  it("undoes and redoes a gate placed from Post B as one canonical geometry revision", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: feetAndInchesToMm(20, 0), yMm: 0 }, "segment-1");
    const width = feetAndInchesToMm(4, 0);
    const placed = insertGateOnSegment(design, "segment-1", width, gateOffsetFromReferenceMm(feetAndInchesToMm(20, 0), width, feetAndInchesToMm(2, 0), "post-b"), "single", "point-3", "point-4", "segment-2", "segment-3");
    const history = pushHistory(createHistory(design), placed);
    expect(undo(history).present).toBe(design);
    expect(redo(undo(history)).present).toBe(placed);
  });

  it("undoes and redoes an authored exact-length translation as one revision", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: 6_096, yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: 6_096, yMm: 9_144 }, "segment-2");
    design = addPoint(design, { id: "point-4", xMm: 12_166, yMm: 9_144 }, "segment-3");
    const edited = setSegmentLengthMm(design, "segment-2", feetAndInchesToMm(33, 0));
    const history = pushHistory(createHistory(design), edited);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(design);
    expect(redo(undo(history)).present).toBe(edited);
    expect(edited.revision).toBe(design.revision + 1);
  });
});
