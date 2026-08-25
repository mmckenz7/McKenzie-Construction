import { normalizeDeckDesignV5, type DeckDesignV5, type EdgeFinishIntentV5 } from "./modelV5";

export function setEdgeFinishIntentV5(
  design: DeckDesignV5,
  platformId: string,
  edgeId: string,
  update: Readonly<{ fasciaEnabled: boolean; skirtingEnabled: boolean }>,
): DeckDesignV5 {
  const normalized = normalizeDeckDesignV5(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const next: EdgeFinishIntentV5[] = platform.construction.edgeFinishes.filter((intent) => intent.edgeId !== edgeId);
  if (update.fasciaEnabled || update.skirtingEnabled) next.push({ edgeId, ...update });
  return normalizeDeckDesignV5({
    ...normalized,
    platforms: normalized.platforms.map((candidate) => candidate.id === platformId ? {
      ...candidate,
      construction: { ...candidate.construction, edgeFinishes: next },
    } : candidate),
    metadata: { ...normalized.metadata, revision: normalized.metadata.revision + 1 },
  });
}
