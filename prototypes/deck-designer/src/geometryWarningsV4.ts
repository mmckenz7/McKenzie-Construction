import { deriveGeometryWarningsV3, type GeometryWarningV3 } from "./geometryWarningsV3";
import { deckDesignV4ToV3Compatibility, normalizeDeckDesignV4, type DeckDesignV4 } from "./modelV4";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt } from "./polygonRegion";

export type GeometryWarningV4 = GeometryWarningV3;

export function deriveGeometryWarningsV4(design: DeckDesignV4, platformId: string): readonly GeometryWarningV4[] {
  const normalized = normalizeDeckDesignV4(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const warnings = deriveGeometryWarningsV3(deckDesignV4ToV3Compatibility(normalized), platformId)
    .filter((warning) => !warning.id.startsWith("beam-cutout-interruption-"));
  const horizontal = platform.construction.decking.direction === "left_right";
  const outside = Math.max(...platform.region.outer.map((point) => horizontal ? point.z : point.x));
  platform.construction.framing.beamLines.forEach((line) => {
    const coordinate = outside - line.offsetFromOutside;
    platform.region.holes.forEach((hole, holeIndex) => {
      const holeRegion = { outer: hole, holes: [] };
      const crossings = horizontal ? horizontalRegionIntervalsAt(holeRegion, coordinate) : verticalRegionIntervalsAt(holeRegion, coordinate);
      if (crossings.length > 0) warnings.push(Object.freeze({
        id: `beam-cutout-interruption-${line.id}-${holeIndex + 1}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, `${platform.id}:hole-${holeIndex + 1}`]),
        message: `Conceptual beam ${line.id} crosses cutout ${holeIndex + 1} and is split into separate spans; verify the intended framing route.`,
      }));
    });
  });
  return Object.freeze(warnings.sort((left, right) => left.id.localeCompare(right.id)));
}
