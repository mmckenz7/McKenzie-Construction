import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveDeckAccessoryProjectionV4 } from "../src/quantityProjectionV4";
import { deriveGeometryWarningsV4 } from "../src/geometryWarningsV4";
import { createHistoryV4, designHistoryReducerV4 } from "../src/historyV4";
import { migrateDeckDesignToV4, normalizeDeckDesignV4, stableDeckDesignV4Json } from "../src/modelV4";
import { loadDeckDesignV4, saveDeckDesignV4, V4_STORAGE_KEY } from "../src/storageV4";
import { V3_STORAGE_KEY } from "../src/storageV3";

function withTwoBeams() {
  const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
  const platform = base.platforms[0];
  return normalizeDeckDesignV4({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, framing: { joistSpacing: 16, beamLines: [
    { id: "beam-near", offsetFromOutside: 24, maxSupportSpacing: 72 },
    { id: "beam-far", offsetFromOutside: 96, maxSupportSpacing: 48 },
  ] } } }] });
}

describe("DeckDesign v4 projection activation gates", () => {
  it("traces deterministic quantities to stable beam and support IDs", () => {
    const design = withTwoBeams();
    const report = deriveDeckAccessoryProjectionV4(design, design.platforms[0].id);
    expect(report.designSchemaVersion).toBe(4);
    expect(report.quantities.find((item) => item.key === "beam-linear-feet")?.sourceGeometry).toEqual([
      "platform-1:beam-near-segment-1", "platform-1:beam-far-segment-1",
    ]);
    expect(report.quantities.find((item) => item.key === "support-post-count")?.amount).toBe(9);
    expect(report.quantities.find((item) => item.key === "support-post-count")?.explanation).toContain("beam-far: 48 in");
  });

  it("identifies the exact beam line interrupted by a cutout", () => {
    const base = withTwoBeams();
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV4({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 36 }, { x: 120, z: 36 }, { x: 120, z: 60 }, { x: 72, z: 60 },
    ]] } }] });
    const warnings = deriveGeometryWarningsV4(design, platform.id);
    expect(warnings.filter((warning) => warning.id.startsWith("beam-cutout"))).toEqual([
      expect.objectContaining({ id: "beam-cutout-interruption-beam-far-1", geometryIds: ["beam-far", "platform-1:hole-1"] }),
    ]);
  });

  it("keeps undo and redo revisions monotonic across beam-line changes", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const changed = withTwoBeams();
    const applied = designHistoryReducerV4(createHistoryV4(base), { type: "apply", design: changed });
    const undone = designHistoryReducerV4(applied, { type: "undo" });
    const redone = designHistoryReducerV4(undone, { type: "redo" });
    expect([applied.present.metadata.revision, undone.present.metadata.revision, redone.present.metadata.revision]).toEqual([2, 3, 4]);
    expect(redone.present.platforms[0].construction.framing.beamLines).toHaveLength(2);
  });

  it("writes only v4 while preserving v3 fallback and fails closed on stale v4", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const legacy = migrateDeckDesignToV4(DEFAULT_DESIGN);
    values.set(V3_STORAGE_KEY, JSON.stringify({ ...legacy, schemaVersion: 3, platforms: legacy.platforms.map((platform) => ({ ...platform, construction: { ...platform.construction, framing: { joistSpacing: 16, beamInset: 24, maxPostSpacing: 72 } } })) }));
    const loaded = loadDeckDesignV4(storage);
    expect(loaded.source).toBe("v3");
    expect(values.get(V3_STORAGE_KEY)).toBeTruthy();
    expect(values.get(V4_STORAGE_KEY)).toBe(stableDeckDesignV4Json(loaded.design!));
    saveDeckDesignV4(storage, withTwoBeams());
    values.set(V4_STORAGE_KEY, "{stale");
    const stale = loadDeckDesignV4(storage);
    expect(stale.source).toBe("invalid");
    expect(values.get(V3_STORAGE_KEY)).toBeTruthy();
  });
});
