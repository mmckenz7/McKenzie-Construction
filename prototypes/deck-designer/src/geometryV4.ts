import { deriveConceptualBeamProjection } from "./beamProjection";
import { derivePlatformGeometryV3, type DeckPlatformGeometryV3 } from "./geometryV3";
import { deckDesignV4ToV3Compatibility, normalizeDeckDesignV4, type DeckDesignV4 } from "./modelV4";

export type DeckPlatformGeometryV4 = DeckPlatformGeometryV3;

export function derivePlatformGeometryV4(design: DeckDesignV4, platformId: string): DeckPlatformGeometryV4 {
  const normalized = normalizeDeckDesignV4(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const base = derivePlatformGeometryV3(deckDesignV4ToV3Compatibility(normalized), platformId);
  const framing = deriveConceptualBeamProjection({
    region: platform.region,
    boardDirection: platform.construction.decking.direction,
    platformElevation: platform.elevation,
    beamLines: platform.construction.framing.beamLines,
  });
  return Object.freeze({ ...base, beams: framing.beams, supportPosts: framing.supportPosts });
}
