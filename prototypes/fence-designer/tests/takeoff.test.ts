import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint, feetAndInchesToMm, setGateType, setSegmentKind, type FenceDesign } from "../src/model";
import { calculateBlackAluminumTakeoff, formatBlackAluminumTakeoffText } from "../src/takeoff";

function line(lengthsFeet: readonly number[]): FenceDesign {
  let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
  let xMm = 0;
  lengthsFeet.forEach((length, index) => {
    xMm += feetAndInchesToMm(length, 0);
    design = addPoint(design, { id: `point-${index + 2}`, xMm, yMm: 0 }, `segment-${index + 1}`);
  });
  return design;
}

describe("black aluminum material takeoff", () => {
  it("uses eight-foot panels with end posts and internal line posts", () => {
    const takeoff = calculateBlackAluminumTakeoff(line([16]));
    expect(takeoff).toMatchObject({ panelCount: 2, endPosts: 2, cornerPosts: 0, linePosts: 1 });
    expect(takeoff.layout.panels.map(({ lengthMm, cut }) => ({ lengthMm, cut }))).toEqual([
      { lengthMm: feetAndInchesToMm(8, 0), cut: false },
      { lengthMm: feetAndInchesToMm(16, 0) - feetAndInchesToMm(8, 0), cut: false },
    ]);
    expect(takeoff.layout.posts.map(({ kind, reason, xMm }) => ({ kind, reason, xMm }))).toEqual([
      { kind: "end", reason: "open_end", xMm: 0 },
      { kind: "end", reason: "open_end", xMm: feetAndInchesToMm(16, 0) },
      { kind: "line", reason: "panel_boundary", xMm: feetAndInchesToMm(8, 0) },
    ]);
    expect(takeoff.layout.panels.reduce((sum, panel) => sum + panel.lengthMm, 0)).toBe(takeoff.fenceLengthMm);
  });

  it("formats a deterministic preliminary report without pricing or products", () => {
    const report = formatBlackAluminumTakeoffText(calculateBlackAluminumTakeoff(line([16])));
    expect(report).toBe([
      "BLACK ALUMINUM TAKEOFF — PRELIMINARY",
      "Fence length: 16′ 0″",
      "8′ panels: 2",
      "",
      "POSTS",
      "End posts: 2",
      "Corner posts: 0",
      "Run posts: 1",
      "",
      "GATES AND HARDWARE",
      "Single gates: 0",
      "Double gates: 0",
      "Hinges: 0",
      "Latches: 0",
      "Center drop poles: 0",
      "Gate openings:",
      "- None",
      "",
      "PANEL LAYOUT",
      "- Run 1: 8′ 0″ full + 8′ 0″ full",
      "",
      "POST DECISIONS",
      "- Open fence end: 2",
      "- Standard panel boundary: 1",
      "",
      "Measurement-derived only. No products, pricing, labor, or supplier selections. Cutoffs are not reused.",
    ].join("\n"));
  });

  it("rounds a partial panel up without reusing its cutoff", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: feetAndInchesToMm(8, 1), yMm: 0 }, "segment-1");
    expect(calculateBlackAluminumTakeoff(design)).toMatchObject({ panelCount: 2, linePosts: 1 });
  });

  it("does not turn a collinear measurement point into an extra panel or post", () => {
    const takeoff = calculateBlackAluminumTakeoff(line([4, 4]));
    expect(takeoff).toMatchObject({ panelCount: 1, endPosts: 2, cornerPosts: 0, linePosts: 0 });
  });

  it("breaks panel runs and counts one corner post at an actual turn", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: feetAndInchesToMm(10, 0), yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: feetAndInchesToMm(10, 0), yMm: feetAndInchesToMm(10, 0) }, "segment-2");
    expect(calculateBlackAluminumTakeoff(design)).toMatchObject({ panelCount: 4, endPosts: 2, cornerPosts: 1, linePosts: 2 });
  });

  it("adds single-gate hardware and uses an end post on both non-corner sides", () => {
    let design = line([8, 4, 8]);
    design = setSegmentKind(design, "segment-2", "gate");
    const takeoff = calculateBlackAluminumTakeoff(design);
    expect(takeoff).toMatchObject({ panelCount: 2, endPosts: 4, cornerPosts: 0, linePosts: 0, singleGates: 1, doubleGates: 0, hinges: 2, latches: 1, centerDropPoles: 0 });
    expect(takeoff.gateOpenings).toEqual([{ gateType: "single", widthMm: feetAndInchesToMm(4, 0), count: 1 }]);
    expect(takeoff.layout.posts.filter(({ reason }) => reason === "gate_side")).toHaveLength(2);
  });

  it("lets a corner post serve one side of a double gate and adds no center post", () => {
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: feetAndInchesToMm(8, 0), yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: feetAndInchesToMm(8, 0), yMm: feetAndInchesToMm(10, 0) }, "segment-2");
    design = setSegmentKind(design, "segment-2", "gate");
    design = setGateType(design, "segment-2", "double");
    const takeoff = calculateBlackAluminumTakeoff(design);
    expect(takeoff).toMatchObject({ panelCount: 1, endPosts: 2, cornerPosts: 1, linePosts: 0, singleGates: 0, doubleGates: 1, hinges: 4, latches: 1, centerDropPoles: 1 });
    expect(takeoff.layout.posts.find(({ reason }) => reason === "corner_gate")).toMatchObject({ kind: "corner", xMm: feetAndInchesToMm(8, 0), yMm: 0 });
  });

  it("uses one run post for a mid-run divider connection instead of an end post", () => {
    let design = line([16]);
    design = addPoint(design, { id: "point-3", xMm: feetAndInchesToMm(8, 0), yMm: 0 }, undefined, null);
    design = addPoint(design, { id: "point-4", xMm: feetAndInchesToMm(8, 0), yMm: feetAndInchesToMm(8, 0) }, "segment-3", "point-3");
    expect(calculateBlackAluminumTakeoff(design)).toMatchObject({ panelCount: 3, endPosts: 3, linePosts: 1, warnings: [] });
    const takeoff = calculateBlackAluminumTakeoff(design);
    expect(takeoff.layout.posts.find(({ reason }) => reason === "natural_t")).toMatchObject({ kind: "line", xMm: feetAndInchesToMm(8, 0), yMm: 0 });
  });

  it("adds an end post when a mid-run connection misses the natural panel posts", () => {
    let design = line([16]);
    design = addPoint(design, { id: "point-3", xMm: feetAndInchesToMm(5, 0), yMm: 0 }, undefined, null);
    design = addPoint(design, { id: "point-4", xMm: feetAndInchesToMm(5, 0), yMm: feetAndInchesToMm(8, 0) }, "segment-3", "point-3");
    const takeoff = calculateBlackAluminumTakeoff(design);
    expect(takeoff).toMatchObject({ panelCount: 3, endPosts: 4, linePosts: 1, warnings: [] });
    expect(takeoff.layout.posts.find(({ reason }) => reason === "added_t_end")).toMatchObject({ kind: "end", xMm: feetAndInchesToMm(5, 0), yMm: 0 });
    expect(takeoff.layout.posts.find(({ reason }) => reason === "panel_boundary")).toMatchObject({ kind: "line", xMm: feetAndInchesToMm(8, 0), yMm: 0 });
  });

  it("can use a natural panel post measured from either end of the run", () => {
    let design = line([13]);
    design = addPoint(design, { id: "point-3", xMm: feetAndInchesToMm(5, 0), yMm: 0 }, undefined, null);
    design = addPoint(design, { id: "point-4", xMm: feetAndInchesToMm(5, 0), yMm: feetAndInchesToMm(8, 0) }, "segment-3", "point-3");
    const takeoff = calculateBlackAluminumTakeoff(design);
    expect(takeoff).toMatchObject({ panelCount: 3, endPosts: 3, linePosts: 1, warnings: [] });
    expect(takeoff.layout.panels.slice(0, 2).map(({ lengthMm }) => lengthMm)).toEqual([feetAndInchesToMm(5, 0), feetAndInchesToMm(8, 0)]);
    expect(takeoff.layout.posts.find(({ reason }) => reason === "natural_t")).toMatchObject({ xMm: feetAndInchesToMm(5, 0), yMm: 0 });
  });
});
