import type { GeometryWarningV5 } from "./geometryWarningsV5";
import type { DeckPlatformV5 } from "./modelV5";

export type WarningSelectionV5 = Readonly<{
  holeIndex: number | null;
  beamLineId: string | null;
  stairSystemId: string | null;
  edgeId: string | null;
}>;

export function deriveWarningSelectionV5(platform: DeckPlatformV5, warning: GeometryWarningV5): WarningSelectionV5 {
  const holePrefix = `${platform.id}:hole-`;
  const holeReference = warning.geometryIds.find((id) => id.startsWith(holePrefix));
  const parsedHole = holeReference ? Number(holeReference.slice(holePrefix.length)) - 1 : NaN;
  const holeIndex = Number.isInteger(parsedHole) && parsedHole >= 0 && parsedHole < platform.region.holes.length ? parsedHole : null;
  const beamLineId = platform.construction.framing.beamLines.find((line) => warning.geometryIds.includes(line.id))?.id ?? null;
  const stair = platform.construction.stairSystems.find((system) => warning.geometryIds.includes(system.id)) ?? null;
  const edgeId = stair?.edgeId ?? platform.edgeConditions.find((condition) => warning.geometryIds.includes(condition.edgeId))?.edgeId ?? null;
  return Object.freeze({ holeIndex, beamLineId, stairSystemId: stair?.id ?? null, edgeId });
}
