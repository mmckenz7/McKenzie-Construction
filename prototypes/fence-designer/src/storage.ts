import { normalizeDesign, stableDesignJson, type FenceDesign } from "./model";
import type { ReferenceBackground } from "./background";

export const STORAGE_KEY = "mckenzie-fence-designer:v3:current";
export const PREVIOUS_STORAGE_KEY = "mckenzie-fence-designer:v2:current";
export const LEGACY_STORAGE_KEY = "mckenzie-fence-designer:v1:current";
export const REFERENCE_STORAGE_KEY = "mckenzie-fence-designer:reference:v1:current";

export function saveLocalDesign(storage: Pick<Storage, "setItem">, design: FenceDesign): void {
  storage.setItem(STORAGE_KEY, stableDesignJson(design));
}

export function loadLocalDesign(storage: Pick<Storage, "getItem">): FenceDesign | null {
  const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(PREVIOUS_STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
  return raw === null ? null : normalizeDesign(JSON.parse(raw));
}

export function saveLocalReference(storage: Pick<Storage, "setItem" | "removeItem">, reference: ReferenceBackground | null): void {
  if (!reference) { storage.removeItem(REFERENCE_STORAGE_KEY); return; }
  storage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, ...reference }));
}

export function loadLocalReference(storage: Pick<Storage, "getItem">): ReferenceBackground | null {
  const serialized = storage.getItem(REFERENCE_STORAGE_KEY);
  if (serialized === null) return null;
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  const transform = raw.transform as Record<string, unknown> | null;
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 || typeof raw.src !== "string" || !raw.src.startsWith("data:image/jpeg") || raw.src.length > 6_000_000) throw new TypeError("Saved reference image is invalid.");
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 200 || typeof raw.opacity !== "number" || raw.opacity < 0.1 || raw.opacity > 1 || typeof raw.locked !== "boolean" || !transform) throw new TypeError("Saved reference settings are invalid.");
  const values = [transform.xMm, transform.yMm, transform.widthMm, transform.heightMm, transform.rotationDegrees];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value)) || !Number.isSafeInteger(transform.xMm) || !Number.isSafeInteger(transform.yMm) || !Number.isSafeInteger(transform.widthMm) || !Number.isSafeInteger(transform.heightMm) || (transform.widthMm as number) <= 0 || (transform.heightMm as number) <= 0) throw new TypeError("Saved reference transform is invalid.");
  return Object.freeze({
    src: raw.src,
    name: raw.name,
    opacity: raw.opacity,
    locked: raw.locked,
    calibrated: raw.schemaVersion === 2 && raw.calibrated === true,
    transform: Object.freeze({ xMm: transform.xMm, yMm: transform.yMm, widthMm: transform.widthMm, heightMm: transform.heightMm, rotationDegrees: transform.rotationDegrees }),
  }) as ReferenceBackground;
}
