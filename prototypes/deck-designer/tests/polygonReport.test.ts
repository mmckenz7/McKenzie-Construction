// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { derivePolygonProjectionReport, stablePolygonProjectionReportJson } from "../src/polygonReport";

const outer = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 180 }, { x: 0, z: 180 }];
const hole = [{ x: 72, z: 60 }, { x: 168, z: 60 }, { x: 168, z: 120 }, { x: 72, z: 120 }];
const options = { boardWidth: 5.5, gap: 0.25, joistSpacing: 16 };

describe("neutral polygon projection report spike", () => {
  it("emits traceable measurements and explicitly classified quantities", () => {
    const report = derivePolygonProjectionReport("platform-1", { outer, holes: [hole] }, options);
    expect(report.measurements).toEqual({
      netAreaSquareInches: 37440,
      outerPerimeterInches: 840,
      holeAreaSquareInches: 5760,
      holePerimeterInches: 312,
      outerEdgeCount: 4,
      holeCount: 1,
    });
    expect(Object.fromEntries(report.quantities.map((line) => [line.key, [line.amount, line.unit, line.quantityClass]]))).toMatchObject({
      "platform-area": [260, "sq ft", "takeoff_candidate"],
      "outer-perimeter": [70, "lin ft", "takeoff_candidate"],
      "hole-perimeter": [26, "lin ft", "takeoff_candidate"],
      "joist-linear-feet": expect.arrayContaining([expect.any(Number), "lin ft", "visualization"]),
    });
    expect(report.quantities.every((line) => line.sourceGeometry.length > 0 || line.amount === 0)).toBe(true);
    expect(report.quantities.every((line) => line.assemblyIntent.length > 5)).toBe(true);
    expect(report.warnings).toEqual([
      "conceptual_not_for_construction",
      "field_verification_required",
      "framing_intent_not_structural",
    ]);
  });

  it("is byte-stable and excludes commercial or product ownership", () => {
    const first = derivePolygonProjectionReport("platform-1", { outer, holes: [hole] }, options);
    const second = derivePolygonProjectionReport("platform-1", { outer: [...outer].reverse(), holes: [[...hole].reverse()] }, options);
    expect(stablePolygonProjectionReportJson(second)).toBe(stablePolygonProjectionReportJson(first));
    expect(stablePolygonProjectionReportJson(first)).not.toMatch(/price|cost|supplier|manufacturer|sku|labor|margin|catalog/i);
    expect(stablePolygonProjectionReportJson(first)).toMatch(/no waste or product-length conversion applied/);
  });

  it("rejects unstable or unsafe region identifiers", () => {
    expect(() => derivePolygonProjectionReport("Platform 1", { outer, holes: [] }, options)).toThrow(/stable lowercase/);
    expect(() => derivePolygonProjectionReport("../platform", { outer, holes: [] }, options)).toThrow(/stable lowercase/);
  });
});
