import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint, feetAndInchesToMm, gateOffsetFromReferenceMm, insertGateOnSegment, setSegmentLengthMm, stableDesignJson } from "../src/model";
import { initialScaleCalibrationState } from "../src/background";
import { LEGACY_STORAGE_KEY, loadLocalDesign, loadLocalReference, PREVIOUS_STORAGE_KEY, REFERENCE_STORAGE_KEY, saveLocalDesign, saveLocalReference, STORAGE_KEY } from "../src/storage";

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

  it("persists only canonical gate geometry, not the transient reference-post choice", () => {
    const storage = new MemoryStorage();
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: feetAndInchesToMm(20, 0), yMm: 0 }, "segment-1");
    const width = feetAndInchesToMm(4, 0);
    design = insertGateOnSegment(design, "segment-1", width, gateOffsetFromReferenceMm(feetAndInchesToMm(20, 0), width, feetAndInchesToMm(2, 0), "post-b"), "single", "point-3", "point-4", "segment-2", "segment-3");
    saveLocalDesign(storage, design);
    expect(loadLocalDesign(storage)).toEqual(design);
    expect(storage.values.get(STORAGE_KEY)).not.toMatch(/post-a|post-b|referencePost/);
  });

  it("replays and reloads a translated authored path deterministically", () => {
    const storage = new MemoryStorage();
    let design = addPoint(EMPTY_DESIGN, { id: "point-1", xMm: 0, yMm: 0 });
    design = addPoint(design, { id: "point-2", xMm: 6_096, yMm: 0 }, "segment-1");
    design = addPoint(design, { id: "point-3", xMm: 6_096, yMm: 9_144 }, "segment-2");
    design = addPoint(design, { id: "point-4", xMm: 12_166, yMm: 9_144 }, "segment-3");
    const edited = setSegmentLengthMm(design, "segment-2", feetAndInchesToMm(33, 0));
    const replayed = setSegmentLengthMm(design, "segment-2", feetAndInchesToMm(33, 0));
    expect(stableDesignJson(replayed)).toBe(stableDesignJson(edited));
    saveLocalDesign(storage, edited);
    expect(loadLocalDesign(storage)).toEqual(edited);
    expect(stableDesignJson(loadLocalDesign(storage)!)).toBe(stableDesignJson(edited));
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
      calibrated: true,
      transform: { xMm: 10, yMm: 20, widthMm: 30_000, heightMm: 20_000, rotationDegrees: 4.5 },
    } as const;
    saveLocalReference(storage, reference);
    const loaded = loadLocalReference(storage);
    expect(loaded).toEqual(reference);
    expect(initialScaleCalibrationState(loaded)).toEqual({ status: "scale-set", provenance: "loaded-local-transform", primaryKnownDistanceMm: null });
  });

  it("loads legacy references as uncalibrated so drawing cannot trust an unknown scale", () => {
    const storage = new MemoryStorage();
    storage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, src: "data:image/jpeg;base64,ZmFrZQ==", name: "Old reference", opacity: 0.7, locked: false, transform: { xMm: 0, yMm: 0, widthMm: 10_000, heightMm: 5_000, rotationDegrees: 0 } }));
    expect(loadLocalReference(storage)).toMatchObject({ calibrated: false, locked: false });
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
