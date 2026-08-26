import type { DeckBoardDirection, ProjectedMember } from "./polygonProjection";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt, type PolygonRegion } from "./polygonRegion";

export type ConceptualBeamLineInput = Readonly<{
  id: string;
  offsetFromOutside: number;
  maxSupportSpacing: number;
}>;

export type ConceptualSupportPost = Readonly<{ id: string; x: number; z: number; top: number }>;

export type ConceptualBeamProjection = Readonly<{
  beams: readonly ProjectedMember[];
  supportPosts: readonly ConceptualSupportPost[];
}>;

export const CONCEPTUAL_BEAM_CENTER_OFFSET = 13;
export const CONCEPTUAL_BEAM_HEIGHT = 9.25;
export const CONCEPTUAL_BEAM_WIDTH = 4.5;
export const CONCEPTUAL_SUPPORT_POST_SIZE = 5.5;

export const conceptualSupportPostTop = (postTop: number, gradeElevation: number): number => Math.max(postTop, gradeElevation + 1);

export function conceptualBeamVerticalRange(platformElevation: number): Readonly<{ base: number; top: number }> {
  const center = platformElevation - CONCEPTUAL_BEAM_CENTER_OFFSET;
  return Object.freeze({ base: center - CONCEPTUAL_BEAM_HEIGHT / 2, top: center + CONCEPTUAL_BEAM_HEIGHT / 2 });
}

function evenlySpacedPositions(length: number, maximumSpacing: number): readonly number[] {
  const bays = Math.max(1, Math.ceil(length / maximumSpacing));
  return Object.freeze(Array.from({ length: bays + 1 }, (_, index) => (length * index) / bays));
}

export function deriveConceptualBeamProjection(input: Readonly<{
  region: PolygonRegion;
  boardDirection: DeckBoardDirection;
  platformElevation: number;
  beamLines: readonly ConceptualBeamLineInput[];
}>): ConceptualBeamProjection {
  const horizontal = input.boardDirection === "left_right";
  const outside = horizontal
    ? Math.max(...input.region.outer.map((point) => point.z))
    : Math.max(...input.region.outer.map((point) => point.x));
  const beams = Object.freeze(input.beamLines.flatMap((line) => {
    const coordinate = outside - line.offsetFromOutside;
    const intervals = horizontal
      ? horizontalRegionIntervalsAt(input.region, coordinate)
      : verticalRegionIntervalsAt(input.region, coordinate);
    return intervals.map((interval, index) => Object.freeze({
      id: `${line.id}-segment-${index + 1}`,
      start: Object.freeze(horizontal ? { x: interval.start, z: coordinate } : { x: coordinate, z: interval.start }),
      end: Object.freeze(horizontal ? { x: interval.end, z: coordinate } : { x: coordinate, z: interval.end }),
    }));
  }));
  const spacingByLineId = new Map(input.beamLines.map((line) => [line.id, line.maxSupportSpacing]));
  const supportPosts = Object.freeze(beams.flatMap((beam) => {
    const lineId = beam.id.replace(/-segment-\d+$/, "");
    const maximumSpacing = spacingByLineId.get(lineId);
    if (!maximumSpacing) throw new RangeError(`Beam line ${lineId} has no recorded support spacing.`);
    const length = Math.hypot(beam.end.x - beam.start.x, beam.end.z - beam.start.z);
    return evenlySpacedPositions(length, maximumSpacing).map((distance, index) => {
      const ratio = length === 0 ? 0 : distance / length;
      return Object.freeze({
        id: `${beam.id}-support-${index + 1}`,
        x: beam.start.x + (beam.end.x - beam.start.x) * ratio,
        z: beam.start.z + (beam.end.z - beam.start.z) * ratio,
        top: input.platformElevation - 8,
      });
    });
  }));
  return Object.freeze({ beams, supportPosts });
}
