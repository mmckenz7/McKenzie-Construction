import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { deckDesignV4Fingerprint, migrateDeckDesignToV4, normalizeDeckDesignV4, stableDeckDesignV4Json } from "../src/modelV4";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";

describe("DeckDesign v4 multi-beam document", () => {
  it("migrates v1, v2, and v3 into one stable conceptual beam line", () => {
    for (const input of [rectangleFoundationFixture.design, normalizeDesign(rectangleFoundationFixture.design), migrateDeckDesignToV3(rectangleFoundationFixture.design)]) {
      const design = migrateDeckDesignToV4(input);
      expect(design.schemaVersion).toBe(4);
      expect(design.platforms[0].construction.framing.beamLines).toEqual([{ id: "beam-line-1", offsetFromOutside: 24, maxSupportSpacing: 72 }]);
    }
  });

  it("normalizes stable multi-beam IDs and deterministic offset order", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV4({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, framing: { ...platform.construction.framing, beamLines: [
      { id: "beam-line-yard", offsetFromOutside: 96, maxSupportSpacing: 60 },
      { id: "beam-line-house", offsetFromOutside: 24, maxSupportSpacing: 72 },
    ] } } }] });
    expect(design.platforms[0].construction.framing.beamLines.map((beam) => beam.id)).toEqual(["beam-line-house", "beam-line-yard"]);
    expect(migrateDeckDesignToV4(JSON.parse(stableDeckDesignV4Json(design)))).toEqual(design);
    expect(deckDesignV4Fingerprint(design)).toMatch(/^v4-[0-9a-f]{8}$/);
  });

  it("rejects duplicate IDs, coincident offsets, and out-of-bounds lines", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const withLines = (beamLines: readonly { id: string; offsetFromOutside: number; maxSupportSpacing: number }[]) => ({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, framing: { ...platform.construction.framing, beamLines } } }] });
    expect(() => normalizeDeckDesignV4(withLines([{ id: "same", offsetFromOutside: 24, maxSupportSpacing: 72 }, { id: "same", offsetFromOutside: 72, maxSupportSpacing: 72 }]))).toThrow(/unique stable/i);
    expect(() => normalizeDeckDesignV4(withLines([{ id: "one", offsetFromOutside: 24, maxSupportSpacing: 72 }, { id: "two", offsetFromOutside: 24, maxSupportSpacing: 72 }]))).toThrow(/same recorded offset/i);
    expect(() => normalizeDeckDesignV4(withLines([{ id: "outside", offsetFromOutside: 143, maxSupportSpacing: 72 }]))).toThrow(/axis bounds/i);
  });
});
