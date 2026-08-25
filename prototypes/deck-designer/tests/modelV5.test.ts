import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { migrateDeckDesignToV4 } from "../src/modelV4";
import { deckDesignV5Fingerprint, migrateDeckDesignToV5, normalizeDeckDesignV5, stableDeckDesignV5Json } from "../src/modelV5";

describe("DeckDesign v5 edge finishes", () => {
  it("migrates v1 through v4 without inventing finish intent", () => {
    for (const input of [DEFAULT_DESIGN, normalizeDesign(DEFAULT_DESIGN), migrateDeckDesignToV3(DEFAULT_DESIGN), migrateDeckDesignToV4(DEFAULT_DESIGN)]) {
      const design = migrateDeckDesignToV5(input);
      expect(design.schemaVersion).toBe(5);
      expect(design.platforms[0].construction.edgeFinishes).toEqual([]);
    }
  });

  it("normalizes selected free edges in polygon order and round-trips deterministically", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const free = platform.edgeConditions.filter((condition) => condition.condition === "free").map((condition) => condition.edgeId);
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, edgeFinishes: [
      { edgeId: free[2], fasciaEnabled: false, skirtingEnabled: true },
      { edgeId: free[0], fasciaEnabled: true, skirtingEnabled: false },
    ] } }] });
    expect(design.platforms[0].construction.edgeFinishes.map((finish) => finish.edgeId)).toEqual([free[0], free[2]]);
    expect(migrateDeckDesignToV5(JSON.parse(stableDeckDesignV5Json(design)))).toEqual(design);
    expect(deckDesignV5Fingerprint(design)).toMatch(/^v5-[0-9a-f]{8}$/);
  });

  it("rejects house edges, duplicate edges, and empty entries", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const house = platform.edgeConditions.find((condition) => condition.condition === "house_attachment")!.edgeId;
    const free = platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const withFinishes = (edgeFinishes: unknown[]) => ({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, edgeFinishes } }] });
    expect(() => normalizeDeckDesignV5(withFinishes([{ edgeId: house, fasciaEnabled: true, skirtingEnabled: false }]) as never)).toThrow(/free outer edge/i);
    expect(() => normalizeDeckDesignV5(withFinishes([{ edgeId: free, fasciaEnabled: true, skirtingEnabled: false }, { edgeId: free, fasciaEnabled: false, skirtingEnabled: true }]) as never)).toThrow(/unique current/i);
    expect(() => normalizeDeckDesignV5(withFinishes([{ edgeId: free, fasciaEnabled: false, skirtingEnabled: false }]) as never)).toThrow(/must be omitted/i);
  });
});
