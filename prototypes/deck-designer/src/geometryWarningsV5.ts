import { deriveGeometryWarningsV4, type GeometryWarningV4 } from "./geometryWarningsV4";
import { deckDesignV5ToV4Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt } from "./polygonRegion";

export type GeometryWarningV5 = GeometryWarningV4;

function interruptedJoistIds(design: DeckDesignV5, platformId: string, holeIndex: number): readonly string[] {
  const platform = design.platforms.find((candidate) => candidate.id === platformId)!;
  const holeRegion = { outer: platform.region.holes[holeIndex], holes: [] };
  const horizontalBoards = platform.construction.decking.direction === "left_right";
  const minimum = Math.min(...platform.region.outer.map((point) => horizontalBoards ? point.x : point.z));
  const maximum = Math.max(...platform.region.outer.map((point) => horizontalBoards ? point.x : point.z));
  const bays = Math.ceil((maximum - minimum) / platform.construction.framing.joistSpacing);
  return Object.freeze(Array.from({ length: bays + 1 }, (_, index) => {
    const coordinate = minimum + ((maximum - minimum) * index) / bays;
    const sample = index === bays ? coordinate - .000001 : coordinate;
    const crossings = horizontalBoards
      ? verticalRegionIntervalsAt(holeRegion, sample)
      : horizontalRegionIntervalsAt(holeRegion, sample);
    return crossings.length ? `joist-${index + 1}` : null;
  }).filter((id): id is string => id !== null));
}

export function deriveGeometryWarningsV5(design: DeckDesignV5, platformId: string): readonly GeometryWarningV5[] {
  const normalized = normalizeDeckDesignV5(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const warnings = [...deriveGeometryWarningsV4(deckDesignV5ToV4Compatibility(normalized), platformId)];
  platform.region.holes.forEach((_, holeIndex) => {
    const joistIds = interruptedJoistIds(normalized, platformId, holeIndex);
    if (!joistIds.length) return;
    warnings.push(Object.freeze({
      id: `joist-cutout-interruption-${holeIndex + 1}`,
      severity: "clearance",
      geometryIds: Object.freeze([`${platform.id}:hole-${holeIndex + 1}`, ...joistIds]),
      message: `Cutout ${holeIndex + 1} interrupts ${joistIds.length} conceptual joist path${joistIds.length === 1 ? "" : "s"}; header and trimmer framing is not designed and requires qualified review.`,
    }));
  });
  return Object.freeze(warnings.sort((left, right) => left.id.localeCompare(right.id)));
}
