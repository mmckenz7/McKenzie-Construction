// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { DEFAULT_DESIGN } from "../src/model";
import { createDesignFromConfirmedPhotoFacts, normalizeConfirmedPhotoFacts, reviewConfirmedPhotoFacts, reviewPhotoCoverage } from "../src/photoIntake";

const base = migrateDeckDesignToV3(DEFAULT_DESIGN);

describe("local-only photo-assisted start", () => {
  it("creates exact rectangle geometry only from confirmed dimensional facts", () => {
    const next = createDesignFromConfirmedPhotoFacts(base, {
      designName: "Recent visit",
      layoutIntent: "rectangle",
      width: 144,
      projection: 144,
      surfaceElevation: 52,
      doorWidth: 72,
      attachment: "ledger",
    });
    expect(next.name).toBe("Recent visit");
    expect(next.platforms[0].region.outer).toEqual([{ x: 0, z: 0 }, { x: 144, z: 0 }, { x: 144, z: 144 }, { x: 0, z: 144 }]);
    expect(next.platforms[0].elevation).toBe(52);
    expect(next.platforms[0].edgeConditions.find((condition) => condition.condition === "house_attachment")?.attachment).toBe("ledger");
    expect(next.siteContext.houseWalls[0].openings).toEqual([]);
    expect(next.metadata.revision).toBe(base.metadata.revision + 1);
  });

  it("carries the existing height only when the intake leaves height unknown", () => {
    const next = createDesignFromConfirmedPhotoFacts(base, {
      designName: "Manual start",
      layoutIntent: "rectangle",
      width: 144,
      projection: 144,
      surfaceElevation: null,
      doorWidth: null,
      attachment: "unknown",
    });
    expect(next.platforms[0].elevation).toBe(base.platforms[0].elevation);
    expect(reviewConfirmedPhotoFacts({ designName: "Manual start", layoutIntent: "rectangle", width: 144, projection: 144, surfaceElevation: null, doorWidth: null, attachment: "unknown" }).fieldVerification.join(" ")).toMatch(/height.*current design|attachment remains unknown/i);
  });

  it("normalizes exact facts and rejects unsupported or incomplete entries", () => {
    expect(normalizeConfirmedPhotoFacts({ designName: "  Job visit  ", layoutIntent: "rectangle", width: 144, projection: 144, surfaceElevation: 48, doorWidth: 72, attachment: "non-ledger" }).designName).toBe("Job visit");
    expect(() => normalizeConfirmedPhotoFacts({ designName: "", layoutIntent: "rectangle", width: 144, projection: 144, surfaceElevation: null, doorWidth: null, attachment: "unknown" })).toThrow(/name/i);
    expect(() => normalizeConfirmedPhotoFacts({ designName: "Job", layoutIntent: "rectangle", width: 24, projection: 144, surfaceElevation: null, doorWidth: null, attachment: "unknown" })).toThrow(/width/i);
  });

  it("reviews non-standard photo coverage without blocking manual design", () => {
    const incomplete = reviewPhotoCoverage("non-standard", ["wide-site", "house-connection"], 1);
    expect(incomplete.addedCount).toBe(3);
    expect(incomplete.missingRecommendedRoles).toEqual(["left-corner", "right-corner", "elevated-overview"]);
    expect(incomplete.message).toMatch(/3 recommended/i);
    const complete = reviewPhotoCoverage("non-standard", ["wide-site", "house-connection", "left-corner", "right-corner", "elevated-overview"], 2);
    expect(complete.missingRecommendedRoles).toEqual([]);
    expect(complete.message).toMatch(/good multi-angle/i);
    expect(reviewPhotoCoverage("rectangle", [], 0).message).toMatch(/manual design remains available/i);
  });
});
