import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { migrateDeckDesignToV4 } from "../src/modelV4";
import { migrateDeckDesignToV5, stableDeckDesignV5Json } from "../src/modelV5";
import { resolveV5Startup } from "../src/startupV5";
import { loadDeckDesignV5, V5_STORAGE_KEY } from "../src/storageV5";
import { V4_STORAGE_KEY } from "../src/storageV4";
import { V1_STORAGE_KEY, V2_STORAGE_KEY, V3_STORAGE_KEY } from "../src/storageV3";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const v1Design = () => {
  const legacy = JSON.parse(JSON.stringify(DEFAULT_DESIGN));
  legacy.schemaVersion = 1;
  delete legacy.siteContext;
  return legacy;
};

describe("v5-only browser startup", () => {
  it.each([
    ["v1", V1_STORAGE_KEY, v1Design()],
    ["v2", V2_STORAGE_KEY, normalizeDesign(DEFAULT_DESIGN)],
    ["v3", V3_STORAGE_KEY, migrateDeckDesignToV3(DEFAULT_DESIGN)],
    ["v4", V4_STORAGE_KEY, migrateDeckDesignToV4(DEFAULT_DESIGN)],
    ["v5", V5_STORAGE_KEY, migrateDeckDesignToV5(DEFAULT_DESIGN)],
  ])("opens a saved %s document as v5 while preserving its source", (source, key, value) => {
    const storage = new MemoryStorage();
    const original = JSON.stringify(value);
    storage.setItem(key, original);
    const startup = resolveV5Startup(loadDeckDesignV5(storage));
    expect(startup.source).toBe(source);
    expect(startup.design.schemaVersion).toBe(5);
    expect(storage.getItem(key)).toBe(original);
    expect(storage.getItem(V5_STORAGE_KEY)).toBe(source === "v5" ? original : stableDeckDesignV5Json(startup.design));
  });

  it("opens a fresh in-memory design without writing local storage", () => {
    const storage = new MemoryStorage();
    const startup = resolveV5Startup(loadDeckDesignV5(storage));
    expect(startup.source).toBe("none");
    expect(startup.design.schemaVersion).toBe(5);
    expect(startup.message).toMatch(/fresh local v5/i);
    expect(storage.values.size).toBe(0);
  });

  it("retains malformed storage and opens an explicit in-memory recovery design", () => {
    const storage = new MemoryStorage();
    const malformed = "{retained-invalid";
    storage.setItem(V5_STORAGE_KEY, malformed);
    storage.setItem(V4_STORAGE_KEY, JSON.stringify(migrateDeckDesignToV4(DEFAULT_DESIGN)));
    const startup = resolveV5Startup(loadDeckDesignV5(storage));
    expect(startup.source).toBe("invalid");
    expect(startup.design.schemaVersion).toBe(5);
    expect(startup.message).toMatch(/retained local data was not replaced/i);
    expect(storage.getItem(V5_STORAGE_KEY)).toBe(malformed);
    expect(storage.getItem(V4_STORAGE_KEY)).toBeTruthy();
  });
});
