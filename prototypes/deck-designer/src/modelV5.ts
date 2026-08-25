import { deriveGeometricPolygonEdges } from "./polygon";
import {
  deckDesignV4ToV3Compatibility,
  migrateDeckDesignToV4,
  normalizeDeckDesignV4,
  type DeckDesignV4,
  type DeckPlatformV4,
} from "./modelV4";

export type EdgeFinishIntentV5 = Readonly<{
  edgeId: string;
  fasciaEnabled: boolean;
  skirtingEnabled: boolean;
}>;

export type DeckPlatformV5 = Omit<DeckPlatformV4, "construction"> & Readonly<{
  construction: DeckPlatformV4["construction"] & Readonly<{
    edgeFinishes: readonly EdgeFinishIntentV5[];
  }>;
}>;

export type DeckDesignV5 = Omit<DeckDesignV4, "schemaVersion" | "platforms"> & Readonly<{
  schemaVersion: 5;
  platforms: readonly DeckPlatformV5[];
}>;

function withDerivedStairs(
  construction: Omit<DeckPlatformV5["construction"], "stairs">,
  stairs: DeckPlatformV4["construction"]["stairs"],
): DeckPlatformV5["construction"] {
  const result = { ...construction } as DeckPlatformV5["construction"];
  Object.defineProperty(result, "stairs", { value: stairs, enumerable: false, configurable: false, writable: false });
  return Object.freeze(result);
}

export function v4CompatibilityPlatform(platform: DeckPlatformV5): DeckPlatformV4 {
  const { edgeFinishes: _edgeFinishes, ...construction } = platform.construction;
  return { ...platform, construction };
}

export function deckDesignV5ToV4Compatibility(design: DeckDesignV5): DeckDesignV4 {
  const platforms = design.platforms.map(v4CompatibilityPlatform);
  return normalizeDeckDesignV4({ ...design, schemaVersion: 4, platforms });
}

export function deckDesignV5ToV3Compatibility(design: DeckDesignV5) {
  return deckDesignV4ToV3Compatibility(deckDesignV5ToV4Compatibility(design));
}

function normalizeEdgeFinishes(platform: DeckPlatformV5): readonly EdgeFinishIntentV5[] {
  const candidates = platform.construction.edgeFinishes;
  if (!Array.isArray(candidates) || candidates.length > 24) throw new RangeError("A v5 platform may contain no more than 24 edge-finish intents.");
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const edgeOrder = new Map(edges.map((edge, index) => [edge.id, index]));
  const conditions = new Map(platform.edgeConditions.map((condition) => [condition.edgeId, condition.condition]));
  const seen = new Set<string>();
  const normalized = candidates.map((candidate) => {
    if (!edgeOrder.has(candidate.edgeId) || seen.has(candidate.edgeId)) throw new RangeError("Every v5 edge-finish intent must reference one unique current outer edge.");
    if (conditions.get(candidate.edgeId) !== "free") throw new RangeError("Fascia and skirting intent may only reference a free outer edge.");
    if (typeof candidate.fasciaEnabled !== "boolean" || typeof candidate.skirtingEnabled !== "boolean") throw new TypeError("V5 fascia and skirting intent must use explicit boolean values.");
    if (!candidate.fasciaEnabled && !candidate.skirtingEnabled) throw new RangeError("An empty v5 edge-finish intent must be omitted.");
    seen.add(candidate.edgeId);
    return Object.freeze({ edgeId: candidate.edgeId, fasciaEnabled: candidate.fasciaEnabled, skirtingEnabled: candidate.skirtingEnabled });
  });
  return Object.freeze(normalized.sort((left, right) => edgeOrder.get(left.edgeId)! - edgeOrder.get(right.edgeId)!));
}

export function normalizeDeckDesignV5(design: DeckDesignV5): DeckDesignV5 {
  if (design.schemaVersion !== 5) throw new TypeError("DeckDesign v5 normalization requires schemaVersion 5.");
  const v4 = normalizeDeckDesignV4({ ...design, schemaVersion: 4, platforms: design.platforms.map(v4CompatibilityPlatform) });
  const platforms = Object.freeze(v4.platforms.map((platform, index): DeckPlatformV5 => {
    const input = design.platforms[index];
    const edgeFinishes = normalizeEdgeFinishes({ ...input, region: platform.region, edgeConditions: platform.edgeConditions });
    return Object.freeze({
      ...platform,
      construction: withDerivedStairs({ ...platform.construction, edgeFinishes }, platform.construction.stairs),
    });
  }));
  return Object.freeze({ ...v4, schemaVersion: 5, platforms });
}

export function migrateDeckDesignToV5(input: unknown): DeckDesignV5 {
  if (typeof input === "object" && input !== null && (input as { schemaVersion?: unknown }).schemaVersion === 5) return normalizeDeckDesignV5(input as DeckDesignV5);
  const v4 = migrateDeckDesignToV4(input);
  return normalizeDeckDesignV5({
    ...v4,
    schemaVersion: 5,
    platforms: v4.platforms.map((platform) => ({ ...platform, construction: { ...platform.construction, edgeFinishes: [] } })),
  });
}

export function stableDeckDesignV5Json(design: DeckDesignV5): string {
  return `${JSON.stringify(normalizeDeckDesignV5(design), null, 2)}\n`;
}

export function deckDesignV5Fingerprint(design: DeckDesignV5): string {
  const text = stableDeckDesignV5Json(design);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `v5-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
