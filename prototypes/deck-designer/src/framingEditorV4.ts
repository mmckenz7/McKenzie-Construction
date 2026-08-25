import { normalizeDeckDesignV4, type BeamLineV4, type DeckDesignV4, type DeckPlatformV4 } from "./modelV4";

export type BeamLineCommandResultV4 = Readonly<{ design: DeckDesignV4; platformId: string; beamLineId: string; notice: string }>;

function platformById(design: DeckDesignV4, platformId: string): DeckPlatformV4 {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  return platform;
}

function nextDesign(design: DeckDesignV4, platformId: string, beamLines: readonly BeamLineV4[]): DeckDesignV4 {
  return normalizeDeckDesignV4({ ...design, platforms: design.platforms.map((platform) => platform.id === platformId ? {
    ...platform, construction: { ...platform.construction, framing: { ...platform.construction.framing, beamLines } },
  } : platform), metadata: { ...design.metadata, revision: design.metadata.revision + 1 } });
}

function assertStableId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new TypeError("Beam line ID must be a stable lowercase identifier.");
}

export function addBeamLineV4(design: DeckDesignV4, platformId: string, beamLine: BeamLineV4): BeamLineCommandResultV4 {
  const normalized = normalizeDeckDesignV4(design), platform = platformById(normalized, platformId);
  assertStableId(beamLine.id);
  if (platform.construction.framing.beamLines.some((line) => line.id === beamLine.id)) throw new RangeError(`Beam line ${beamLine.id} already exists.`);
  const result = nextDesign(normalized, platformId, [...platform.construction.framing.beamLines, beamLine]);
  return Object.freeze({ design: result, platformId, beamLineId: beamLine.id, notice: `Added conceptual beam ${beamLine.id}.` });
}

export function updateBeamLineV4(design: DeckDesignV4, platformId: string, beamLine: BeamLineV4): BeamLineCommandResultV4 {
  const normalized = normalizeDeckDesignV4(design), platform = platformById(normalized, platformId);
  if (!platform.construction.framing.beamLines.some((line) => line.id === beamLine.id)) throw new RangeError(`Beam line ${beamLine.id} does not exist.`);
  const result = nextDesign(normalized, platformId, platform.construction.framing.beamLines.map((line) => line.id === beamLine.id ? beamLine : line));
  return Object.freeze({ design: result, platformId, beamLineId: beamLine.id, notice: `Updated conceptual beam ${beamLine.id}.` });
}

export function removeBeamLineV4(design: DeckDesignV4, platformId: string, beamLineId: string): BeamLineCommandResultV4 {
  const normalized = normalizeDeckDesignV4(design), platform = platformById(normalized, platformId);
  if (!platform.construction.framing.beamLines.some((line) => line.id === beamLineId)) throw new RangeError(`Beam line ${beamLineId} does not exist.`);
  if (platform.construction.framing.beamLines.length === 1) throw new RangeError("A platform must retain at least one conceptual beam line.");
  const result = nextDesign(normalized, platformId, platform.construction.framing.beamLines.filter((line) => line.id !== beamLineId));
  return Object.freeze({ design: result, platformId, beamLineId, notice: `Removed conceptual beam ${beamLineId}.` });
}

export function beamLineOffsetFromPointV4(platform: DeckPlatformV4, point: Readonly<{ x: number; z: number }>, snapIncrement: number): number {
  if (!Number.isFinite(snapIncrement) || snapIncrement <= 0) throw new RangeError("Beam drag step must be greater than zero.");
  const horizontal = platform.construction.decking.direction === "left_right";
  const values = platform.region.outer.map((corner) => horizontal ? corner.z : corner.x);
  const outside = Math.max(...values), span = outside - Math.min(...values);
  const coordinate = horizontal ? point.z : point.x;
  const offset = Math.round((outside - coordinate) / snapIncrement) * snapIncrement;
  return Math.max(6, Math.min(span - 6, offset));
}
