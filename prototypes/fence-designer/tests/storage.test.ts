import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint } from "../src/model";
import { LEGACY_STORAGE_KEY, loadLocalDesign, saveLocalDesign, STORAGE_KEY } from "../src/storage";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("local persistence", () => {
  it("saves and loads the validated design without network state", () => {
    const storage = new MemoryStorage();
    const design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 305, yMm: 610 });
    saveLocalDesign(storage, design);
    expect(loadLocalDesign(storage)).toEqual(design);
  });

  it("returns null when no local design exists", () => {
    expect(loadLocalDesign(new MemoryStorage())).toBeNull();
  });

  it("loads and migrates a schema-v1 layout from the legacy storage key", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...EMPTY_DESIGN, schemaVersion: 1, house: undefined }));
    expect(loadLocalDesign(storage)).toMatchObject({ schemaVersion: 2, house: null });
  });
});
