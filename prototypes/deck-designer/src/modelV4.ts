import { migrateDeckDesignToV3, normalizeDeckDesignV3, type DeckDesignV3, type DeckPlatformV3 } from "./modelV3";

export type BeamLineV4 = Readonly<{
  id: string;
  offsetFromOutside: number;
  maxSupportSpacing: number;
}>;

type FramingV4 = Readonly<{
  joistSpacing: number;
  beamLines: readonly BeamLineV4[];
}>;

export type DeckPlatformV4 = Omit<DeckPlatformV3, "construction"> & Readonly<{
  construction: Omit<DeckPlatformV3["construction"], "framing"> & Readonly<{ framing: FramingV4 }>;
}>;

export type DeckDesignV4 = Omit<DeckDesignV3, "schemaVersion" | "platforms"> & Readonly<{
  schemaVersion: 4;
  platforms: readonly DeckPlatformV4[];
}>;

const STABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function axisSpan(platform: Pick<DeckPlatformV4, "region" | "construction">): number {
  const values = platform.region.outer.map((point) => platform.construction.decking.direction === "left_right" ? point.z : point.x);
  return Math.max(...values) - Math.min(...values);
}

function withDerivedStairs(construction: Omit<DeckPlatformV4["construction"], "stairs">, stairs: DeckPlatformV3["construction"]["stairs"]): DeckPlatformV4["construction"] {
  const result = { ...construction } as DeckPlatformV4["construction"];
  Object.defineProperty(result, "stairs", { value: stairs, enumerable: false, configurable: false, writable: false });
  return Object.freeze(result);
}

export function v3CompatibilityPlatform(platform: DeckPlatformV4): DeckPlatformV3 {
  return {
    ...platform,
    construction: {
      ...platform.construction,
      framing: {
        joistSpacing: platform.construction.framing.joistSpacing,
        // V3 validates the legacy single-beam fields. V4 beam lines are
        // validated independently below, so keep this compatibility view at
        // known-safe values rather than imposing the old inset limit on V4.
        beamInset: 24,
        maxPostSpacing: 72,
      },
    },
  };
}

export function deckDesignV4ToV3Compatibility(design: DeckDesignV4): DeckDesignV3 {
  const normalized = normalizeDeckDesignV4(design);
  return normalizeDeckDesignV3({ ...normalized, schemaVersion: 3, platforms: normalized.platforms.map(v3CompatibilityPlatform) });
}

function normalizeBeamLines(platform: DeckPlatformV4): readonly BeamLineV4[] {
  const candidates = platform.construction.framing.beamLines;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 6) throw new RangeError("A v4 platform must contain between one and six conceptual beam lines.");
  const span = axisSpan(platform);
  const ids = new Set<string>();
  const offsets = new Set<number>();
  const normalized = candidates.map((candidate) => {
    if (!STABLE_ID.test(candidate.id) || ids.has(candidate.id)) throw new TypeError("Every v4 beam line requires a unique stable lowercase ID.");
    if (!Number.isFinite(candidate.offsetFromOutside) || candidate.offsetFromOutside < 6 || candidate.offsetFromOutside > span - 6) throw new RangeError("A v4 beam line must stay at least 6 inches inside both platform axis bounds.");
    if (!Number.isFinite(candidate.maxSupportSpacing) || candidate.maxSupportSpacing < 24 || candidate.maxSupportSpacing > 120) throw new RangeError("V4 conceptual beam support spacing must be between 24 and 120 inches.");
    const offsetKey = Math.round(candidate.offsetFromOutside * 10000) / 10000;
    if (offsets.has(offsetKey)) throw new RangeError("Conceptual beam lines cannot occupy the same recorded offset.");
    ids.add(candidate.id); offsets.add(offsetKey);
    return Object.freeze({ id: candidate.id, offsetFromOutside: candidate.offsetFromOutside, maxSupportSpacing: candidate.maxSupportSpacing });
  });
  return Object.freeze(normalized.sort((left, right) => left.offsetFromOutside - right.offsetFromOutside || left.id.localeCompare(right.id)));
}

export function normalizeDeckDesignV4(design: DeckDesignV4): DeckDesignV4 {
  if (design.schemaVersion !== 4) throw new TypeError("DeckDesign v4 normalization requires schemaVersion 4.");
  const v3 = normalizeDeckDesignV3({ ...design, schemaVersion: 3, platforms: design.platforms.map(v3CompatibilityPlatform) });
  const platforms = Object.freeze(v3.platforms.map((platform, index): DeckPlatformV4 => {
    const input = design.platforms[index];
    const beamLines = normalizeBeamLines({ ...input, region: platform.region, construction: { ...input.construction, decking: platform.construction.decking } });
    return Object.freeze({
      ...platform,
      construction: withDerivedStairs({
        decking: platform.construction.decking,
        framing: Object.freeze({ joistSpacing: platform.construction.framing.joistSpacing, beamLines }),
        railing: platform.construction.railing,
        stairSystems: platform.construction.stairSystems,
      }, platform.construction.stairs),
    });
  }));
  return Object.freeze({ ...v3, schemaVersion: 4, platforms });
}

export function migrateDeckDesignToV4(input: unknown): DeckDesignV4 {
  if (typeof input === "object" && input !== null && (input as { schemaVersion?: unknown }).schemaVersion === 4) return normalizeDeckDesignV4(input as DeckDesignV4);
  const v3 = migrateDeckDesignToV3(input);
  return normalizeDeckDesignV4({
    ...v3,
    schemaVersion: 4,
    platforms: v3.platforms.map((platform) => ({
      ...platform,
      construction: {
        ...platform.construction,
        framing: {
          joistSpacing: platform.construction.framing.joistSpacing,
          beamLines: [{ id: "beam-line-1", offsetFromOutside: platform.construction.framing.beamInset, maxSupportSpacing: platform.construction.framing.maxPostSpacing }],
        },
      },
    })),
  });
}

export function stableDeckDesignV4Json(design: DeckDesignV4): string {
  return `${JSON.stringify(normalizeDeckDesignV4(design), null, 2)}\n`;
}

export function deckDesignV4Fingerprint(design: DeckDesignV4): string {
  const text = stableDeckDesignV4Json(design);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `v4-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
