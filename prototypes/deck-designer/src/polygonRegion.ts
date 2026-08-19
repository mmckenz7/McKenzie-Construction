import {
  horizontalIntervalsAt,
  normalizePolygon,
  polygonContainsPoint,
  polygonsIntersect,
  signedPolygonArea,
  verticalIntervalsAt,
  type PolygonInterval,
  type PolygonPoint,
} from "./polygon";

export type PolygonRegion = Readonly<{
  outer: readonly PolygonPoint[];
  holes: readonly (readonly PolygonPoint[])[];
}>;

function subtractIntervals(
  source: readonly PolygonInterval[],
  exclusions: readonly PolygonInterval[],
): readonly PolygonInterval[] {
  let remaining = [...source];
  for (const exclusion of exclusions) {
    remaining = remaining.flatMap((interval) => {
      if (exclusion.end <= interval.start || exclusion.start >= interval.end) return [interval];
      return [
        ...(exclusion.start > interval.start ? [{ start: interval.start, end: Math.min(exclusion.start, interval.end) }] : []),
        ...(exclusion.end < interval.end ? [{ start: Math.max(exclusion.end, interval.start), end: interval.end }] : []),
      ];
    });
  }
  return Object.freeze(remaining.map((interval) => Object.freeze(interval)));
}

export function normalizePolygonRegion(region: PolygonRegion): PolygonRegion {
  if (region.holes.length > 8) throw new RangeError("A deck region can contain no more than 8 holes.");
  const outer = normalizePolygon(region.outer);
  const holes = region.holes.map((hole, holeIndex) => {
    const normalized = normalizePolygon(hole);
    if (polygonsIntersect(outer, normalized) || normalized.some((point) => !polygonContainsPoint(outer, point))) {
      throw new RangeError(`Deck hole ${holeIndex + 1} must remain strictly inside the outer ring.`);
    }
    return normalized;
  });
  for (let first = 0; first < holes.length; first += 1) {
    for (let second = first + 1; second < holes.length; second += 1) {
      if (polygonsIntersect(holes[first], holes[second]) ||
          polygonContainsPoint(holes[first], holes[second][0]) ||
          polygonContainsPoint(holes[second], holes[first][0])) {
        throw new RangeError("Deck holes cannot touch, overlap, or contain one another.");
      }
    }
  }
  return Object.freeze({ outer, holes: Object.freeze(holes) });
}

export function polygonRegionArea(region: PolygonRegion): number {
  const normalized = normalizePolygonRegion(region);
  return signedPolygonArea(normalized.outer) - normalized.holes.reduce(
    (sum, hole) => sum + signedPolygonArea(hole),
    0,
  );
}

export function horizontalRegionIntervalsAt(region: PolygonRegion, z: number): readonly PolygonInterval[] {
  const normalized = normalizePolygonRegion(region);
  return subtractIntervals(
    horizontalIntervalsAt(normalized.outer, z),
    normalized.holes.flatMap((hole) => horizontalIntervalsAt(hole, z)),
  );
}

export function verticalRegionIntervalsAt(region: PolygonRegion, x: number): readonly PolygonInterval[] {
  const normalized = normalizePolygonRegion(region);
  return subtractIntervals(
    verticalIntervalsAt(normalized.outer, x),
    normalized.holes.flatMap((hole) => verticalIntervalsAt(hole, x)),
  );
}
