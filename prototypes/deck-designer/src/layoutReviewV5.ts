import { deriveGeometryWarningsV5 } from "./geometryWarningsV5";
import { deriveLayoutReviewFromWarningsV3, type LayoutReviewV3 } from "./layoutReviewV3";
import { deckDesignV5ToV3Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";

export type LayoutReviewV5 = LayoutReviewV3;

export function deriveLayoutReviewV5(design: DeckDesignV5, platformId: string): LayoutReviewV5 {
  const normalized = normalizeDeckDesignV5(design);
  return deriveLayoutReviewFromWarningsV3(
    deckDesignV5ToV3Compatibility(normalized),
    platformId,
    deriveGeometryWarningsV5(normalized, platformId),
  );
}
