import { normalizeDesign, stableDesignJson, type FenceDesign } from "./model";

export const STORAGE_KEY = "mckenzie-fence-designer:v2:current";
export const LEGACY_STORAGE_KEY = "mckenzie-fence-designer:v1:current";

export function saveLocalDesign(storage: Pick<Storage, "setItem">, design: FenceDesign): void {
  storage.setItem(STORAGE_KEY, stableDesignJson(design));
}

export function loadLocalDesign(storage: Pick<Storage, "getItem">): FenceDesign | null {
  const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
  return raw === null ? null : normalizeDesign(JSON.parse(raw));
}
