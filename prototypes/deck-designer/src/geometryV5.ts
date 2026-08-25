import { deriveEdgeFinishGeometryV5, type EdgeFinishGeometryV5 } from "./edgeFinishProjectionV5";
import { derivePlatformGeometryV4, type DeckPlatformGeometryV4 } from "./geometryV4";
import { deckDesignV5ToV4Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";

export type DeckPlatformGeometryV5 = DeckPlatformGeometryV4 & EdgeFinishGeometryV5;

export function derivePlatformGeometryV5(design: DeckDesignV5, platformId: string): DeckPlatformGeometryV5 {
  const normalized = normalizeDeckDesignV5(design);
  const base = derivePlatformGeometryV4(deckDesignV5ToV4Compatibility(normalized), platformId);
  return Object.freeze({ ...base, ...deriveEdgeFinishGeometryV5(normalized, platformId) });
}
