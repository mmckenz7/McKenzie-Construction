import { deriveGeometricPolygonEdges, polygonContainsPoint, signedPolygonArea, type PolygonPoint } from "./polygon";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { deriveStairRouteGeometryV3 } from "./stairRouteGeometryV3";
import { deriveHouseContextGeometry } from "./houseContextGeometry";
import { effectiveBeamInsetV3 } from "./framingEditorV3";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt } from "./polygonRegion";
import { triangulatePolygon, type PolygonTriangle } from "./polygonProjection";

export type GeometryWarningV3 = Readonly<{
  id: string;
  severity: "collision" | "clearance";
  geometryIds: readonly string[];
  message: string;
}>;

const EPSILON = .01;

function orientation(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function axes(points: readonly PolygonPoint[]): readonly PolygonPoint[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next.x - point.x, dz = next.z - point.z;
    const length = Math.hypot(dx, dz);
    return Object.freeze({ x: -dz / length, z: dx / length });
  });
}

export function convexPolygonsOverlap(first: readonly PolygonPoint[], second: readonly PolygonPoint[]): boolean {
  return [...axes(first), ...axes(second)].every((axis) => {
    const firstProjection = first.map((point) => point.x * axis.x + point.z * axis.z);
    const secondProjection = second.map((point) => point.x * axis.x + point.z * axis.z);
    return Math.min(...firstProjection) < Math.max(...secondProjection) - EPSILON &&
      Math.min(...secondProjection) < Math.max(...firstProjection) - EPSILON;
  });
}

function pointSegmentDistance(point: PolygonPoint, start: PolygonPoint, end: PolygonPoint): number {
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.z - (start.z + ratio * dz));
}

function ringDistance(first: readonly PolygonPoint[], second: readonly PolygonPoint[]): number {
  const distances: number[] = [];
  for (const point of first) for (let index = 0; index < second.length; index += 1) distances.push(pointSegmentDistance(point, second[index], second[(index + 1) % second.length]));
  for (const point of second) for (let index = 0; index < first.length; index += 1) distances.push(pointSegmentDistance(point, first[index], first[(index + 1) % first.length]));
  return Math.min(...distances);
}

function pointInsideConvex(points: readonly PolygonPoint[], point: PolygonPoint): boolean {
  return axes(points).every((axis) => {
    const projections = points.map((candidate) => candidate.x * axis.x + candidate.z * axis.z);
    const value = point.x * axis.x + point.z * axis.z;
    return value > Math.min(...projections) + EPSILON && value < Math.max(...projections) - EPSILON;
  });
}

export function segmentCrossesConvexInterior(start: PolygonPoint, end: PolygonPoint, polygon: readonly PolygonPoint[]): boolean {
  if (pointInsideConvex(polygon, start) || pointInsideConvex(polygon, end)) return true;
  const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
  const signed = polygon.map((point) => ((point.x - start.x) * -dz + (point.z - start.z) * dx) / length);
  if (!(Math.min(...signed) < -EPSILON && Math.max(...signed) > EPSILON)) return false;
  const along = polygon.map((point) => ((point.x - start.x) * dx + (point.z - start.z) * dz) / length);
  return Math.min(...along) < length - EPSILON && Math.max(...along) > EPSILON;
}

function segmentIntersectionParameters(start: PolygonPoint, end: PolygonPoint, ring: readonly PolygonPoint[]): readonly number[] {
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const parameters: number[] = [];
  ring.forEach((edgeStart, edgeIndex) => {
    const edgeEnd = ring[(edgeIndex + 1) % ring.length];
    const edgeDx = edgeEnd.x - edgeStart.x, edgeDz = edgeEnd.z - edgeStart.z;
    const relativeX = edgeStart.x - start.x, relativeZ = edgeStart.z - start.z;
    const denominator = dx * edgeDz - dz * edgeDx;
    if (Math.abs(denominator) > EPSILON) {
      const alongSegment = (relativeX * edgeDz - relativeZ * edgeDx) / denominator;
      const alongEdge = (relativeX * dz - relativeZ * dx) / denominator;
      if (alongSegment >= -EPSILON && alongSegment <= 1 + EPSILON && alongEdge >= -EPSILON && alongEdge <= 1 + EPSILON) {
        parameters.push(Math.max(0, Math.min(1, alongSegment)));
      }
      return;
    }
    if (Math.abs(relativeX * dz - relativeZ * dx) > EPSILON || lengthSquared <= EPSILON) return;
    parameters.push(
      Math.max(0, Math.min(1, (relativeX * dx + relativeZ * dz) / lengthSquared)),
      Math.max(0, Math.min(1, ((edgeEnd.x - start.x) * dx + (edgeEnd.z - start.z) * dz) / lengthSquared)),
    );
  });
  return parameters;
}

function pointOnRingBoundary(point: PolygonPoint, ring: readonly PolygonPoint[]): boolean {
  return ring.some((start, index) => pointSegmentDistance(point, start, ring[(index + 1) % ring.length]) <= EPSILON);
}

function segmentRegionInteriorLength(
  start: PolygonPoint,
  end: PolygonPoint,
  outer: readonly PolygonPoint[],
  holes: readonly (readonly PolygonPoint[])[],
): number {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  if (length <= EPSILON) return 0;
  const parameters = [0, 1, ...segmentIntersectionParameters(start, end, outer), ...holes.flatMap((hole) => segmentIntersectionParameters(start, end, hole))]
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > EPSILON / length);
  return parameters.slice(0, -1).reduce((total, parameter, index) => {
    const next = parameters[index + 1];
    if ((next - parameter) * length <= EPSILON) return total;
    const midpoint = (parameter + next) / 2;
    const point = { x: start.x + (end.x - start.x) * midpoint, z: start.z + (end.z - start.z) * midpoint };
    if (pointOnRingBoundary(point, outer) || holes.some((hole) => pointOnRingBoundary(point, hole))) return total;
    return polygonContainsPoint(outer, point) && !holes.some((hole) => polygonContainsPoint(hole, point))
      ? total + (next - parameter) * length
      : total;
  }, 0);
}

function lineIntersection(start: PolygonPoint, end: PolygonPoint, clipStart: PolygonPoint, clipEnd: PolygonPoint): PolygonPoint {
  const dx = end.x - start.x, dz = end.z - start.z;
  const clipDx = clipEnd.x - clipStart.x, clipDz = clipEnd.z - clipStart.z;
  const denominator = dx * clipDz - dz * clipDx;
  if (Math.abs(denominator) <= EPSILON) return end;
  const ratio = ((clipStart.x - start.x) * clipDz - (clipStart.z - start.z) * clipDx) / denominator;
  return Object.freeze({ x: start.x + ratio * dx, z: start.z + ratio * dz });
}

function convexIntersectionArea(subject: readonly PolygonPoint[], clip: readonly PolygonPoint[]): number {
  let output = [...subject];
  for (let index = 0; index < clip.length && output.length > 0; index += 1) {
    const clipStart = clip[index], clipEnd = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    input.forEach((point, pointIndex) => {
      const previous = input[(pointIndex - 1 + input.length) % input.length];
      const pointInside = orientation(clipStart, clipEnd, point) >= -EPSILON;
      const previousInside = orientation(clipStart, clipEnd, previous) >= -EPSILON;
      if (pointInside !== previousInside) output.push(lineIntersection(previous, point, clipStart, clipEnd));
      if (pointInside) output.push(point);
    });
  }
  return output.length >= 3 ? Math.abs(signedPolygonArea(output)) : 0;
}

function normalizedPositiveFootprint(footprint: readonly PolygonPoint[]): readonly PolygonPoint[] {
  if (footprint.length < 3 || footprint.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) {
    throw new RangeError("A route footprint requires at least three finite points.");
  }
  const footprintArea = signedPolygonArea(footprint);
  if (Math.abs(footprintArea) <= EPSILON) throw new RangeError("A route footprint must enclose positive area without intersecting itself.");
  return footprintArea > 0 ? footprint : [...footprint].reverse();
}

function positiveTriangulatedRegionOverlapArea(
  footprint: readonly PolygonPoint[],
  outerTriangles: readonly PolygonTriangle[],
  holeTriangles: readonly PolygonTriangle[],
): number {
  const normalizedFootprint = normalizedPositiveFootprint(footprint);
  const outerArea = outerTriangles.reduce((sum, triangle) => sum + convexIntersectionArea(normalizedFootprint, triangle.points), 0);
  const holeArea = holeTriangles.reduce((sum, triangle) => sum + convexIntersectionArea(normalizedFootprint, triangle.points), 0);
  return Math.max(0, outerArea - holeArea);
}

export function positiveRegionOverlapArea(footprint: readonly PolygonPoint[], outer: readonly PolygonPoint[], holes: readonly (readonly PolygonPoint[])[]): number {
  return positiveTriangulatedRegionOverlapArea(
    footprint,
    triangulatePolygon(outer),
    holes.flatMap((hole) => triangulatePolygon(hole)),
  );
}

export function deriveGeometryWarningsV3(design: DeckDesignV3, platformId: string): readonly GeometryWarningV3[] {
  const normalized = normalizeDeckDesignV3(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const routes = platform.construction.stairSystems.map((system, index) => deriveStairRouteGeometryV3({
    system,
    edge: edges.find((edge) => edge.id === system.edgeId)!,
    platformElevation: platform.elevation,
    gradeElevation: normalized.siteContext.gradeElevation,
    railingHeight: platform.construction.railing.height,
    namespaceIds: platform.construction.stairSystems.length > 1 || index > 0,
    targetPlatformElevations: Object.fromEntries(normalized.platforms.map((item) => [item.id, item.elevation])),
  }));
  const house = deriveHouseContextGeometry(normalized.siteContext);
  const warnings: GeometryWarningV3[] = [];
  const platformOuterTriangles = routes.length > 0 ? triangulatePolygon(platform.region.outer) : [];
  const platformHoleTriangles = routes.length > 0 ? platform.region.holes.flatMap((hole) => triangulatePolygon(hole)) : [];
  const horizontalBeam = platform.construction.decking.direction === "left_right";
  const axisMaximum = Math.max(...platform.region.outer.map((point) => horizontalBeam ? point.z : point.x));
  const beamCoordinate = axisMaximum - effectiveBeamInsetV3(platform);
  platform.region.holes.forEach((hole, holeIndex) => {
    const holeRegion = { outer: hole, holes: [] };
    const crossingIntervals = horizontalBeam ? horizontalRegionIntervalsAt(holeRegion, beamCoordinate) : verticalRegionIntervalsAt(holeRegion, beamCoordinate);
    if (crossingIntervals.length > 0) warnings.push(Object.freeze({
      id: `beam-cutout-interruption-${holeIndex + 1}`,
      severity: "clearance" as const,
      geometryIds: Object.freeze([`beam`, `${platform.id}:hole-${holeIndex + 1}`]),
      message: `Conceptual beam crosses cutout ${holeIndex + 1} and is split into separate spans; verify the intended framing route.`,
    }));
  });
  normalized.siteContext.houseWalls.forEach((wall) => {
    const crossingLength = house.houseWallPanels
      .filter((panel) => panel.wallId === wall.id &&
        panel.baseElevation < platform.elevation - EPSILON &&
        panel.baseElevation + panel.height > platform.elevation + EPSILON)
      .reduce((total, panel) => total + segmentRegionInteriorLength(panel.start, panel.end, platform.region.outer, platform.region.holes), 0);
    if (crossingLength <= EPSILON) return;
    const measured = Math.round(crossingLength * 10) / 10;
    warnings.push(Object.freeze({
      id: `platform-house-plan-review-${platform.id}-${wall.id}`,
      severity: "clearance" as const,
      geometryIds: Object.freeze([platform.id, wall.id]),
      message: `Recorded plan context for house wall (${wall.id}) passes ${measured} inches through the deck surface projection where its recorded vertical span includes that elevation; field-verify the wall elevation and intended layout.`,
    }));
  });
  routes.forEach((route, routeIndex) => {
    const footprints = [...route.treads.map((tread) => ({ id: tread.id, center: { x: tread.x, z: tread.z }, corners: tread.corners })), ...route.landings.map((landing) => ({ id: landing.id, center: landing.center, corners: landing.corners }))];
    const entersDeck = footprints.some((part) => positiveTriangulatedRegionOverlapArea(part.corners, platformOuterTriangles, platformHoleTriangles) > EPSILON);
    if (entersDeck) warnings.push(Object.freeze({
      id: `stair-route-deck-collision-${route.systemId}`,
      severity: "collision" as const,
      geometryIds: Object.freeze([route.systemId, `${platform.id}:outer`]),
      message: `Stair system ${routeIndex + 1} passes back through the deck footprint in plan. Move or reroute it before continuing.`,
    }));
    const crossedWallIds = new Set(house.houseWallPanels
      .filter((panel) => footprints.some((part) => segmentCrossesConvexInterior(panel.start, panel.end, part.corners)))
      .map((panel) => panel.wallId));
    normalized.siteContext.houseWalls.filter((wall) => crossedWallIds.has(wall.id)).forEach((wall) => warnings.push(Object.freeze({
      id: `stair-route-house-collision-${route.systemId}-${wall.id}`,
      severity: "collision" as const,
      geometryIds: Object.freeze([route.systemId, wall.id]),
      message: `Stair system ${routeIndex + 1} crosses a recorded house wall (${wall.id}) in plan. Move or reroute it before continuing.`,
    })));
  });
  for (let firstIndex = 0; firstIndex < routes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < routes.length; secondIndex += 1) {
      const first = routes[firstIndex], second = routes[secondIndex];
      const firstFootprints = [...first.treads.map((tread) => ({ id: tread.id, corners: tread.corners })), ...first.landings.map((landing) => ({ id: landing.id, corners: landing.corners }))];
      const secondFootprints = [...second.treads.map((tread) => ({ id: tread.id, corners: tread.corners })), ...second.landings.map((landing) => ({ id: landing.id, corners: landing.corners }))];
      const collision = firstFootprints.find((firstPart) => secondFootprints.some((secondPart) => convexPolygonsOverlap(firstPart.corners, secondPart.corners)));
      if (collision) warnings.push(Object.freeze({
        id: `stair-route-collision-${first.systemId}-${second.systemId}`,
        severity: "collision" as const,
        geometryIds: Object.freeze([first.systemId, second.systemId]),
        message: `Stair systems ${firstIndex + 1} and ${secondIndex + 1} overlap in plan. Move or reroute one before continuing.`,
      }));
    }
  }
  platform.region.holes.forEach((hole, holeIndex) => {
    const outerClearance = ringDistance(hole, platform.region.outer);
    if (outerClearance < 12 - EPSILON) warnings.push(Object.freeze({
      id: `cutout-edge-clearance-${holeIndex + 1}`,
      severity: "clearance" as const,
      geometryIds: Object.freeze([`${platform.id}:hole-${holeIndex + 1}`, `${platform.id}:outer`]),
      message: `Cutout ${holeIndex + 1} is ${Math.round(outerClearance * 10) / 10} inches from the deck edge; verify the intended clearance.`,
    }));
    for (let otherIndex = holeIndex + 1; otherIndex < platform.region.holes.length; otherIndex += 1) {
      const clearance = ringDistance(hole, platform.region.holes[otherIndex]);
      if (clearance < 12 - EPSILON) warnings.push(Object.freeze({
        id: `cutout-clearance-${holeIndex + 1}-${otherIndex + 1}`,
        severity: "clearance" as const,
        geometryIds: Object.freeze([`${platform.id}:hole-${holeIndex + 1}`, `${platform.id}:hole-${otherIndex + 1}`]),
        message: `Cutouts ${holeIndex + 1} and ${otherIndex + 1} are ${Math.round(clearance * 10) / 10} inches apart; verify the intended clearance.`,
      }));
    }
  });
  return Object.freeze(warnings.sort((left, right) => left.id.localeCompare(right.id)));
}
