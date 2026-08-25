import { derivePlatformGeometryV4 } from "./geometryV4";
import { migrateDeckDesignToV4, stableDeckDesignV4Json, type DeckDesignV4 } from "./modelV4";
import { V1_STORAGE_KEY, V2_STORAGE_KEY, V3_STORAGE_KEY } from "./storageV3";

export const V4_STORAGE_KEY = "mckenzie-deck-designer:v4:current";
export type V4LoadResult = Readonly<{ design: DeckDesignV4 | null; source: "v4" | "v3" | "v2" | "v1" | "none" | "invalid"; message: string }>;

function validate(design: DeckDesignV4): void {
  design.platforms.forEach((platform) => derivePlatformGeometryV4(design, platform.id));
}

export function loadDeckDesignV4(storage: Pick<Storage, "getItem" | "setItem">): V4LoadResult {
  const candidates = [["v4", V4_STORAGE_KEY], ["v3", V3_STORAGE_KEY], ["v2", V2_STORAGE_KEY], ["v1", V1_STORAGE_KEY]] as const;
  for (const [source, key] of candidates) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const design = migrateDeckDesignToV4(JSON.parse(raw));
      validate(design);
      if (source !== "v4") storage.setItem(V4_STORAGE_KEY, stableDeckDesignV4Json(design));
      return Object.freeze({ design, source, message: source === "v4" ? "Loaded local v4 design." : `Migrated local ${source} design to v4; the original was preserved.` });
    } catch (error) {
      return Object.freeze({ design: null, source: "invalid", message: error instanceof Error ? `Local design was retained but not opened: ${error.message}` : "Local design was retained but not opened." });
    }
  }
  return Object.freeze({ design: null, source: "none", message: "No local v4 design found." });
}

export function saveDeckDesignV4(storage: Pick<Storage, "setItem">, design: DeckDesignV4): void {
  validate(design);
  storage.setItem(V4_STORAGE_KEY, stableDeckDesignV4Json(design));
}
