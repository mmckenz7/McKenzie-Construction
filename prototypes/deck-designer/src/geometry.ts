import type { DeckDesignV1, DeckEdgeId } from "./model";

export type Point2 = Readonly<{ x: number; z: number }>;
export type LinearMember = Readonly<{
  id: string;
  start: Point2;
  end: Point2;
}>;
export type Post = Readonly<{ id: string; x: number; z: number; top: number }>;
export type StairTread = Readonly<{
  id: string;
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
  rise: number;
  rotationY: number;
  corners: readonly Point2[];
}>;
export type PlatformEdge = LinearMember & Readonly<{
  id: DeckEdgeId;
  label: string;
  length: number;
  outward: Point2;
}>;
export type Landing = Readonly<{
  id: "stair-landing";
  y: number;
  depth: number;
  width: number;
  corners: readonly Point2[];
  center: Point2;
  rotationY: number;
}>;
type RailSegment = LinearMember & Readonly<{ edgeId: DeckEdgeId }>;

export type DeckGeometry = Readonly<{
  footprint: readonly Point2[];
  platformEdges: readonly PlatformEdge[];
  surfaceBoards: readonly LinearMember[];
  joists: readonly LinearMember[];
  beams: readonly LinearMember[];
  supportPosts: readonly Post[];
  railSegments: readonly RailSegment[];
  railPosts: readonly Post[];
  stairOpening: LinearMember | null;
  stairTreads: readonly StairTread[];
  landing: Landing | null;
  landingRailSegments: readonly LinearMember[];
  landingRailPosts: readonly Post[];
  landingSupportPosts: readonly Post[];
}>;

const point = (x: number, z: number): Point2 => Object.freeze({ x, z });

function evenlySpacedPositions(length: number, maximumSpacing: number): readonly number[] {
  const bays = Math.max(1, Math.ceil(length / maximumSpacing));
  return Object.freeze(Array.from({ length: bays + 1 }, (_, index) => (length * index) / bays));
}

function platformEdges(design: DeckDesignV1): readonly PlatformEdge[] {
  const { width, projection, kind, cutoutWidth, cutoutDepth } = design.platform;
  const innerX = width - cutoutWidth;
  const innerZ = projection - cutoutDepth;
  const makeEdge = (
    id: DeckEdgeId,
    label: string,
    start: Point2,
    end: Point2,
    outward: Point2,
  ): PlatformEdge => Object.freeze({
    id,
    label,
    start,
    end,
    outward,
    length: Math.hypot(end.x - start.x, end.z - start.z),
  });
  return Object.freeze([
    makeEdge("front", "Front", point(0, projection), point(kind === "l-shape" ? innerX : width, projection), point(0, 1)),
    makeEdge("left", "Left", point(0, 0), point(0, projection), point(-1, 0)),
    makeEdge("right", "Right", point(width, 0), point(width, kind === "l-shape" ? innerZ : projection), point(1, 0)),
    ...(kind === "l-shape"
      ? [
          makeEdge("notch-horizontal", "Notch horizontal", point(innerX, innerZ), point(width, innerZ), point(0, 1)),
          makeEdge("notch-vertical", "Notch vertical", point(innerX, innerZ), point(innerX, projection), point(1, 0)),
        ]
      : []),
  ]);
}

export function deriveGeometry(design: DeckDesignV1): DeckGeometry {
  const { width, projection, surfaceElevation, kind, cutoutWidth, cutoutDepth } = design.platform;
  const { boardWidth, gap } = design.construction.decking;
  const { joistSpacing, beamInset, maxPostSpacing } = design.construction.framing;
  const boardRows = Math.ceil(projection / (boardWidth + gap));
  const surfaceBoards = Array.from({ length: boardRows }, (_, index) => {
    const z = Math.min(projection - boardWidth / 2, boardWidth / 2 + index * (boardWidth + gap));
    const rowWidth = kind === "l-shape" && z > projection - cutoutDepth ? width - cutoutWidth : width;
    return Object.freeze({ id: `deck-board-${index + 1}`, start: point(0, z), end: point(rowWidth, z) });
  });

  const joistBays = Math.ceil(width / joistSpacing);
  const joists = Array.from({ length: joistBays + 1 }, (_, index) => {
    const x = (width * index) / joistBays;
    const joistProjection = kind === "l-shape" && x > width - cutoutWidth ? projection - cutoutDepth : projection;
    return Object.freeze({ id: `joist-${index + 1}`, start: point(x, 0), end: point(x, joistProjection) });
  });
  const beamZ = projection - beamInset;
  const beamWidth = kind === "l-shape" && beamZ > projection - cutoutDepth ? width - cutoutWidth : width;
  const beams = Object.freeze([
    Object.freeze({ id: "beam-1", start: point(0, beamZ), end: point(beamWidth, beamZ) }),
  ]);
  const supportPosts = Object.freeze(
    evenlySpacedPositions(beamWidth, maxPostSpacing).map((x, index) =>
      Object.freeze({ id: `support-post-${index + 1}`, x, z: beamZ, top: surfaceElevation - 8 }),
    ),
  );

  const innerX = width - cutoutWidth;
  const innerZ = projection - cutoutDepth;
  const stair = design.construction.stairs;
  const edges = platformEdges(design);
  const stairEdge = edges.find((edge) => edge.id === stair.edgeId);
  if (!stairEdge) throw new RangeError("The stair attachment edge is unavailable.");
  const stairDx = (stairEdge.end.x - stairEdge.start.x) / stairEdge.length;
  const stairDz = (stairEdge.end.z - stairEdge.start.z) / stairEdge.length;
  const positionOnEdge = (distance: number): Point2 => point(
    stairEdge.start.x + stairDx * distance,
    stairEdge.start.z + stairDz * distance,
  );
  const makeRail = (id: string, start: Point2, end: Point2, edgeId: DeckEdgeId): RailSegment =>
    Object.freeze({ id, start, end, edgeId });
  const railSegments: readonly RailSegment[] = Object.freeze(
    edges
      .filter((edge) => design.construction.railing.enabledEdges.includes(edge.id))
      .flatMap<RailSegment>((edge) => {
        if (!stair.enabled || edge.id !== stair.edgeId) {
          return [makeRail(`rail-${edge.id}`, edge.start, edge.end, edge.id)];
        }
        return [
          ...(stair.offset > 0
            ? [makeRail(`rail-${edge.id}-before-stair`, edge.start, positionOnEdge(stair.offset), edge.id)]
            : []),
          ...(stair.offset + stair.width < edge.length
            ? [makeRail(`rail-${edge.id}-after-stair`, positionOnEdge(stair.offset + stair.width), edge.end, edge.id)]
            : []),
        ];
      }),
  );
  const railPostMap = new Map<string, Post>();
  for (const segment of railSegments) {
    const length = Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z);
    for (const distance of evenlySpacedPositions(length, maxPostSpacing)) {
      const ratio = length === 0 ? 0 : distance / length;
      const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
      const z = segment.start.z + (segment.end.z - segment.start.z) * ratio;
      const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
      railPostMap.set(key, Object.freeze({
        id: `rail-post-${key}`,
        x,
        z,
        top: surfaceElevation + design.construction.railing.height,
      }));
    }
  }
  const riserCount = stair.enabled ? Math.ceil(surfaceElevation / stair.maxRiserHeight) : 0;
  const actualRise = riserCount > 0 ? surfaceElevation / riserCount : 0;
  const landingOffset = stair.enabled && stair.landingEnabled ? stair.landingDepth : 0;
  const stairCenterOnEdge = positionOnEdge(stair.offset + stair.width / 2);
  const stairRotationY = -Math.atan2(stairDz, stairDx);
  const stairTreads = Object.freeze(Array.from({ length: riserCount }, (_, index) =>
    {
      const outwardDistance = landingOffset + stair.treadDepth * (index + 0.5);
      const center = point(
        stairCenterOnEdge.x + stairEdge.outward.x * outwardDistance,
        stairCenterOnEdge.z + stairEdge.outward.z * outwardDistance,
      );
      const alongX = stairDx * stair.width / 2;
      const alongZ = stairDz * stair.width / 2;
      const outX = stairEdge.outward.x * stair.treadDepth / 2;
      const outZ = stairEdge.outward.z * stair.treadDepth / 2;
      return Object.freeze({
        id: `stair-tread-${index + 1}`,
        x: center.x,
        z: center.z,
        y: Math.max(0, surfaceElevation - actualRise * (index + 1)),
        width: stair.width,
        depth: stair.treadDepth,
        rise: actualRise,
        rotationY: stairRotationY,
        corners: Object.freeze([
          point(center.x - alongX - outX, center.z - alongZ - outZ),
          point(center.x + alongX - outX, center.z + alongZ - outZ),
          point(center.x + alongX + outX, center.z + alongZ + outZ),
          point(center.x - alongX + outX, center.z - alongZ + outZ),
        ]),
      });
    }
  ));
  const landingCenter = point(
    stairCenterOnEdge.x + stairEdge.outward.x * stair.landingDepth / 2,
    stairCenterOnEdge.z + stairEdge.outward.z * stair.landingDepth / 2,
  );
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
  const landing = stair.enabled && stair.landingEnabled
    ? Object.freeze({
        id: "stair-landing" as const,
        y: surfaceElevation,
        depth: stair.landingDepth,
        width: stair.width,
        center: landingCenter,
        rotationY: stairRotationY,
        corners: landingCorners,
      })
    : null;
  const landingRailSegments = landing
    ? Object.freeze([
        Object.freeze({ id: "landing-rail-left", start: landingCorners[0], end: landingCorners[3] }),
        Object.freeze({ id: "landing-rail-right", start: landingCorners[1], end: landingCorners[2] }),
      ])
    : Object.freeze([]);
  const landingRailPosts = landing
    ? Object.freeze(landingCorners.map((corner, index) => Object.freeze({
        id: `landing-rail-post-${index + 1}`,
        x: corner.x,
        z: corner.z,
        top: surfaceElevation + design.construction.railing.height,
      })))
    : Object.freeze([]);
  const landingSupportPosts = landing
    ? Object.freeze([landingCorners[2], landingCorners[3]].map((corner, index) => Object.freeze({
        id: `landing-support-post-${index + 1}`,
        x: corner.x,
        z: corner.z,
        top: surfaceElevation - 5.5,
      })))
    : Object.freeze([]);

  return Object.freeze({
    footprint: kind === "rectangle"
      ? Object.freeze([point(0, 0), point(width, 0), point(width, projection), point(0, projection)])
      : Object.freeze([
          point(0, 0), point(width, 0), point(width, innerZ),
          point(innerX, innerZ), point(innerX, projection), point(0, projection),
        ]),
    platformEdges: edges,
    surfaceBoards: Object.freeze(surfaceBoards),
    joists: Object.freeze(joists),
    beams,
    supportPosts,
    railSegments,
    railPosts: Object.freeze([...railPostMap.values()].sort((a, b) => a.id.localeCompare(b.id))),
    stairOpening: stair.enabled
      ? Object.freeze({ id: "stair-opening", start: positionOnEdge(stair.offset), end: positionOnEdge(stair.offset + stair.width) })
      : null,
    stairTreads,
    landing,
    landingRailSegments,
    landingRailPosts,
    landingSupportPosts,
  });
}
