import { deriveGeometricPolygonEdges, polygonContainsPoint, type PolygonPoint } from "./polygon";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { deriveStairRouteGeometryV3 } from "./stairRouteGeometryV3";
import { deriveHouseContextGeometry } from "./houseContextGeometry";

export type GeometryWarningV3 = Readonly<{
  id: string;
  severity: "collision" | "clearance";
  geometryIds: readonly string[];
  message: string;
}>;

const EPSILON = .01;

function axes(points: readonly PolygonPoint[]): readonly PolygonPoint[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next.x - point.x, dz = next.z - point.z;
    const length = Math.hypot(dx, dz);
    return Object.freeze({ x: -dz / length, z: dx / length });
  });
}

function convexPolygonsOverlap(first: readonly PolygonPoint[], second: readonly PolygonPoint[]): boolean {
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

function segmentCrossesConvexInterior(start: PolygonPoint, end: PolygonPoint, polygon: readonly PolygonPoint[]): boolean {
  if (pointInsideConvex(polygon, start) || pointInsideConvex(polygon, end)) return true;
  const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
  const signed = polygon.map((point) => ((point.x - start.x) * -dz + (point.z - start.z) * dx) / length);
  if (!(Math.min(...signed) < -EPSILON && Math.max(...signed) > EPSILON)) return false;
  const along = polygon.map((point) => ((point.x - start.x) * dx + (point.z - start.z) * dz) / length);
  return Math.min(...along) < length - EPSILON && Math.max(...along) > EPSILON;
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
  routes.forEach((route, routeIndex) => {
    const footprints = [...route.treads.map((tread) => ({ id: tread.id, center: { x: tread.x, z: tread.z }, corners: tread.corners })), ...route.landings.map((landing) => ({ id: landing.id, center: landing.center, corners: landing.corners }))];
    const entersDeck = footprints.some((part) => [part.center, ...part.corners, ...part.corners.map((point, index) => ({ x: (point.x + part.corners[(index + 1) % part.corners.length].x) / 2, z: (point.z + part.corners[(index + 1) % part.corners.length].z) / 2 }))].some((point) => polygonContainsPoint(platform.region.outer, point) && !platform.region.holes.some((hole) => polygonContainsPoint(hole, point))));
    if (entersDeck) warnings.push(Object.freeze({
      id: `stair-route-deck-collision-${route.systemId}`,
      severity: "collision" as const,
      geometryIds: Object.freeze([route.systemId, `${platform.id}:outer`]),
      message: `Stair system ${routeIndex + 1} passes back through the deck footprint in plan. Move or reroute it before continuing.`,
    }));
    const housePanel = house.houseWallPanels.find((panel) => footprints.some((part) => segmentCrossesConvexInterior(panel.start, panel.end, part.corners)));
    if (housePanel) warnings.push(Object.freeze({
      id: `stair-route-house-collision-${route.systemId}-${housePanel.wallId}`,
      severity: "collision" as const,
      geometryIds: Object.freeze([route.systemId, housePanel.wallId]),
      message: `Stair system ${routeIndex + 1} crosses the recorded house wall in plan. Move or reroute it before continuing.`,
    }));
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
