import type { StairLandingConnectionV3, StairSystemV3 } from "./modelV3";
import type { PolygonEdge, PolygonPoint } from "./polygon";

export type StairPoint3V3 = Readonly<{ x: number; y: number; z: number }>;
export type StairTreadV3 = Readonly<{ id: string; x: number; z: number; y: number; width: number; depth: number; rise: number; rotationY: number; corners: readonly PolygonPoint[] }>;
export type StairLandingGeometryV3 = Readonly<{ id: string; systemId: string; afterRiser: number; position: "top" | "midway"; y: number; depth: number; width: number; center: PolygonPoint; rotationY: number; corners: readonly PolygonPoint[] }>;
export type StairPostV3 = Readonly<{ id: string; x: number; z: number; top: number }>;
export type StairRailPostV3 = Readonly<{ id: string; x: number; y: number; z: number; height: number }>;
export type StairRouteGeometryV3 = Readonly<{
  systemId: string;
  opening: Readonly<{ id: string; start: PolygonPoint; end: PolygonPoint }>;
  treads: readonly StairTreadV3[];
  stringers: readonly Readonly<{ id: string; start: StairPoint3V3; end: StairPoint3V3 }>[];
  rails: readonly Readonly<{ id: string; start: StairPoint3V3; end: StairPoint3V3 }>[];
  railPosts: readonly StairRailPostV3[];
  landings: readonly StairLandingGeometryV3[];
  landingRails: readonly Readonly<{ id: string; start: PolygonPoint; end: PolygonPoint; y: number }>[];
  landingRailPosts: readonly StairPostV3[];
  landingSupportPosts: readonly StairPostV3[];
  rise: number;
}>;

const point = (x: number, z: number): PolygonPoint => Object.freeze({ x, z });
const point3 = (x: number, y: number, z: number): StairPoint3V3 => Object.freeze({ x, y, z });
const rotate = (direction: PolygonPoint, turn: "straight" | "left" | "right"): PolygonPoint => turn === "left"
  ? point(direction.z, -direction.x)
  : turn === "right"
    ? point(-direction.z, direction.x)
    : direction;

export function deriveStairRouteGeometryV3(args: Readonly<{
  system: StairSystemV3;
  edge: PolygonEdge;
  platformElevation: number;
  gradeElevation: number;
  railingHeight: number;
  namespaceIds: boolean;
  targetPlatformElevations?: Readonly<Record<string, number>>;
}>): StairRouteGeometryV3 {
  const { system, edge, platformElevation, gradeElevation, railingHeight, namespaceIds, targetPlatformElevations = {} } = args;
  const edgeDx = (edge.end.x - edge.start.x) / edge.length;
  const edgeDz = (edge.end.z - edge.start.z) / edge.length;
  const onEdge = (distance: number) => point(edge.start.x + edgeDx * distance, edge.start.z + edgeDz * distance);
  const rise = platformElevation - gradeElevation;
  const totalRisers = Math.ceil(rise / system.maxRiserHeight);
  const actualRise = totalRisers > 0 ? rise / totalRisers : 0;
  const root = namespaceIds ? `${system.id}-` : "";
  const treads: StairTreadV3[] = [];
  const stringers: { id: string; start: StairPoint3V3; end: StairPoint3V3 }[] = [];
  const rails: { id: string; start: StairPoint3V3; end: StairPoint3V3 }[] = [];
  const landings: StairLandingGeometryV3[] = [];
  const landingRails: { id: string; start: PolygonPoint; end: PolygonPoint; y: number }[] = [];
  const landingRailPosts: StairPostV3[] = [];
  const landingSupportPosts: StairPostV3[] = [];
  let origin = onEdge(system.offset + system.width / 2);
  let direction = edge.outward;
  let startElevation = platformElevation;
  let completedRisers = 0;
  let flightIndex = 0;

  const addConnectedFlight = (connection: StairLandingConnectionV3, branchOrigin: PolygonPoint, branchDirection: PolygonPoint, landingElevation: number, afterRiser: number) => {
    const targetElevation = connection.destination === "grade" ? gradeElevation : connection.targetPlatformId ? targetPlatformElevations[connection.targetPlatformId] : platformElevation;
    if (targetElevation === undefined) throw new RangeError(`Destination platform ${connection.targetPlatformId} has no recorded elevation.`);
    const connectionRise = targetElevation - landingElevation;
    const count = Math.ceil(Math.abs(connectionRise) / system.maxRiserHeight);
    if (count <= 0) return;
    const widthDirection = point(-branchDirection.z, branchDirection.x);
    const flightRun = count * connection.treadDepth;
    const endElevation = targetElevation;
    const actualConnectionRise = connectionRise / count;
    for (let index = 0; index < count; index += 1) {
      const center = point(branchOrigin.x + branchDirection.x * connection.treadDepth * (index + .5), branchOrigin.z + branchDirection.z * connection.treadDepth * (index + .5));
      const alongX = widthDirection.x * connection.width / 2;
      const alongZ = widthDirection.z * connection.width / 2;
      const outX = branchDirection.x * connection.treadDepth / 2;
      const outZ = branchDirection.z * connection.treadDepth / 2;
      treads.push(Object.freeze({ id: `${root}${connection.id}-tread-${index + 1}`, x: center.x, z: center.z, y: landingElevation + actualConnectionRise * (index + 1), width: connection.width, depth: connection.treadDepth, rise: Math.abs(actualConnectionRise), rotationY: -Math.atan2(widthDirection.z, widthDirection.x), corners: Object.freeze([
        point(center.x - alongX - outX, center.z - alongZ - outZ), point(center.x + alongX - outX, center.z + alongZ - outZ),
        point(center.x + alongX + outX, center.z + alongZ + outZ), point(center.x - alongX + outX, center.z - alongZ + outZ),
      ]) }));
    }
    const stringerSide = Math.max(0, connection.width / 2 - .75);
    const railSide = Math.max(0, connection.width / 2 - 2);
    for (const [sideIndex, side] of [-1, 1].entries()) {
      stringers.push(Object.freeze({ id: `${root}${connection.id}-stringer-${sideIndex + 1}`, start: point3(branchOrigin.x + widthDirection.x * stringerSide * side, landingElevation, branchOrigin.z + widthDirection.z * stringerSide * side), end: point3(branchOrigin.x + widthDirection.x * stringerSide * side + branchDirection.x * flightRun, endElevation, branchOrigin.z + widthDirection.z * stringerSide * side + branchDirection.z * flightRun) }));
      rails.push(Object.freeze({ id: `${root}${connection.id}-rail-${sideIndex + 1}`, start: point3(branchOrigin.x + widthDirection.x * railSide * side, landingElevation + railingHeight - 2, branchOrigin.z + widthDirection.z * railSide * side), end: point3(branchOrigin.x + widthDirection.x * railSide * side + branchDirection.x * flightRun, endElevation + railingHeight - 2, branchOrigin.z + widthDirection.z * railSide * side + branchDirection.z * flightRun) }));
    }
  };

  const addFlight = (count: number, nextElevation: number) => {
    if (count <= 0) return;
    flightIndex += 1;
    const widthDirection = point(-direction.z, direction.x);
    const legacyFlightName = !namespaceIds && system.landings.length <= 1
      ? system.landings[0]?.afterRiser && flightIndex === 1 ? "upper" : system.landings[0]?.afterRiser ? "lower" : ""
      : `flight-${flightIndex}`;
    for (let index = 0; index < count; index += 1) {
      const globalIndex = completedRisers + index;
      const center = point(origin.x + direction.x * system.treadDepth * (index + .5), origin.z + direction.z * system.treadDepth * (index + .5));
      const alongX = widthDirection.x * system.width / 2;
      const alongZ = widthDirection.z * system.width / 2;
      const outX = direction.x * system.treadDepth / 2;
      const outZ = direction.z * system.treadDepth / 2;
      treads.push(Object.freeze({ id: `${root}stair-tread-${globalIndex + 1}`, x: center.x, z: center.z, y: Math.max(gradeElevation, startElevation - actualRise * (index + 1)), width: system.width, depth: system.treadDepth, rise: actualRise, rotationY: -Math.atan2(widthDirection.z, widthDirection.x), corners: Object.freeze([
        point(center.x - alongX - outX, center.z - alongZ - outZ), point(center.x + alongX - outX, center.z + alongZ - outZ),
        point(center.x + alongX + outX, center.z + alongZ + outZ), point(center.x - alongX + outX, center.z - alongZ + outZ),
      ]) }));
    }
    const stringerSide = Math.max(0, system.width / 2 - .75);
    const railSide = Math.max(0, system.width / 2 - 2);
    const flightRun = count * system.treadDepth;
    const legacyStringerPrefix = legacyFlightName ? `stair-stringer-${legacyFlightName}` : "stair-stringer";
    const legacyRailPrefix = legacyFlightName ? `stair-rail-${legacyFlightName}` : "stair-rail-side";
    for (const [sideIndex, side] of [-1, 1].entries()) {
      stringers.push(Object.freeze({ id: `${root}${namespaceIds || system.landings.length > 1 ? `stair-stringer-${legacyFlightName}` : legacyStringerPrefix}-${sideIndex + 1}`, start: point3(origin.x + widthDirection.x * stringerSide * side, startElevation, origin.z + widthDirection.z * stringerSide * side), end: point3(origin.x + widthDirection.x * stringerSide * side + direction.x * flightRun, nextElevation, origin.z + widthDirection.z * stringerSide * side + direction.z * flightRun) }));
      rails.push(Object.freeze({ id: `${root}${namespaceIds || system.landings.length > 1 ? `stair-rail-${legacyFlightName}` : legacyRailPrefix}-${sideIndex + 1}`, start: point3(origin.x + widthDirection.x * railSide * side, startElevation + railingHeight - 2, origin.z + widthDirection.z * railSide * side), end: point3(origin.x + widthDirection.x * railSide * side + direction.x * flightRun, nextElevation + railingHeight - 2, origin.z + widthDirection.z * railSide * side + direction.z * flightRun) }));
    }
    origin = point(origin.x + direction.x * flightRun, origin.z + direction.z * flightRun);
    startElevation = nextElevation;
    completedRisers += count;
  };

  for (const [landingIndex, landing] of system.landings.entries()) {
    const flightRisers = landing.afterRiser - completedRisers;
    const landingElevation = platformElevation - landing.afterRiser * actualRise;
    addFlight(flightRisers, landingElevation);
    const widthDirection = point(-direction.z, direction.x);
    const center = point(origin.x + direction.x * landing.depth / 2, origin.z + direction.z * landing.depth / 2);
    const alongX = widthDirection.x * landing.width / 2;
    const alongZ = widthDirection.z * landing.width / 2;
    const outX = direction.x * landing.depth / 2;
    const outZ = direction.z * landing.depth / 2;
    const corners = Object.freeze([
      point(center.x - alongX - outX, center.z - alongZ - outZ), point(center.x + alongX - outX, center.z + alongZ - outZ),
      point(center.x + alongX + outX, center.z + alongZ + outZ), point(center.x - alongX + outX, center.z - alongZ + outZ),
    ]);
    const landingId = !namespaceIds && landingIndex === 0 ? "stair-landing" : `${root}stair-landing-${landingIndex + 1}`;
    landings.push(Object.freeze({ id: landingId, systemId: system.id, afterRiser: landing.afterRiser, position: landing.afterRiser === 0 ? "top" : "midway", y: landingElevation, depth: landing.depth, width: landing.width, center, rotationY: -Math.atan2(widthDirection.z, widthDirection.x), corners }));
    const railPrefix = !namespaceIds && landingIndex === 0 ? "landing-rail" : `${landingId}-rail`;
    const openDirections = new Set([landing.turn, ...landing.connections.map((connection) => connection.direction)]);
    const segments = [
      ...(!openDirections.has("left") ? [{ id: `${railPrefix}-left`, start: corners[0], end: corners[3], y: landingElevation }] : []),
      ...(!openDirections.has("right") ? [{ id: `${railPrefix}-right`, start: corners[1], end: corners[2], y: landingElevation }] : []),
      ...(!openDirections.has("straight") ? [{ id: `${railPrefix}-outer`, start: corners[3], end: corners[2], y: landingElevation }] : []),
    ].map((segment) => Object.freeze(segment));
    landingRails.push(...segments);
    const railPoints = new Map<string, PolygonPoint>();
    for (const segment of segments) for (const corner of [segment.start, segment.end]) railPoints.set(`${corner.x}:${corner.z}`, corner);
    const points = landing.connections.length === 0 && landing.turn === "straight" ? corners : [...railPoints.values()];
    points.forEach((corner, index) => landingRailPosts.push(Object.freeze({ id: !namespaceIds && landingIndex === 0 ? `landing-rail-post-${index + 1}` : `${landingId}-rail-post-${index + 1}`, x: corner.x, z: corner.z, top: landingElevation + railingHeight })));
    [corners[2], corners[3]].forEach((corner, index) => landingSupportPosts.push(Object.freeze({ id: !namespaceIds && landingIndex === 0 ? `landing-support-post-${index + 1}` : `${landingId}-support-post-${index + 1}`, x: corner.x, z: corner.z, top: landingElevation - 5.5 })));
    for (const connection of landing.connections) {
      const branchDirection = rotate(direction, connection.direction);
      const branchOrigin = connection.direction === "straight"
        ? point(center.x + direction.x * landing.depth / 2, center.z + direction.z * landing.depth / 2)
        : point(center.x + branchDirection.x * landing.width / 2, center.z + branchDirection.z * landing.width / 2);
      addConnectedFlight(connection, branchOrigin, branchDirection, landingElevation, landing.afterRiser);
    }
    const nextDirection = rotate(direction, landing.turn);
    origin = landing.turn === "straight"
      ? point(origin.x + direction.x * landing.depth, origin.z + direction.z * landing.depth)
      : point(center.x + nextDirection.x * landing.width / 2, center.z + nextDirection.z * landing.width / 2);
    direction = nextDirection;
    startElevation = landingElevation;
  }
  addFlight(totalRisers - completedRisers, gradeElevation);
  const railPosts = Object.freeze(rails.flatMap((segment, index) => [
    Object.freeze({ id: `${segment.id}-post-start`, x: segment.start.x, y: segment.start.y - railingHeight + 2, z: segment.start.z, height: railingHeight }),
    Object.freeze({ id: `${segment.id}-post-end`, x: segment.end.x, y: segment.end.y - railingHeight + 2, z: segment.end.z, height: railingHeight }),
  ]));
  return Object.freeze({
    systemId: system.id,
    opening: Object.freeze({ id: `${root}stair-opening`, start: onEdge(system.offset), end: onEdge(system.offset + system.width) }),
    treads: Object.freeze(treads), stringers: Object.freeze(stringers), rails: Object.freeze(rails), railPosts,
    landings: Object.freeze(landings), landingRails: Object.freeze(landingRails), landingRailPosts: Object.freeze(landingRailPosts), landingSupportPosts: Object.freeze(landingSupportPosts), rise,
  });
}
