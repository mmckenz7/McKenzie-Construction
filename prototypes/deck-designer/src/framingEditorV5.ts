import { addBeamLineV4, removeBeamLineV4, updateBeamLineV4 } from "./framingEditorV4";
import { deckDesignV5ToV4Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";
import type { BeamLineV4 } from "./modelV4";

function restore(design: DeckDesignV5, next: ReturnType<typeof deckDesignV5ToV4Compatibility>): DeckDesignV5 {
  return normalizeDeckDesignV5({
    ...next,
    schemaVersion: 5,
    platforms: next.platforms.map((platform) => ({
      ...platform,
      construction: {
        ...platform.construction,
        edgeFinishes: design.platforms.find((candidate) => candidate.id === platform.id)?.construction.edgeFinishes ?? [],
      },
    })),
  });
}

export function addBeamLineV5(design: DeckDesignV5, platformId: string, beamLine: BeamLineV4) {
  const result = addBeamLineV4(deckDesignV5ToV4Compatibility(design), platformId, beamLine);
  return Object.freeze({ ...result, design: restore(design, result.design) });
}

export function updateBeamLineV5(design: DeckDesignV5, platformId: string, beamLine: BeamLineV4) {
  const result = updateBeamLineV4(deckDesignV5ToV4Compatibility(design), platformId, beamLine);
  return Object.freeze({ ...result, design: restore(design, result.design) });
}

export function removeBeamLineV5(design: DeckDesignV5, platformId: string, beamLineId: string) {
  const result = removeBeamLineV4(deckDesignV5ToV4Compatibility(design), platformId, beamLineId);
  return Object.freeze({ ...result, design: restore(design, result.design) });
}
