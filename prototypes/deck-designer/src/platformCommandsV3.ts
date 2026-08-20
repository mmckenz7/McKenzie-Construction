import { normalizeDeckDesignV3, type DeckDesignV3, type DeckPlatformV3 } from "./modelV3";
import { deriveGeometricPolygonEdges } from "./polygon";

export type PlatformCommandResultV3 = Readonly<{
  command: "duplicate_platform" | "add_platform_level" | "remove_platform";
  design: DeckDesignV3;
  platformId: string;
  notices: readonly string[];
}>;

function assertPlatformId(platformId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(platformId)) {
    throw new TypeError("Platform ID must be a stable lowercase identifier of 1 to 64 characters.");
  }
}

export function addPlatformLevelV3(
  design: DeckDesignV3,
  sourcePlatformId: string,
  newPlatformId: string,
  elevation: number,
  offset: Readonly<{ x: number; z: number }>,
): PlatformCommandResultV3 {
  const normalized = normalizeDeckDesignV3(design);
  assertPlatformId(newPlatformId);
  const source = normalized.platforms.find((platform) => platform.id === sourcePlatformId);
  if (!source) throw new RangeError(`Platform ${sourcePlatformId} does not exist.`);
  if (normalized.platforms.some((platform) => platform.id === newPlatformId)) throw new RangeError(`Platform ${newPlatformId} already exists.`);
  if (normalized.platforms.length >= 8) throw new RangeError("DeckDesign v3 supports at most 8 platforms.");
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.z)) throw new TypeError("Platform level offset must be finite.");
  const translate = (point: Readonly<{ x: number; z: number }>) => Object.freeze({ x: point.x + offset.x, z: point.z + offset.z });
  const region = Object.freeze({ outer: Object.freeze(source.region.outer.map(translate)), holes: Object.freeze(source.region.holes.map((hole) => Object.freeze(hole.map(translate)))) });
  const edges = deriveGeometricPolygonEdges(region.outer);
  const level: DeckPlatformV3 = Object.freeze({
    ...source,
    id: newPlatformId,
    elevation,
    region,
    edgeConditions: Object.freeze(edges.map((edge) => Object.freeze({ edgeId: edge.id, condition: "free" as const, attachment: "none" as const }))),
    construction: Object.freeze({ ...source.construction, railing: Object.freeze({ ...source.construction.railing, enabledEdgeIds: Object.freeze([]) }), stairSystems: Object.freeze([]) }),
  });
  const next = normalizeDeckDesignV3({ ...normalized, platforms: [...normalized.platforms, level], metadata: { ...normalized.metadata, revision: normalized.metadata.revision + 1 } });
  return Object.freeze({
    command: "add_platform_level",
    design: next,
    platformId: newPlatformId,
    notices: Object.freeze([`Added ${newPlatformId} at ${elevation} inches elevation.`, "Side attachments, railings, stairs, and inter-platform connections were not inferred."]),
  });
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
