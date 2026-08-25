import { derivePlatformGeometryV5 } from "./geometryV5";
import { migrateDeckDesignToV5, stableDeckDesignV5Json, type DeckDesignV5 } from "./modelV5";
import { V4_STORAGE_KEY } from "./storageV4";
import { V1_STORAGE_KEY, V2_STORAGE_KEY, V3_STORAGE_KEY } from "./storageV3";

export const V5_STORAGE_KEY = "mckenzie-deck-designer:v5:current";
export type V5LoadResult = Readonly<{ design: DeckDesignV5 | null; source: "v5" | "v4" | "v3" | "v2" | "v1" | "none" | "invalid"; message: string }>;

function validate(design: DeckDesignV5): void {
  design.platforms.forEach((platform) => derivePlatformGeometryV5(design, platform.id));
}

export function loadDeckDesignV5(storage: Pick<Storage, "getItem" | "setItem">): V5LoadResult {
  const candidates = [["v5", V5_STORAGE_KEY], ["v4", V4_STORAGE_KEY], ["v3", V3_STORAGE_KEY], ["v2", V2_STORAGE_KEY], ["v1", V1_STORAGE_KEY]] as const;
  for (const [source, key] of candidates) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const design = migrateDeckDesignToV5(JSON.parse(raw));
      validate(design);
      if (source !== "v5") storage.setItem(V5_STORAGE_KEY, stableDeckDesignV5Json(design));
      return Object.freeze({ design, source, message: source === "v5" ? "Loaded local v5 design." : `Migrated local ${source} design to v5; the original was preserved.` });
    } catch (error) {
      return Object.freeze({ design: null, source: "invalid", message: error instanceof Error ? `Local design was retained but not opened: ${error.message}` : "Local design was retained but not opened." });
    }
  }
  return Object.freeze({ design: null, source: "none", message: "No local v5 design found." });
}

export function saveDeckDesignV5(storage: Pick<Storage, "setItem">, design: DeckDesignV5): void {
  validate(design);
  storage.setItem(V5_STORAGE_KEY, stableDeckDesignV5Json(design));
}
