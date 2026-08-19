// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, stableDeckDesignV3Json } from "../src/modelV3";
import { loadDeckDesignV3, saveDeckDesignV3, V2_STORAGE_KEY, V3_STORAGE_KEY } from "../src/storageV3";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("browser-local DeckDesign v3 activation", () => {
  it("migrates v2 once while preserving the untouched fallback", () => {
    const storage = new MemoryStorage();
    const fallback = JSON.stringify(DEFAULT_DESIGN);
    storage.setItem(V2_STORAGE_KEY, fallback);
    const first = loadDeckDesignV3(storage);
    expect(first.source).toBe("v2");
    expect(first.design?.schemaVersion).toBe(3);
    expect(storage.getItem(V2_STORAGE_KEY)).toBe(fallback);
    expect(storage.getItem(V3_STORAGE_KEY)).toBe(stableDeckDesignV3Json(first.design!));
    expect(loadDeckDesignV3(storage).source).toBe("v3");
    expect(storage.getItem(V2_STORAGE_KEY)).toBe(fallback);
  });

  it("fails closed on stale invalid v3 without overwriting it or falling through", () => {
    const storage = new MemoryStorage();
    const stale = "{not-json";
    storage.setItem(V3_STORAGE_KEY, stale);
    storage.setItem(V2_STORAGE_KEY, JSON.stringify(DEFAULT_DESIGN));
    const result = loadDeckDesignV3(storage);
    expect(result.source).toBe("invalid");
    expect(result.design).toBeNull();
    expect(storage.getItem(V3_STORAGE_KEY)).toBe(stale);
    expect(storage.getItem(V2_STORAGE_KEY)).toBe(JSON.stringify(DEFAULT_DESIGN));
  });

  it("writes only canonical v3 after projection validation", () => {
    const storage = new MemoryStorage();
    const design = migrateDeckDesignToV3(DEFAULT_DESIGN);
    saveDeckDesignV3(storage, design);
    expect(storage.getItem(V3_STORAGE_KEY)).toBe(stableDeckDesignV3Json(design));
    expect(storage.getItem(V2_STORAGE_KEY)).toBeNull();
  });
});
