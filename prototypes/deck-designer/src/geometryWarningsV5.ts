import { deriveGeometryWarningsV4, type GeometryWarningV4 } from "./geometryWarningsV4";
import { deriveConceptualBeamProjection } from "./beamProjection";
import { deckDesignV5ToV4Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { derivePolygonMembers, type ProjectedMember } from "./polygonProjection";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt } from "./polygonRegion";

export type GeometryWarningV5 = GeometryWarningV4;

const EPSILON = .01;

function pointSegmentDistance(point: PolygonPoint, start: PolygonPoint, end: PolygonPoint): number {
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.z - (start.z + ratio * dz));
}

function orientation(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsIntersect(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint): boolean {
  const first = orientation(a, b, c), second = orientation(a, b, d);
  const third = orientation(c, d, a), fourth = orientation(c, d, b);
  return first * second <= EPSILON && third * fourth <= EPSILON &&
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + EPSILON &&
    Math.max(Math.min(a.z, b.z), Math.min(c.z, d.z)) <= Math.min(Math.max(a.z, b.z), Math.max(c.z, d.z)) + EPSILON;
}

function segmentDistance(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function beamToHoleDistance(beams: readonly Readonly<{ start: PolygonPoint; end: PolygonPoint }>[], hole: readonly PolygonPoint[]): number {
  return Math.min(...beams.flatMap((beam) => hole.map((point, index) => segmentDistance(beam.start, beam.end, point, hole[(index + 1) % hole.length]))));
}

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

function adjacentJoistClearance(design: DeckDesignV5, platformId: string, holeIndex: number): Readonly<{ ids: readonly string[]; clearance: number }> {
  const platform = design.platforms.find((candidate) => candidate.id === platformId)!;
  const interrupted = new Set(interruptedJoistIds(design, platformId, holeIndex));
  const joists = derivePolygonMembers(platform.region, {
    boardWidth: platform.construction.decking.boardWidth,
    gap: platform.construction.decking.gap,
    boardDirection: platform.construction.decking.direction,
    joistSpacing: platform.construction.framing.joistSpacing,
  }).joists;
  const byPath = new Map<string, ProjectedMember[]>();
  joists.forEach((member) => {
    const id = member.id.match(/^joist-\d+/)?.[0];
    if (!id) return;
    byPath.set(id, [...(byPath.get(id) ?? []), member]);
  });
  const hole = platform.region.holes[holeIndex];
  const close = [...byPath.entries()].filter(([id, members]) => !interrupted.has(id) && beamToHoleDistance(members, hole) < 12 - EPSILON);
  return Object.freeze({
    ids: Object.freeze(close.map(([id]) => id)),
    clearance: close.length ? Math.min(...close.map(([, members]) => beamToHoleDistance(members, hole))) : Number.POSITIVE_INFINITY,
  });
}

export function deriveGeometryWarningsV5(design: DeckDesignV5, platformId: string): readonly GeometryWarningV5[] {
  const normalized = normalizeDeckDesignV5(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const warnings = [...deriveGeometryWarningsV4(deckDesignV5ToV4Compatibility(normalized), platformId)];
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  platform.construction.stairSystems.forEach((system, systemIndex) => {
    const edge = edges.find((candidate) => candidate.id === system.edgeId)!;
    const remainders = [
      { distance: system.offset, point: edge.start },
      { distance: edge.length - system.offset - system.width, point: edge.end },
    ];
    remainders.forEach((remainder, remainderIndex) => {
      if (remainder.distance <= EPSILON || remainder.distance >= 12 - EPSILON) return;
      const other = remainders[1 - remainderIndex].point;
      const endLabel = Math.abs(remainder.point.x - other.x) >= Math.abs(remainder.point.z - other.z)
        ? remainder.point.x < other.x ? "left" : "right"
        : remainder.point.z < other.z ? "top" : "bottom";
      const measured = Math.round(remainder.distance * 10) / 10;
      warnings.push(Object.freeze({
        id: `stair-edge-remainder-${system.id}-${remainderIndex + 1}`,
        severity: "clearance",
        geometryIds: Object.freeze([system.id, system.edgeId]),
        message: `Stair system ${systemIndex + 1} leaves ${measured} inches of deck edge near the ${endLabel} end of its selected side; verify the intended corner placement.`,
      }));
    });
  });
  platform.construction.framing.beamLines.forEach((line, lineIndex) => {
    platform.construction.framing.beamLines.slice(lineIndex + 1).forEach((otherLine, otherIndex) => {
      const clearance = Math.abs(otherLine.offsetFromOutside - line.offsetFromOutside);
      if (clearance >= 12 - EPSILON) return;
      const measured = Math.round(clearance * 10) / 10;
      warnings.push(Object.freeze({
        id: `beam-line-clearance-${line.id}-${otherLine.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, otherLine.id]),
        message: `Conceptual beams ${lineIndex + 1} and ${lineIndex + otherIndex + 2} are ${measured} inches apart in plan; verify that both recorded beam routes are intended.`,
      }));
    });
  });
  platform.construction.framing.beamLines.forEach((line, lineIndex) => {
    const beams = deriveConceptualBeamProjection({
      region: platform.region,
      boardDirection: platform.construction.decking.direction,
      platformElevation: platform.elevation,
      beamLines: [line],
    }).beams;
    platform.region.holes.forEach((hole, holeIndex) => {
      if (warnings.some((warning) => warning.id === `beam-cutout-interruption-${line.id}-${holeIndex + 1}`)) return;
      const clearance = beamToHoleDistance(beams, hole);
      if (clearance >= 12 - EPSILON) return;
      const measured = Math.round(clearance * 10) / 10;
      warnings.push(Object.freeze({
        id: `beam-cutout-clearance-${line.id}-${holeIndex + 1}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, `${platform.id}:hole-${holeIndex + 1}`]),
        message: `Conceptual beam ${lineIndex + 1} is ${measured} inches from cutout ${holeIndex + 1}; verify the intended framing clearance.`,
      }));
    });
  });
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
  platform.region.holes.forEach((_, holeIndex) => {
    const adjacent = adjacentJoistClearance(normalized, platformId, holeIndex);
    if (!adjacent.ids.length) return;
    const measured = Math.round(adjacent.clearance * 10) / 10;
    warnings.push(Object.freeze({
      id: `joist-cutout-clearance-${holeIndex + 1}`,
      severity: "clearance",
      geometryIds: Object.freeze([`${platform.id}:hole-${holeIndex + 1}`, ...adjacent.ids]),
      message: `Cutout ${holeIndex + 1} is ${measured} inches from ${adjacent.ids.length} adjacent conceptual joist path${adjacent.ids.length === 1 ? "" : "s"}; verify the intended framing clearance.`,
    }));
  });
  return Object.freeze(warnings.sort((left, right) => left.id.localeCompare(right.id)));
}
