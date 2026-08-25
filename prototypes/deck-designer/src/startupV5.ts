import { DEFAULT_DESIGN } from "./model";
import { migrateDeckDesignToV5, type DeckDesignV5 } from "./modelV5";
import type { V5LoadResult } from "./storageV5";

export type V5Startup = Readonly<{
  design: DeckDesignV5;
  message: string;
  source: V5LoadResult["source"];
}>;

export function resolveV5Startup(loadResult: V5LoadResult): V5Startup {
  if (loadResult.design) {
    return Object.freeze({ design: loadResult.design, message: loadResult.message, source: loadResult.source });
  }
  const recovery = loadResult.source === "invalid"
    ? `${loadResult.message} A fresh design is open in memory; retained local data was not replaced.`
    : "Started a fresh local v5 design.";
  return Object.freeze({
    design: migrateDeckDesignToV5(DEFAULT_DESIGN),
    message: recovery,
    source: loadResult.source,
  });
}
