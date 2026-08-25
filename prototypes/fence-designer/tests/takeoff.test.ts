import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint, feetAndInchesToMm, insertGateOnSegment, setGateType, setSegmentKind, startFenceLine, type FenceDesign } from "../src/model";
import { calculateBlackAluminumTakeoff, calculateTreatedPinePrivacyTakeoff, formatBlackAluminumTakeoffText, formatTreatedPinePrivacyTakeoffText } from "../src/takeoff";

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
    expect(takeoff).toMatchObject({ panelCount: 2, fencePanelCount: 2, gatePanelCount: 0, endPosts: 2, cornerPosts: 0, linePosts: 1 });
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
      "- Fence runs: 2",
      "- Gate fabrication: 0",
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
      "GATE FABRICATION CUT PLAN",
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
    expect(takeoff).toMatchObject({ panelCount: 3, fencePanelCount: 2, gatePanelCount: 1, endPosts: 4, cornerPosts: 0, linePosts: 0, singleGates: 1, doubleGates: 0, hinges: 2, latches: 1, centerDropPoles: 0 });
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
    expect(takeoff).toMatchObject({ panelCount: 3, fencePanelCount: 1, gatePanelCount: 2, endPosts: 2, cornerPosts: 1, linePosts: 0, singleGates: 0, doubleGates: 1, hinges: 4, latches: 1, centerDropPoles: 1 });
    expect(takeoff.layout.posts.find(({ reason }) => reason === "corner_gate")).toMatchObject({ kind: "corner", xMm: feetAndInchesToMm(8, 0), yMm: 0 });
  });

  it("uses one fabrication panel through a six-foot double gate and two above six feet", () => {
    let sixFoot = line([8, 6, 8]);
    sixFoot = setGateType(setSegmentKind(sixFoot, "segment-2", "gate"), "segment-2", "double");
    let sevenFoot = line([8, 7, 8]);
    sevenFoot = setGateType(setSegmentKind(sevenFoot, "segment-2", "gate"), "segment-2", "double");
    expect(calculateBlackAluminumTakeoff(sixFoot)).toMatchObject({ fencePanelCount: 2, gatePanelCount: 1, panelCount: 3 });
    expect(calculateBlackAluminumTakeoff(sevenFoot)).toMatchObject({ fencePanelCount: 2, gatePanelCount: 2, panelCount: 4 });
    expect(calculateBlackAluminumTakeoff(sixFoot).gateFabricationPanels[0]).toMatchObject({ usedMm: feetAndInchesToMm(6, 0), wasteMm: feetAndInchesToMm(1, 0) });
    expect(calculateBlackAluminumTakeoff(sevenFoot).gateFabricationPanels.map(({ usedMm, wasteMm }) => ({ usedMm, wasteMm }))).toEqual([
      { usedMm: feetAndInchesToMm(3, 6), wasteMm: feetAndInchesToMm(3, 6) },
      { usedMm: feetAndInchesToMm(3, 6), wasteMm: feetAndInchesToMm(3, 6) },
    ]);
  });

  it("optimizes single-gate fabrication panels from the combined gate widths", () => {
    let fitsOnePanel = line([8, 2, 8, 2, 8, 3, 8]);
    fitsOnePanel = setSegmentKind(setSegmentKind(setSegmentKind(fitsOnePanel, "segment-2", "gate"), "segment-4", "gate"), "segment-6", "gate");
    let needsTwoPanels = line([8, 2, 8, 3, 8, 3, 8]);
    needsTwoPanels = setSegmentKind(setSegmentKind(setSegmentKind(needsTwoPanels, "segment-2", "gate"), "segment-4", "gate"), "segment-6", "gate");
    expect(calculateBlackAluminumTakeoff(fitsOnePanel)).toMatchObject({ singleGates: 3, gatePanelCount: 1 });
    expect(calculateBlackAluminumTakeoff(needsTwoPanels)).toMatchObject({ singleGates: 3, gatePanelCount: 2 });
    expect(calculateBlackAluminumTakeoff(fitsOnePanel).gateFabricationPanels[0]).toMatchObject({ usedMm: feetAndInchesToMm(7, 0), wasteMm: 0 });
    expect(Math.abs(calculateBlackAluminumTakeoff(needsTwoPanels).gateFabricationPanels.reduce((sum, panel) => sum + panel.wasteMm, 0) - feetAndInchesToMm(6, 0))).toBeLessThanOrEqual(1);
  });

  it("uses the exact fence-before-gate location when rounding fence panels", () => {
    const base = line([20]);
    const afterEightFeet = insertGateOnSegment(base, "segment-1", feetAndInchesToMm(4, 0), feetAndInchesToMm(8, 0), "single", "point-3", "point-4", "segment-2", "segment-3");
    const afterSevenFeet = insertGateOnSegment(base, "segment-1", feetAndInchesToMm(4, 0), feetAndInchesToMm(7, 0), "single", "point-3", "point-4", "segment-2", "segment-3");
    expect(calculateBlackAluminumTakeoff(afterEightFeet)).toMatchObject({ fenceLengthMm: feetAndInchesToMm(16, 0), fencePanelCount: 2, gatePanelCount: 1, panelCount: 3 });
    expect(calculateBlackAluminumTakeoff(afterSevenFeet)).toMatchObject({ fenceLengthMm: feetAndInchesToMm(16, 0), fencePanelCount: 3, gatePanelCount: 1, panelCount: 4 });
  });

  it("flags gate widths that exceed the approved usable fabrication capacity", () => {
    let wideSingle = line([8]);
    wideSingle = setSegmentKind(wideSingle, "segment-1", "gate");
    let wideDouble = line([15]);
    wideDouble = setGateType(setSegmentKind(wideDouble, "segment-1", "gate"), "segment-1", "double");
    expect(calculateBlackAluminumTakeoff(wideSingle).warnings).toHaveLength(1);
    expect(calculateBlackAluminumTakeoff(wideSingle).warnings[0]).toMatch(/single gate exceeds 7/);
    expect(calculateBlackAluminumTakeoff(wideDouble).warnings).toHaveLength(1);
    expect(calculateBlackAluminumTakeoff(wideDouble).warnings[0]).toMatch(/double gate exceeds the 14/);
  });

  it("counts eight end posts for two separate straight lines with two non-corner gates", () => {
    let design = line([20]);
    design = insertGateOnSegment(design, "segment-1", feetAndInchesToMm(4, 0), feetAndInchesToMm(8, 0), "single", "point-3", "point-4", "segment-2", "segment-3");
    design = startFenceLine(design, { id: "point-5", xMm: 0, yMm: feetAndInchesToMm(20, 0) });
    design = addPoint(design, { id: "point-6", xMm: feetAndInchesToMm(26, 0), yMm: feetAndInchesToMm(20, 0) }, "segment-4", "point-5");
    design = insertGateOnSegment(design, "segment-4", feetAndInchesToMm(10, 0), feetAndInchesToMm(8, 0), "double", "point-7", "point-8", "segment-5", "segment-6");
    const takeoff = calculateBlackAluminumTakeoff(design);
    expect(takeoff).toMatchObject({ panelCount: 7, fencePanelCount: 4, gatePanelCount: 3, endPosts: 8, cornerPosts: 0, linePosts: 0, singleGates: 1, doubleGates: 1, hinges: 6, latches: 2, centerDropPoles: 1 });
    expect(takeoff.layout.posts.filter(({ reason }) => reason === "gate_side")).toHaveLength(4);
    expect(takeoff.layout.posts.filter(({ reason }) => reason === "open_end")).toHaveLength(4);
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

describe("treated pine privacy material takeoff", () => {
  it("keeps one authoritative drawing unchanged when material logic splits", () => {
    let design = line([8, 4, 8]);
    design = setSegmentKind(design, "segment-2", "gate");
    const before = JSON.stringify(design);
    calculateBlackAluminumTakeoff(design);
    calculateTreatedPinePrivacyTakeoff(design);
    expect(JSON.stringify(design)).toBe(before);
  });

  it("uses touching six-inch pickets, three rails per eight-foot bay, and ten-percent lumber waste", () => {
    const takeoff = calculateTreatedPinePrivacyTakeoff(line([16]));
    expect(takeoff).toMatchObject({
      fenceLengthMm: feetAndInchesToMm(16, 0),
      gateLengthMm: 0,
      fencePickets: 32,
      gatePickets: 0,
      installedPickets: 32,
      picketsWithWaste: 36,
      picketWasteAllowance: 4,
      fenceRailPieces: 6,
      gateFramePieces: 0,
      twoByFoursWithWaste: 7,
      twoByFourWasteAllowance: 1,
      installedPosts: 3,
      fourByFoursWithWaste: 4,
      postWasteAllowance: 1,
      concreteBags: 3,
      picketScrews: 192,
      railToPostStructuralScrews: 24,
      gateFrameStructuralScrews: 0,
      totalStructuralScrews: 24,
    });
  });

  it("includes pickets, five frame boards, posts, hardware, and concrete for a single gate", () => {
    let design = line([8, 4, 8]);
    design = setSegmentKind(design, "segment-2", "gate");
    const takeoff = calculateTreatedPinePrivacyTakeoff(design);
    expect(takeoff).toMatchObject({
      fencePickets: 32,
      gatePickets: 8,
      installedPickets: 40,
      picketsWithWaste: 44,
      fenceRailPieces: 6,
      gateFramePieces: 5,
      twoByFoursWithWaste: 13,
      installedPosts: 4,
      fourByFoursWithWaste: 5,
      concreteBags: 4,
      picketScrews: 240,
      railToPostStructuralScrews: 24,
      gateFrameStructuralScrews: 12,
      totalStructuralScrews: 36,
      singleGates: 1,
      doubleGates: 0,
      hinges: 2,
      latches: 1,
      dropRods: 0,
    });
  });

  it("treats a double gate as two leaves with ten frame boards and two hinges per leaf", () => {
    let design = line([8, 6, 8]);
    design = setGateType(setSegmentKind(design, "segment-2", "gate"), "segment-2", "double");
    expect(calculateTreatedPinePrivacyTakeoff(design)).toMatchObject({
      gatePickets: 12,
      gateFramePieces: 10,
      singleGates: 0,
      doubleGates: 1,
      hinges: 4,
      latches: 1,
      dropRods: 1,
      railToPostStructuralScrews: 24,
      gateFrameStructuralScrews: 24,
      totalStructuralScrews: 48,
    });
  });

  it("formats a copyable report with the approved rules and fastening boundary", () => {
    const report = formatTreatedPinePrivacyTakeoffText(calculateTreatedPinePrivacyTakeoff(line([16])));
    expect(report).toContain("TREATED PINE PRIVACY TAKEOFF — PRELIMINARY");
    expect(report).toContain("1×6×6 pickets: 36 (32 installed + 4 waste)");
    expect(report).toContain("2×4×8 rails and gate frames: 7 (6 rails + 0 gate-frame pieces + 1 waste)");
    expect(report).toContain("Picket screws: 192");
    expect(report).toContain("Rail-to-post structural screws: 24");
    expect(report).toContain("Gate-frame structural screws: 0");
    expect(report).toContain("Hardware mounting fasteners are assumed to be included");
  });
});
