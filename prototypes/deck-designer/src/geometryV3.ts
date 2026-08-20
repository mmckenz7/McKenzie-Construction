import { deriveGeometricPolygonEdges, type PolygonEdge, type PolygonPoint } from "./polygon";
import { derivePolygonMembers, type ProjectedMember } from "./polygonProjection";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";

type Point3 = Readonly<{ x: number; y: number; z: number }>;
type Post = Readonly<{ id: string; x: number; z: number; top: number }>;
type StairRailPostV3 = Readonly<{ id: string; x: number; y: number; z: number; height: number }>;
type StairRailSegmentV3 = Readonly<{ id: string; start: Point3; end: Point3 }>;
type RailSegmentV3 = ProjectedMember & Readonly<{ edgeId: string }>;
type StairTreadV3 = Readonly<{
  id: string;
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
  rise: number;
  rotationY: number;
  corners: readonly PolygonPoint[];
}>;
type LandingV3 = Readonly<{
  id: "stair-landing";
  position: "top" | "midway";
  y: number;
  depth: number;
  width: number;
  center: PolygonPoint;
  rotationY: number;
  corners: readonly PolygonPoint[];
}>;

export type DeckPlatformGeometryV3 = Readonly<{
  platformId: string;
  footprint: readonly PolygonPoint[];
  platformEdges: readonly PolygonEdge[];
  surfaceBoards: readonly ProjectedMember[];
  joists: readonly ProjectedMember[];
  railSegments: readonly RailSegmentV3[];
  railPosts: readonly Post[];
  stairOpening: ProjectedMember | null;
  stairTreads: readonly StairTreadV3[];
  stairStringers: readonly Readonly<{ id: string; start: Point3; end: Point3 }>[];
  stairRailSegments: readonly StairRailSegmentV3[];
  stairRailPosts: readonly StairRailPostV3[];
  stairRise: number;
  landing: LandingV3 | null;
  landingRailSegments: readonly ProjectedMember[];
  landingRailPosts: readonly Post[];
  landingSupportPosts: readonly Post[];
}>;

const point = (x: number, z: number): PolygonPoint => Object.freeze({ x, z });
const point3 = (x: number, y: number, z: number): Point3 => Object.freeze({ x, y, z });

function evenlySpacedPositions(length: number, maximumSpacing: number): readonly number[] {
  const bays = Math.max(1, Math.ceil(length / maximumSpacing));
  return Object.freeze(Array.from({ length: bays + 1 }, (_, index) => (length * index) / bays));
}

export function derivePlatformGeometryV3(design: DeckDesignV3, platformId: string): DeckPlatformGeometryV3 {
  const normalized = normalizeDeckDesignV3(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const members = derivePolygonMembers(platform.region, {
    boardWidth: platform.construction.decking.boardWidth,
    gap: platform.construction.decking.gap,
    joistSpacing: platform.construction.framing.joistSpacing,
  });
  const stair = platform.construction.stairs;
  const stairEdge = edges.find((edge) => edge.id === stair.edgeId)!;
  const stairDx = (stairEdge.end.x - stairEdge.start.x) / stairEdge.length;
  const stairDz = (stairEdge.end.z - stairEdge.start.z) / stairEdge.length;
  const positionOnEdge = (distance: number): PolygonPoint => point(
    stairEdge.start.x + stairDx * distance,
    stairEdge.start.z + stairDz * distance,
  );
  const railSegments = Object.freeze(edges
    .filter((edge) => platform.construction.railing.enabledEdgeIds.includes(edge.id))
    .flatMap<RailSegmentV3>((edge) => {
      if (!stair.enabled || edge.id !== stair.edgeId) {
        return [Object.freeze({ id: `rail-${edge.id}`, start: edge.start, end: edge.end, edgeId: edge.id })];
      }
      return [
        ...(stair.offset > 0 ? [Object.freeze({
          id: `rail-${edge.id}-before-stair`, start: edge.start, end: positionOnEdge(stair.offset), edgeId: edge.id,
        })] : []),
        ...(stair.offset + stair.width < edge.length ? [Object.freeze({
          id: `rail-${edge.id}-after-stair`, start: positionOnEdge(stair.offset + stair.width), end: edge.end, edgeId: edge.id,
        })] : []),
      ];
    }));
  const railPostMap = new Map<string, Post>();
  for (const segment of railSegments) {
    const segmentLength = Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z);
    for (const distance of evenlySpacedPositions(segmentLength, platform.construction.framing.maxPostSpacing)) {
      const ratio = segmentLength === 0 ? 0 : distance / segmentLength;
      const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
      const z = segment.start.z + (segment.end.z - segment.start.z) * ratio;
      const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
      railPostMap.set(key, Object.freeze({
        id: `rail-post-${key}`,
        x,
        z,
        top: platform.elevation + platform.construction.railing.height,
      }));
    }
  }
  const gradeElevation = normalized.siteContext.gradeElevation;
  const stairRise = platform.elevation - gradeElevation;
  const riserCount = stair.enabled ? Math.ceil(stairRise / stair.maxRiserHeight) : 0;
  const actualRise = riserCount > 0 ? stairRise / riserCount : 0;
  const stairCenterOnEdge = positionOnEdge(stair.offset + stair.width / 2);
  const turn = stair.landingEnabled ? stair.landingTurn : "straight";
  const landingPosition = stair.landingEnabled ? stair.landingPosition : "top";
  const upperRiserCount = landingPosition === "midway" ? stair.upperFlightRisers : 0;
  const lowerRiserCount = riserCount - upperRiserCount;
  const upperRun = upperRiserCount * stair.treadDepth;
  const landingElevation = platform.elevation - upperRiserCount * actualRise;
  const upperDirection = stairEdge.outward;
  const upperWidthDirection = point(-upperDirection.z, upperDirection.x);
  const lowerDirection = turn === "left"
    ? point(stairEdge.outward.z, -stairEdge.outward.x)
    : turn === "right"
      ? point(-stairEdge.outward.z, stairEdge.outward.x)
      : stairEdge.outward;
  const lowerWidthDirection = point(-lowerDirection.z, lowerDirection.x);
  const landingNearCenter = point(
    stairCenterOnEdge.x + upperDirection.x * upperRun,
    stairCenterOnEdge.z + upperDirection.z * upperRun,
  );
  const landingCenter = point(
    landingNearCenter.x + upperDirection.x * stair.landingDepth / 2,
    landingNearCenter.z + upperDirection.z * stair.landingDepth / 2,
  );
  const lowerRunOrigin = !stair.landingEnabled
    ? stairCenterOnEdge
    : turn === "straight"
    ? point(
        landingNearCenter.x + upperDirection.x * stair.landingDepth,
        landingNearCenter.z + upperDirection.z * stair.landingDepth,
      )
    : point(
        landingCenter.x + lowerDirection.x * stair.width / 2,
        landingCenter.z + lowerDirection.z * stair.width / 2,
      );
  const landingRotationY = -Math.atan2(stairDz, stairDx);
  const flightTreads = (
    count: number,
    origin: PolygonPoint,
    direction: PolygonPoint,
    widthDirection: PolygonPoint,
    startElevation: number,
    startIndex: number,
  ): readonly StairTreadV3[] => Object.freeze(Array.from({ length: count }, (_, index) => {
    const center = point(origin.x + direction.x * stair.treadDepth * (index + 0.5), origin.z + direction.z * stair.treadDepth * (index + 0.5));
    const alongX = widthDirection.x * stair.width / 2;
    const alongZ = widthDirection.z * stair.width / 2;
    const outX = direction.x * stair.treadDepth / 2;
    const outZ = direction.z * stair.treadDepth / 2;
    return Object.freeze({
      id: `stair-tread-${startIndex + index + 1}`,
      x: center.x,
      z: center.z,
      y: Math.max(gradeElevation, startElevation - actualRise * (index + 1)),
      width: stair.width,
      depth: stair.treadDepth,
      rise: actualRise,
      rotationY: -Math.atan2(widthDirection.z, widthDirection.x),
      corners: Object.freeze([
        point(center.x - alongX - outX, center.z - alongZ - outZ),
        point(center.x + alongX - outX, center.z + alongZ - outZ),
        point(center.x + alongX + outX, center.z + alongZ + outZ),
        point(center.x - alongX + outX, center.z - alongZ + outZ),
      ]),
    });
  }));
  const upperTreads = stair.enabled && upperRiserCount > 0
    ? flightTreads(upperRiserCount, stairCenterOnEdge, upperDirection, upperWidthDirection, platform.elevation, 0)
    : Object.freeze([]);
  const lowerTreads = stair.enabled
    ? flightTreads(lowerRiserCount, lowerRunOrigin, lowerDirection, lowerWidthDirection, landingElevation, upperRiserCount)
    : Object.freeze([]);
  const stairTreads = Object.freeze([...upperTreads, ...lowerTreads]);
  const stringerSideOffset = Math.max(0, stair.width / 2 - 0.75);
  const flightStringers = (
    prefix: string,
    count: number,
    origin: PolygonPoint,
    direction: PolygonPoint,
    widthDirection: PolygonPoint,
    startElevation: number,
    endElevation: number,
  ) => Object.freeze([-1, 1].map((side, index) => Object.freeze({
        id: `${prefix}-${index + 1}`,
        start: point3(
          origin.x + widthDirection.x * stringerSideOffset * side,
          startElevation,
          origin.z + widthDirection.z * stringerSideOffset * side,
        ),
        end: point3(
          origin.x + widthDirection.x * stringerSideOffset * side + direction.x * count * stair.treadDepth,
          endElevation,
          origin.z + widthDirection.z * stringerSideOffset * side + direction.z * count * stair.treadDepth,
        ),
      })));
  const stairStringers = stair.enabled ? Object.freeze([
    ...(upperRiserCount > 0 ? flightStringers("stair-stringer-upper", upperRiserCount, stairCenterOnEdge, upperDirection, upperWidthDirection, platform.elevation, landingElevation) : []),
    ...flightStringers(upperRiserCount > 0 ? "stair-stringer-lower" : "stair-stringer", lowerRiserCount, lowerRunOrigin, lowerDirection, lowerWidthDirection, landingElevation, gradeElevation),
  ]) : Object.freeze([]);
  const stairRailSideOffset = Math.max(0, stair.width / 2 - 2);
  const flightRails = (
    prefix: string,
    count: number,
    origin: PolygonPoint,
    direction: PolygonPoint,
    widthDirection: PolygonPoint,
    startElevation: number,
    endElevation: number,
  ) => Object.freeze([-1, 1].map((side, index) => Object.freeze({
      id: `${prefix}-${index + 1}`,
      start: point3(origin.x + widthDirection.x * stairRailSideOffset * side, startElevation + platform.construction.railing.height - 2, origin.z + widthDirection.z * stairRailSideOffset * side),
      end: point3(origin.x + widthDirection.x * stairRailSideOffset * side + direction.x * count * stair.treadDepth, endElevation + platform.construction.railing.height - 2, origin.z + widthDirection.z * stairRailSideOffset * side + direction.z * count * stair.treadDepth),
    })));
  const stairRailSegments = stair.enabled ? Object.freeze([
    ...(upperRiserCount > 0 ? flightRails("stair-rail-upper", upperRiserCount, stairCenterOnEdge, upperDirection, upperWidthDirection, platform.elevation, landingElevation) : []),
    ...flightRails(upperRiserCount > 0 ? "stair-rail-lower" : "stair-rail-side", lowerRiserCount, lowerRunOrigin, lowerDirection, lowerWidthDirection, landingElevation, gradeElevation),
  ]) : Object.freeze([]);
  const stairRailPosts = Object.freeze(stairRailSegments.flatMap((segment, index) => [
    Object.freeze({ id: `stair-rail-post-${index + 1}-top`, x: segment.start.x, y: segment.start.y - platform.construction.railing.height + 2, z: segment.start.z, height: platform.construction.railing.height }),
    Object.freeze({ id: `stair-rail-post-${index + 1}-bottom`, x: segment.end.x, y: segment.end.y - platform.construction.railing.height + 2, z: segment.end.z, height: platform.construction.railing.height }),
  ]));
  const landingAlongX = stairDx * stair.width / 2;
  const landingAlongZ = stairDz * stair.width / 2;
  const landingOutX = stairEdge.outward.x * stair.landingDepth / 2;
  const landingOutZ = stairEdge.outward.z * stair.landingDepth / 2;
  const landingCorners = Object.freeze([
    point(landingCenter.x - landingAlongX - landingOutX, landingCenter.z - landingAlongZ - landingOutZ),
    point(landingCenter.x + landingAlongX - landingOutX, landingCenter.z + landingAlongZ - landingOutZ),
    point(landingCenter.x + landingAlongX + landingOutX, landingCenter.z + landingAlongZ + landingOutZ),
    point(landingCenter.x - landingAlongX + landingOutX, landingCenter.z - landingAlongZ + landingOutZ),
  ]);
  const landing = stair.enabled && stair.landingEnabled ? Object.freeze({
    id: "stair-landing" as const,
    position: landingPosition,
    y: landingElevation,
    depth: stair.landingDepth,
    width: stair.width,
    center: landingCenter,
    rotationY: landingRotationY,
    corners: landingCorners,
  }) : null;
  const landingRailSegments = landing ? Object.freeze([
    ...(turn !== "left" ? [Object.freeze({ id: "landing-rail-left", start: landingCorners[0], end: landingCorners[3] })] : []),
    ...(turn !== "right" ? [Object.freeze({ id: "landing-rail-right", start: landingCorners[1], end: landingCorners[2] })] : []),
    ...(turn !== "straight" ? [Object.freeze({ id: "landing-rail-outer", start: landingCorners[3], end: landingCorners[2] })] : []),
  ]) : Object.freeze([]);
  const landingRailPointMap = new Map<string, PolygonPoint>();
  for (const segment of landingRailSegments) {
    for (const corner of [segment.start, segment.end]) landingRailPointMap.set(`${corner.x}:${corner.z}`, corner);
  }
  const landingRailPoints = landing ? (turn === "straight" ? landingCorners : [...landingRailPointMap.values()]) : [];
  const landingRailPosts = Object.freeze(landingRailPoints.map((corner, index) => Object.freeze({
    id: `landing-rail-post-${index + 1}`,
    x: corner.x,
    z: corner.z,
    top: landingElevation + platform.construction.railing.height,
  })));
  const landingSupportPosts = landing ? Object.freeze([landingCorners[2], landingCorners[3]].map((corner, index) => Object.freeze({
    id: `landing-support-post-${index + 1}`,
    x: corner.x,
    z: corner.z,
    top: landingElevation - 5.5,
  }))) : Object.freeze([]);
  return Object.freeze({
    platformId,
    footprint: platform.region.outer,
    platformEdges: edges,
    surfaceBoards: members.surfaceBoards,
    joists: members.joists,
    railSegments,
    railPosts: Object.freeze([...railPostMap.values()].sort((a, b) => a.id.localeCompare(b.id))),
    stairOpening: stair.enabled ? Object.freeze({
      id: "stair-opening", start: positionOnEdge(stair.offset), end: positionOnEdge(stair.offset + stair.width),
    }) : null,
    stairTreads,
    stairStringers,
    stairRailSegments,
    stairRailPosts,
    stairRise,
    landing,
    landingRailSegments,
    landingRailPosts,
    landingSupportPosts,
  });
}
