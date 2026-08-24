import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN, addPoint } from "../src/model";
import { loadLocalDesign, saveLocalDesign, STORAGE_KEY } from "../src/storage";

class MemoryStorage {
  value: string | null = null;
  getItem(key: string) { return key === STORAGE_KEY ? this.value : null; }
  setItem(key: string, value: string) { if (key === STORAGE_KEY) this.value = value; }
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
});
