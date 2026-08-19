import { deriveDeckDesignProjectionV3 } from "./designProjectionV3";
import { migrateDeckDesignToV3, stableDeckDesignV3Json, type DeckDesignV3 } from "./modelV3";

export const V3_STORAGE_KEY = "mckenzie-deck-designer:v3:current";
export const V2_STORAGE_KEY = "mckenzie-deck-designer:v2:current";
export const V1_STORAGE_KEY = "mckenzie-deck-designer:v1:current";

export type V3LoadResult = Readonly<{
  design: DeckDesignV3 | null;
  source: "v3" | "v2" | "v1" | "none" | "invalid";
  message: string;
}>;

export function loadDeckDesignV3(storage: Pick<Storage, "getItem" | "setItem">): V3LoadResult {
  const candidates = [
    ["v3", V3_STORAGE_KEY], ["v2", V2_STORAGE_KEY], ["v1", V1_STORAGE_KEY],
  ] as const;
  for (const [source, key] of candidates) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const design = migrateDeckDesignToV3(JSON.parse(raw));
      deriveDeckDesignProjectionV3(design);
      if (source !== "v3") storage.setItem(V3_STORAGE_KEY, stableDeckDesignV3Json(design));
      return Object.freeze({ design, source, message: source === "v3" ? "Loaded local v3 design." : `Migrated local ${source} design to v3; the original was preserved.` });
    } catch (error) {
      return Object.freeze({ design: null, source: "invalid", message: error instanceof Error ? `Local design was retained but not opened: ${error.message}` : "Local design was retained but not opened." });
    }
  }
  return Object.freeze({ design: null, source: "none", message: "No local v3 design found." });
}

export function saveDeckDesignV3(storage: Pick<Storage, "setItem">, design: DeckDesignV3): void {
  deriveDeckDesignProjectionV3(design);
  storage.setItem(V3_STORAGE_KEY, stableDeckDesignV3Json(design));
}
