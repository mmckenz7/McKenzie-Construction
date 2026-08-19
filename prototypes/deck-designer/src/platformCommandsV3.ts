import { normalizeDeckDesignV3, type DeckDesignV3, type DeckPlatformV3 } from "./modelV3";

export type PlatformCommandResultV3 = Readonly<{
  command: "duplicate_platform" | "remove_platform";
  design: DeckDesignV3;
  platformId: string;
  notices: readonly string[];
}>;

function assertPlatformId(platformId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(platformId)) {
    throw new TypeError("Platform ID must be a stable lowercase identifier of 1 to 64 characters.");
  }
}

export function duplicatePlatformV3(
  design: DeckDesignV3,
  sourcePlatformId: string,
  newPlatformId: string,
  elevation: number,
): PlatformCommandResultV3 {
  const normalized = normalizeDeckDesignV3(design);
  assertPlatformId(newPlatformId);
  const source = normalized.platforms.find((platform) => platform.id === sourcePlatformId);
  if (!source) throw new RangeError(`Platform ${sourcePlatformId} does not exist.`);
  if (normalized.platforms.some((platform) => platform.id === newPlatformId)) {
    throw new RangeError(`Platform ${newPlatformId} already exists.`);
  }
  if (normalized.platforms.length >= 8) throw new RangeError("DeckDesign v3 supports at most 8 platforms.");
  const duplicated: DeckPlatformV3 = Object.freeze({ ...source, id: newPlatformId, elevation });
  const next = normalizeDeckDesignV3({
    ...normalized,
    platforms: [...normalized.platforms, duplicated],
    metadata: { ...normalized.metadata, revision: normalized.metadata.revision + 1 },
  });
  return Object.freeze({
    command: "duplicate_platform",
    design: next,
    platformId: newPlatformId,
    notices: Object.freeze([
      `Platform ${sourcePlatformId} duplicated as ${newPlatformId} at ${next.platforms.find((platform) => platform.id === newPlatformId)!.elevation} in elevation.`,
      "Inter-platform connections and structural relationships were not inferred.",
    ]),
  });
}

export function removePlatformV3(
  design: DeckDesignV3,
  platformId: string,
): PlatformCommandResultV3 {
  const normalized = normalizeDeckDesignV3(design);
  if (!normalized.platforms.some((platform) => platform.id === platformId)) {
    throw new RangeError(`Platform ${platformId} does not exist.`);
  }
  if (normalized.platforms.length === 1) throw new RangeError("DeckDesign v3 must retain at least one platform.");
  const next = normalizeDeckDesignV3({
    ...normalized,
    platforms: normalized.platforms.filter((platform) => platform.id !== platformId),
    metadata: { ...normalized.metadata, revision: normalized.metadata.revision + 1 },
  });
  return Object.freeze({
    command: "remove_platform",
    design: next,
    platformId,
    notices: Object.freeze([`Platform ${platformId} removed at revision ${next.metadata.revision}.`]),
  });
}
