import { deriveGeometricPolygonEdges, type PolygonEdge, type PolygonPoint } from "./polygon";
import { derivePolygonMembers, type ProjectedMember } from "./polygonProjection";
import { derivePictureFrameBoards } from "./pictureFrameProjection";
import { horizontalRegionIntervalsAt, verticalRegionIntervalsAt } from "./polygonRegion";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { deriveStairRouteGeometryV3, type StairLandingGeometryV3, type StairRailPostV3, type StairTreadV3 } from "./stairRouteGeometryV3";
import { effectiveBeamInsetV3 } from "./framingEditorV3";

type Point3 = Readonly<{ x: number; y: number; z: number }>;
type Post = Readonly<{ id: string; x: number; z: number; top: number }>;
type StairRailSegmentV3 = Readonly<{ id: string; start: Point3; end: Point3 }>;
type RailSegmentV3 = ProjectedMember & Readonly<{ edgeId: string }>;

export type DeckPlatformGeometryV3 = Readonly<{
  platformId: string;
  footprint: readonly PolygonPoint[];
  platformEdges: readonly PolygonEdge[];
  surfaceBoards: readonly ProjectedMember[];
  joists: readonly ProjectedMember[];
  beams: readonly ProjectedMember[];
  supportPosts: readonly Post[];
  railSegments: readonly RailSegmentV3[];
  railPosts: readonly Post[];
  stairOpenings: readonly ProjectedMember[];
  stairOpening: ProjectedMember | null;
  stairTreads: readonly StairTreadV3[];
  stairStringers: readonly Readonly<{ id: string; start: Point3; end: Point3 }>[];
  stairRailSegments: readonly StairRailSegmentV3[];
  stairRailPosts: readonly StairRailPostV3[];
  stairRise: number;
  landings: readonly StairLandingGeometryV3[];
  landing: StairLandingGeometryV3 | null;
  landingRailSegments: readonly (ProjectedMember & Readonly<{ y: number }>)[];
  landingRailPosts: readonly Post[];
  landingSupportPosts: readonly Post[];
}>;

const point = (x: number, z: number): PolygonPoint => Object.freeze({ x, z });
const CONCEPTUAL_RAIL_POST_SPACING = 72;

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
    boardDirection: platform.construction.decking.direction,
    joistSpacing: platform.construction.framing.joistSpacing,
  });
  const surfaceBoards = platform.construction.decking.pattern === "picture_frame"
    ? derivePictureFrameBoards(platform.region, {
      boardWidth: platform.construction.decking.boardWidth,
      gap: platform.construction.decking.gap,
      boardDirection: platform.construction.decking.direction,
      joistSpacing: platform.construction.framing.joistSpacing,
    }).surfaceBoards
    : members.surfaceBoards;
  const minX = Math.min(...platform.region.outer.map((item) => item.x));
  const maxX = Math.max(...platform.region.outer.map((item) => item.x));
  const minZ = Math.min(...platform.region.outer.map((item) => item.z));
  const maxZ = Math.max(...platform.region.outer.map((item) => item.z));
  const horizontalBeam = platform.construction.decking.direction === "left_right";
  const effectiveBeamInset = effectiveBeamInsetV3(platform);
  const beamCoordinate = horizontalBeam ? maxZ - effectiveBeamInset : maxX - effectiveBeamInset;
  const beamIntervals = horizontalBeam
    ? horizontalRegionIntervalsAt(platform.region, beamCoordinate)
    : verticalRegionIntervalsAt(platform.region, beamCoordinate);
  const beams = Object.freeze(beamIntervals.map((interval, index) => Object.freeze({
    id: `beam-${index + 1}`,
    start: Object.freeze(horizontalBeam ? { x: interval.start, z: beamCoordinate } : { x: beamCoordinate, z: interval.start }),
    end: Object.freeze(horizontalBeam ? { x: interval.end, z: beamCoordinate } : { x: beamCoordinate, z: interval.end }),
  })));
  const supportPosts = Object.freeze(beams.flatMap((beam, beamIndex) => {
    const beamLength = Math.hypot(beam.end.x - beam.start.x, beam.end.z - beam.start.z);
    return evenlySpacedPositions(beamLength, platform.construction.framing.maxPostSpacing).map((distance, postIndex) => {
      const ratio = beamLength === 0 ? 0 : distance / beamLength;
      return Object.freeze({
        id: `support-post-${beamIndex + 1}-${postIndex + 1}`,
        x: beam.start.x + (beam.end.x - beam.start.x) * ratio,
        z: beam.start.z + (beam.end.z - beam.start.z) * ratio,
        top: platform.elevation - 8,
      });
    });
  }));
  const stairRoutes = platform.construction.stairSystems.map((system, index) => deriveStairRouteGeometryV3({
    system,
    edge: edges.find((edge) => edge.id === system.edgeId)!,
    platformElevation: platform.elevation,
    gradeElevation: normalized.siteContext.gradeElevation,
    railingHeight: platform.construction.railing.height,
    namespaceIds: platform.construction.stairSystems.length > 1 || index > 0,
    targetPlatformElevations: Object.fromEntries(normalized.platforms.map((item) => [item.id, item.elevation])),
  }));
  const stairOpenings = Object.freeze(stairRoutes.map((route) => route.opening));
  const railSegments = Object.freeze(edges
    .filter((edge) => platform.construction.railing.enabledEdgeIds.includes(edge.id))
    .flatMap<RailSegmentV3>((edge) => {
      const openings = platform.construction.stairSystems.filter((system) => system.edgeId === edge.id).map((system) => ({ start: system.offset, end: system.offset + system.width })).sort((a, b) => a.start - b.start);
      if (openings.length === 0) return [Object.freeze({ id: `rail-${edge.id}`, start: edge.start, end: edge.end, edgeId: edge.id })];
      const edgeDx = (edge.end.x - edge.start.x) / edge.length;
      const edgeDz = (edge.end.z - edge.start.z) / edge.length;
      const onEdge = (distance: number) => point(edge.start.x + edgeDx * distance, edge.start.z + edgeDz * distance);
      const segments: RailSegmentV3[] = [];
      let cursor = 0;
      openings.forEach((opening, index) => {
        if (opening.start > cursor) segments.push(Object.freeze({ id: `rail-${edge.id}-span-${index + 1}`, start: onEdge(cursor), end: onEdge(opening.start), edgeId: edge.id }));
        cursor = opening.end;
      });
      if (cursor < edge.length) segments.push(Object.freeze({ id: `rail-${edge.id}-span-${openings.length + 1}`, start: onEdge(cursor), end: edge.end, edgeId: edge.id }));
      return segments;
    }));
  const railPostMap = new Map<string, Post>();
  for (const segment of railSegments) {
    const length = Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z);
    for (const distance of evenlySpacedPositions(length, CONCEPTUAL_RAIL_POST_SPACING)) {
      const ratio = length === 0 ? 0 : distance / length;
      const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
      const z = segment.start.z + (segment.end.z - segment.start.z) * ratio;
      const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
      railPostMap.set(key, Object.freeze({ id: `rail-post-${key}`, x, z, top: platform.elevation + platform.construction.railing.height }));
    }
  }
  const stairTreads = Object.freeze(stairRoutes.flatMap((route) => route.treads));
  const stairStringers = Object.freeze(stairRoutes.flatMap((route) => route.stringers));
  const stairRailSegments = Object.freeze(stairRoutes.flatMap((route) => route.rails));
  const stairRailPosts = Object.freeze(stairRoutes.flatMap((route) => route.railPosts));
  const landings = Object.freeze(stairRoutes.flatMap((route) => route.landings));
  const landingRailSegments = Object.freeze(stairRoutes.flatMap((route) => route.landingRails));
  const landingRailPosts = Object.freeze(stairRoutes.flatMap((route) => route.landingRailPosts));
  const landingSupportPosts = Object.freeze(stairRoutes.flatMap((route) => route.landingSupportPosts));
  return Object.freeze({
    platformId,
    footprint: platform.region.outer,
    platformEdges: edges,
    surfaceBoards,
    joists: members.joists,
    beams,
    supportPosts,
    railSegments,
    railPosts: Object.freeze([...railPostMap.values()].sort((a, b) => a.id.localeCompare(b.id))),
    stairOpenings,
    stairOpening: stairOpenings[0] ?? null,
    stairTreads,
    stairStringers,
    stairRailSegments,
    stairRailPosts,
    stairRise: platform.elevation - normalized.siteContext.gradeElevation,
    landings,
    landing: landings[0] ?? null,
    landingRailSegments,
    landingRailPosts,
    landingSupportPosts,
  });
}
