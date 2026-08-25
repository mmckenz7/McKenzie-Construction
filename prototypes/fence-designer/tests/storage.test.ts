import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint } from "../src/model";
import { LEGACY_STORAGE_KEY, loadLocalDesign, loadLocalReference, PREVIOUS_STORAGE_KEY, REFERENCE_STORAGE_KEY, saveLocalDesign, saveLocalReference } from "../src/storage";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
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
    expect(loadLocalDesign(storage)).toMatchObject({ schemaVersion: 3, house: null });
  });

  it("loads and migrates a schema-v2 layout from the previous local key", () => {
    const storage = new MemoryStorage();
    storage.setItem(PREVIOUS_STORAGE_KEY, JSON.stringify({ ...EMPTY_DESIGN, schemaVersion: 2 }));
    expect(loadLocalDesign(storage)).toMatchObject({ schemaVersion: 3, house: null });
  });

  it("saves and loads a compressed local reference separately from the design", () => {
    const storage = new MemoryStorage();
    const reference = {
      src: "data:image/jpeg;base64,ZmFrZQ==",
      name: "Captured map tab",
      opacity: 0.72,
      locked: true,
      transform: { xMm: 10, yMm: 20, widthMm: 30_000, heightMm: 20_000, rotationDegrees: 4.5 },
    } as const;
    saveLocalReference(storage, reference);
    expect(loadLocalReference(storage)).toEqual(reference);
  });

  it("removes a saved reference without changing the design key", () => {
    const storage = new MemoryStorage();
    saveLocalDesign(storage, EMPTY_DESIGN);
    storage.setItem(REFERENCE_STORAGE_KEY, "saved-reference");
    saveLocalReference(storage, null);
    expect(storage.getItem(REFERENCE_STORAGE_KEY)).toBeNull();
    expect(loadLocalDesign(storage)).toEqual(EMPTY_DESIGN);
  });

  it("rejects malformed local reference data", () => {
    const storage = new MemoryStorage();
    storage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, src: "https://example.test/map.jpg" }));
    expect(() => loadLocalReference(storage)).toThrow("Saved reference image is invalid");
  });
});
