import { deriveGeometryWarningsV4, type GeometryWarningV4 } from "./geometryWarningsV4";
import { CONCEPTUAL_SUPPORT_POST_SIZE, conceptualBeamVerticalRange, conceptualSupportPostTop, deriveConceptualBeamProjection, type ConceptualSupportPost } from "./beamProjection";
import { convexPolygonsOverlap, positiveRegionOverlapArea, segmentCrossesConvexInterior } from "./geometryWarningsV3";
import { deriveHouseContextGeometry } from "./houseContextGeometry";
import { deckDesignV5ToV4Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { conceptualJoistVerticalRange, deriveJoistPathAxes, derivePolygonMembers, type ProjectedMember } from "./polygonProjection";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt } from "./polygonRegion";
import { deriveStairRouteGeometryV3, DISPLAYED_STAIR_LANDING_CENTER_OFFSET, DISPLAYED_STAIR_LANDING_HEIGHT, DISPLAYED_STAIR_TREAD_MINIMUM_HEIGHT } from "./stairRouteGeometryV3";

export type GeometryWarningV5 = GeometryWarningV4;

const EPSILON = .01;
const compareGeometryIds = (left: string, right: string): number => left.localeCompare(right, undefined, { numeric: true });
const roundedTenth = (value: number): number => Math.round(value * 10) / 10;
export function usesPrototypeReviewThresholdV5(warning: GeometryWarningV5): boolean {
  return warning.id.includes("clearance-") || warning.id.startsWith("beam-short-segment-") || warning.id.startsWith("stair-edge-remainder-");
}

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

function segmentsCrossBeyondEndpointContact(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint): boolean {
  const abX = b.x - a.x, abZ = b.z - a.z;
  const cdX = d.x - c.x, cdZ = d.z - c.z;
  const abLength = Math.hypot(abX, abZ), cdLength = Math.hypot(cdX, cdZ);
  if (abLength <= EPSILON || cdLength <= EPSILON) return false;
  const denominator = abX * cdZ - abZ * cdX;
  const relativeX = c.x - a.x, relativeZ = c.z - a.z;
  if (Math.abs(denominator) > EPSILON) {
    const alongAb = (relativeX * cdZ - relativeZ * cdX) / denominator;
    const alongCd = (relativeX * abZ - relativeZ * abX) / denominator;
    return alongAb > EPSILON / abLength && alongAb < 1 - EPSILON / abLength &&
      alongCd > EPSILON / cdLength && alongCd < 1 - EPSILON / cdLength;
  }
  if (Math.abs(relativeX * abZ - relativeZ * abX) > EPSILON) return false;
  const lengthSquared = abX * abX + abZ * abZ;
  const first = (relativeX * abX + relativeZ * abZ) / lengthSquared;
  const second = ((d.x - a.x) * abX + (d.z - a.z) * abZ) / lengthSquared;
  return (Math.min(1, Math.max(first, second)) - Math.max(0, Math.min(first, second))) * abLength > EPSILON;
}

function segmentDistance(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function beamToHoleDistance(beams: readonly Readonly<{ start: PolygonPoint; end: PolygonPoint }>[], hole: readonly PolygonPoint[]): number {
  return Math.min(...beams.flatMap((beam) => hole.map((point, index) => segmentDistance(beam.start, beam.end, point, hole[(index + 1) % hole.length]))));
}

function segmentToPolygonDistance(start: PolygonPoint, end: PolygonPoint, polygon: readonly PolygonPoint[]): number {
  return Math.min(...polygon.map((point, index) => segmentDistance(start, end, point, polygon[(index + 1) % polygon.length])));
}

function polygonDistance(first: readonly PolygonPoint[], second: readonly PolygonPoint[]): number {
  return Math.min(...first.map((point, index) => segmentToPolygonDistance(point, first[(index + 1) % first.length], second)));
}

function supportPostFootprint(post: ConceptualSupportPost): readonly PolygonPoint[] {
  const half = CONCEPTUAL_SUPPORT_POST_SIZE / 2;
  return [
    { x: post.x - half, z: post.z - half }, { x: post.x + half, z: post.z - half },
    { x: post.x + half, z: post.z + half }, { x: post.x - half, z: post.z + half },
  ];
}

type DisplayedStairElement = Readonly<{ id: string; c: readonly PolygonPoint[]; b: number; t: number }>;

function displayedStairElements(route: ReturnType<typeof deriveStairRouteGeometryV3>): readonly DisplayedStairElement[] {
  return [
    ...route.treads.map((tread) => ({
      id: tread.id,
      c: tread.corners,
      b: tread.y,
      t: tread.y + Math.max(DISPLAYED_STAIR_TREAD_MINIMUM_HEIGHT, tread.rise),
    })),
    ...route.landings.map((landing) => ({
      id: landing.id,
      c: landing.corners,
      b: landing.y + DISPLAYED_STAIR_LANDING_CENTER_OFFSET - DISPLAYED_STAIR_LANDING_HEIGHT / 2,
      t: landing.y + DISPLAYED_STAIR_LANDING_CENTER_OFFSET + DISPLAYED_STAIR_LANDING_HEIGHT / 2,
    })),
  ];
}

function interruptedJoistIds(design: DeckDesignV5, platformId: string, holeIndex: number): readonly string[] {
  const platform = design.platforms.find((candidate) => candidate.id === platformId)!;
  const holeRegion = { outer: platform.region.holes[holeIndex], holes: [] };
  const horizontalBoards = platform.construction.decking.direction === "left_right";
  return Object.freeze(deriveJoistPathAxes(platform.region.outer, platform.construction.decking.direction, platform.construction.framing.joistSpacing).map((axis) => {
    const crossings = horizontalBoards
      ? verticalRegionIntervalsAt(holeRegion, axis.sampleCoordinate)
      : horizontalRegionIntervalsAt(holeRegion, axis.sampleCoordinate);
    return crossings.length ? axis.id : null;
  }).filter((id): id is string => id !== null));
}

function adjacentJoistClearance(design: DeckDesignV5, platformId: string, holeIndex: number, joists: readonly ProjectedMember[]): Readonly<{ ids: readonly string[]; clearance: number }> {
  const platform = design.platforms.find((candidate) => candidate.id === platformId)!;
  const interrupted = new Set(interruptedJoistIds(design, platformId, holeIndex));
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
  const warnings = deriveGeometryWarningsV4(deckDesignV5ToV4Compatibility(normalized), platformId)
    .filter((warning) => !warning.id.startsWith("stair-route-collision-"));
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const stairRoutes = platform.construction.stairSystems.map((system, systemIndex) => deriveStairRouteGeometryV3({
    system,
    edge: edges.find((candidate) => candidate.id === system.edgeId)!,
    platformElevation: platform.elevation,
    gradeElevation: normalized.siteContext.gradeElevation,
    railingHeight: platform.construction.railing.height,
    namespaceIds: platform.construction.stairSystems.length > 1 || systemIndex > 0,
    targetPlatformElevations: Object.fromEntries(normalized.platforms.map((item) => [item.id, item.elevation])),
  }));
  const displayedStairRoutes = stairRoutes.map(displayedStairElements);
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
      const measured = roundedTenth(remainder.distance);
      warnings.push(Object.freeze({
        id: `stair-edge-remainder-${system.id}-${remainderIndex + 1}`,
        severity: "clearance",
        geometryIds: Object.freeze([system.id, system.edgeId]),
        message: `Stair system ${systemIndex + 1} leaves ${measured} inches of deck edge near the ${endLabel} end of its selected side; verify the intended corner placement.`,
      }));
    });
  });
  const house = deriveHouseContextGeometry(normalized.siteContext);
  const beamProjectionByLineId = new Map(platform.construction.framing.beamLines.map((line) => [line.id, deriveConceptualBeamProjection({
    region: platform.region,
    boardDirection: platform.construction.decking.direction,
    platformElevation: platform.elevation,
    beamLines: [line],
  })] as const));
  platform.construction.framing.beamLines.forEach((line) => {
    const posts = beamProjectionByLineId.get(line.id)!.supportPosts;
    platform.construction.stairSystems.forEach((system, systemIndex) => {
      const elements = displayedStairRoutes[systemIndex];
      const collisions = posts.flatMap((post) => {
        const postTop = conceptualSupportPostTop(post.top, normalized.siteContext.gradeElevation);
        return elements.filter((element) => normalized.siteContext.gradeElevation < element.t - EPSILON && postTop > element.b + EPSILON && convexPolygonsOverlap(supportPostFootprint(post), element.c))
          .map((element) => [post.id, element.id] as const);
      });
      if (!collisions.length) return;
      warnings.push(Object.freeze({
        id: `beam-support-stair-collision-${line.id}-${system.id}`,
        severity: "collision",
        geometryIds: Object.freeze([line.id, system.id, ...[...new Set(collisions.map(([postId]) => postId))].sort(compareGeometryIds), ...[...new Set(collisions.map(([, elementId]) => elementId))].sort(compareGeometryIds)]),
        message: "The current conceptual layout places a displayed support post inside the displayed stair route. Move/review the beam or stair before continuing. Reviewed structural post placement may change.",
      }));
    });
  });
  displayedStairRoutes.forEach((first, firstIndex) => {
    displayedStairRoutes.slice(firstIndex + 1).forEach((second, relativeIndex) => {
      const secondIndex = firstIndex + relativeIndex + 1;
      const planOverlaps = first.flatMap((firstElement) => second
        .filter((secondElement) => convexPolygonsOverlap(firstElement.c, secondElement.c))
        .map((secondElement) => [firstElement, secondElement] as const));
      const firstSystem = platform.construction.stairSystems[firstIndex];
      const secondSystem = platform.construction.stairSystems[secondIndex];
      const collisions = planOverlaps.filter(([firstElement, secondElement]) => Math.max(firstElement.b, secondElement.b) < Math.min(firstElement.t, secondElement.t) - EPSILON);
      if (collisions.length) {
        warnings.push(Object.freeze({
          id: `stair-route-collision-${firstSystem.id}-${secondSystem.id}`,
          severity: "collision",
          geometryIds: Object.freeze([firstSystem.id, secondSystem.id, ...[...new Set(collisions.flatMap((pair) => pair.map((element) => element.id)))].sort(compareGeometryIds)]),
          message: `Displayed stairs ${firstIndex + 1}/${secondIndex + 1} intersect. Move or reroute.`,
        }));
        return;
      }
      const crossesInPlan = !!planOverlaps.length;
      const clearance = crossesInPlan
        ? Math.min(...planOverlaps.map(([firstElement, secondElement]) => Math.max(firstElement.b, secondElement.b) - Math.min(firstElement.t, secondElement.t)))
        : Math.min(...first.flatMap((firstElement) => second.map((secondElement) => polygonDistance(firstElement.c, secondElement.c))));
      if (clearance <= EPSILON || clearance >= 12 - EPSILON) return;
      const measured = roundedTenth(clearance);
      warnings.push(Object.freeze({
        id: `stair-route-clearance-${firstSystem.id}-${secondSystem.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([firstSystem.id, secondSystem.id]),
        message: crossesInPlan
          ? `Stairs ${firstIndex + 1} and ${secondIndex + 1} cross in plan with ${measured} inches vertical separation; review route.`
          : `Stairs ${firstIndex + 1} and ${secondIndex + 1} are ${measured} inches apart in plan; review route.`,
      }));
    });
  });
  const projectedJoists = derivePolygonMembers(platform.region, {
    boardWidth: platform.construction.decking.boardWidth,
    gap: platform.construction.decking.gap,
    boardDirection: platform.construction.decking.direction,
    joistSpacing: platform.construction.framing.joistSpacing,
  }).joists;
  const joistVerticalRange = conceptualJoistVerticalRange(platform.elevation);
  normalized.siteContext.houseWalls.forEach((wall) => {
    const panels = house.houseWallPanels.filter((panel) => panel.wallId === wall.id &&
      panel.baseElevation < joistVerticalRange.top - EPSILON &&
      panel.baseElevation + panel.height > joistVerticalRange.base + EPSILON);
    const crossedPathIds = [...new Set(projectedJoists
      .filter((joist) => panels.some((panel) => segmentsCrossBeyondEndpointContact(joist.start, joist.end, panel.start, panel.end)))
      .map((joist) => joist.id.match(/^joist-\d+/)?.[0])
      .filter((id): id is string => Boolean(id)))]
      .sort(compareGeometryIds);
    if (!crossedPathIds.length) return;
    warnings.push(Object.freeze({
      id: `joist-house-plan-review-${platform.id}-${wall.id}`,
      severity: "clearance",
      geometryIds: Object.freeze([platform.id, ...crossedPathIds, wall.id]),
      message: `${crossedPathIds.length} conceptual joist ${crossedPathIds.length === 1 ? "path passes" : "paths pass"} through recorded house-wall context (${wall.id}) where their displayed vertical ranges overlap; field-verify the intended framing and wall layout.`,
    }));
  });
  platform.construction.framing.beamLines.forEach((line) => {
    const posts = beamProjectionByLineId.get(line.id)!.supportPosts;
    platform.region.holes.forEach((hole, holeIndex) => {
      const overlappingPostIds = posts.filter((post) => positiveRegionOverlapArea(supportPostFootprint(post), hole, []) > EPSILON).map((post) => post.id).sort(compareGeometryIds);
      if (!overlappingPostIds.length) return;
      warnings.push(Object.freeze({
        id: `beam-support-cutout-review-${line.id}-${holeIndex + 1}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, `${platform.id}:hole-${holeIndex + 1}`, ...overlappingPostIds]),
        message: `Support-post footprints in cutout ${holeIndex + 1}: ${overlappingPostIds.length}. Field review required; structural post placement may change.`,
      }));
    });
  });
  const beamVerticalRange = conceptualBeamVerticalRange(platform.elevation);
  platform.construction.framing.beamLines.forEach((line) => {
    const projection = beamProjectionByLineId.get(line.id)!;
    normalized.siteContext.houseWalls.forEach((wall) => {
      const panels = house.houseWallPanels.filter((panel) => panel.wallId === wall.id &&
        panel.baseElevation < beamVerticalRange.top - EPSILON &&
        panel.baseElevation + panel.height > beamVerticalRange.base + EPSILON);
      const postTop = conceptualSupportPostTop(projection.supportPosts[0].top, normalized.siteContext.gradeElevation);
      const overlappingPostIds = projection.supportPosts.filter((post) => house.houseWallPanels.some((panel) => panel.wallId === wall.id &&
        panel.baseElevation < postTop - EPSILON && panel.baseElevation + panel.height > normalized.siteContext.gradeElevation + EPSILON &&
        segmentCrossesConvexInterior(panel.start, panel.end, supportPostFootprint(post))))
        .map((post) => post.id).sort(compareGeometryIds);
      if (overlappingPostIds.length) warnings.push(Object.freeze({
        id: `beam-support-house-review-${line.id}-${wall.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, ...overlappingPostIds, wall.id]),
        message: `Support-post footprints crossing wall: ${overlappingPostIds.length}. Field review required; structural post placement may change.`,
      }));
      const crossedSegmentIds = projection.beams
        .filter((beam) => panels.some((panel) => segmentsCrossBeyondEndpointContact(beam.start, beam.end, panel.start, panel.end)))
        .map((beam) => beam.id)
        .sort(compareGeometryIds);
      if (!crossedSegmentIds.length) return;
      warnings.push(Object.freeze({
        id: `beam-house-plan-review-${line.id}-${wall.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, ...crossedSegmentIds, wall.id]),
        message: `Conceptual beam route (${line.id}) passes through recorded house-wall context (${wall.id}) where their displayed vertical ranges overlap; field-verify the intended framing and wall layout.`,
      }));
    });
  });
  platform.construction.stairSystems.forEach((system, systemIndex) => {
    const footprints = displayedStairRoutes[systemIndex].map((element) => element.c);
    normalized.siteContext.houseWalls.forEach((wall) => {
      if (warnings.some((warning) => warning.id === `stair-route-house-collision-${system.id}-${wall.id}`)) return;
      const panels = house.houseWallPanels.filter((panel) => panel.wallId === wall.id);
      if (!panels.length || !footprints.length) return;
      const clearance = Math.min(...panels.flatMap((panel) => footprints.map((footprint) => segmentToPolygonDistance(panel.start, panel.end, footprint))));
      if (clearance <= EPSILON || clearance >= 12 - EPSILON) return;
      const measured = roundedTenth(clearance);
      warnings.push(Object.freeze({
        id: `stair-house-clearance-${system.id}-${wall.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([system.id, wall.id]),
        message: `Stair system ${systemIndex + 1} passes ${measured} inches from a recorded house wall; verify the intended site clearance.`,
      }));
    });
  });
  platform.construction.framing.beamLines.forEach((line, lineIndex) => {
    platform.construction.framing.beamLines.slice(lineIndex + 1).forEach((otherLine, otherIndex) => {
      const clearance = Math.abs(otherLine.offsetFromOutside - line.offsetFromOutside);
      if (clearance >= 12 - EPSILON) return;
      const measured = roundedTenth(clearance);
      warnings.push(Object.freeze({
        id: `beam-line-clearance-${line.id}-${otherLine.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, otherLine.id]),
        message: `Conceptual beams ${lineIndex + 1} and ${lineIndex + otherIndex + 2} are ${measured} inches apart in plan; verify that both recorded beam routes are intended.`,
      }));
    });
  });
  platform.construction.framing.beamLines.forEach((line, lineIndex) => {
    const beams = beamProjectionByLineId.get(line.id)!.beams;
    beams.forEach((beam) => {
      const length = Math.hypot(beam.end.x - beam.start.x, beam.end.z - beam.start.z);
      if (length >= 12 - EPSILON) return;
      const measured = roundedTenth(length);
      warnings.push(Object.freeze({
        id: `beam-short-segment-${beam.id}`,
        severity: "clearance",
        geometryIds: Object.freeze([line.id, beam.id]),
        message: `Conceptual beam ${lineIndex + 1} has a ${measured}-inch projected segment; verify that the recorded beam route is intended.`,
      }));
    });
    platform.region.holes.forEach((hole, holeIndex) => {
      if (warnings.some((warning) => warning.id === `beam-cutout-interruption-${line.id}-${holeIndex + 1}`)) return;
      const clearance = beamToHoleDistance(beams, hole);
      if (clearance >= 12 - EPSILON) return;
      const measured = roundedTenth(clearance);
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
    const adjacent = adjacentJoistClearance(normalized, platformId, holeIndex, projectedJoists);
    if (!adjacent.ids.length) return;
    const measured = roundedTenth(adjacent.clearance);
    warnings.push(Object.freeze({
      id: `joist-cutout-clearance-${holeIndex + 1}`,
      severity: "clearance",
      geometryIds: Object.freeze([`${platform.id}:hole-${holeIndex + 1}`, ...adjacent.ids]),
      message: `Cutout ${holeIndex + 1} is ${measured} inches from ${adjacent.ids.length} adjacent conceptual joist path${adjacent.ids.length === 1 ? "" : "s"}; verify the intended framing clearance.`,
    }));
  });
  return Object.freeze(warnings.sort((left, right) => left.id.localeCompare(right.id)));
}
