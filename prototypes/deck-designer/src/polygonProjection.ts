import {
  normalizePolygon,
  signedPolygonArea,
  type PolygonPoint,
} from "./polygon";
import {
  horizontalRegionIntervalsAt,
  normalizePolygonRegion,
  verticalRegionIntervalsAt,
  type PolygonRegion,
} from "./polygonRegion";

export type PolygonTriangle = Readonly<{
  id: string;
  points: readonly [PolygonPoint, PolygonPoint, PolygonPoint];
}>;

export type ProjectedMember = Readonly<{
  id: string;
  start: PolygonPoint;
  end: PolygonPoint;
}>;

export type PolygonMemberProjection = Readonly<{
  surfaceBoards: readonly ProjectedMember[];
  joists: readonly ProjectedMember[];
  surfaceBoardLength: number;
  joistLength: number;
}>;

const cross = (a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

function pointInTriangle(point: PolygonPoint, a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): boolean {
  const ab = cross(a, b, point);
  const bc = cross(b, c, point);
  const ca = cross(c, a, point);
  return ab >= -0.000001 && bc >= -0.000001 && ca >= -0.000001;
}

export function triangulatePolygon(points: readonly PolygonPoint[]): readonly PolygonTriangle[] {
  const normalized = normalizePolygon(points);
  const remaining = normalized.map((_, index) => index);
  const triangles: PolygonTriangle[] = [];
  let attemptsWithoutEar = 0;
  while (remaining.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previousIndex = remaining[(cursor - 1 + remaining.length) % remaining.length];
      const currentIndex = remaining[cursor];
      const nextIndex = remaining[(cursor + 1) % remaining.length];
      const previous = normalized[previousIndex];
      const current = normalized[currentIndex];
      const next = normalized[nextIndex];
      if (cross(previous, current, next) <= 0.000001) continue;
      const containsVertex = remaining.some((candidateIndex) =>
        candidateIndex !== previousIndex && candidateIndex !== currentIndex && candidateIndex !== nextIndex &&
        pointInTriangle(normalized[candidateIndex], previous, current, next));
      if (containsVertex) continue;
      triangles.push(Object.freeze({
        id: `polygon-triangle-${triangles.length + 1}`,
        points: Object.freeze([previous, current, next]) as readonly [PolygonPoint, PolygonPoint, PolygonPoint],
      }));
      remaining.splice(cursor, 1);
      clipped = true;
      attemptsWithoutEar = 0;
      break;
    }
    if (!clipped) {
      attemptsWithoutEar += 1;
      if (attemptsWithoutEar > normalized.length) {
        throw new RangeError("Deck outline could not be triangulated deterministically.");
      }
    }
  }
  triangles.push(Object.freeze({
    id: `polygon-triangle-${triangles.length + 1}`,
    points: Object.freeze(remaining.map((index) => normalized[index])) as unknown as readonly [PolygonPoint, PolygonPoint, PolygonPoint],
  }));
  const triangleArea = triangles.reduce((sum, triangle) => sum + Math.abs(signedPolygonArea(triangle.points)), 0);
  if (Math.abs(triangleArea - signedPolygonArea(normalized)) > 0.01) {
    throw new RangeError("Deck outline triangulation did not preserve area.");
  }
  return Object.freeze(triangles);
}

function bounds(points: readonly PolygonPoint[]): Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  return Object.freeze({
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  });
}

const memberLength = (member: ProjectedMember): number =>
  Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z);

export function derivePolygonMembers(
  region: PolygonRegion,
  options: Readonly<{ boardWidth: number; gap: number; joistSpacing: number }>,
): PolygonMemberProjection {
  const normalized = normalizePolygonRegion(region);
  if (!Number.isFinite(options.boardWidth) || options.boardWidth < 2 || options.boardWidth > 12) {
    throw new RangeError("Board width must be between 2 and 12 inches.");
  }
  if (!Number.isFinite(options.gap) || options.gap < 0.05 || options.gap > 1) {
    throw new RangeError("Board gap must be between 0.05 and 1 inch.");
  }
  if (!Number.isFinite(options.joistSpacing) || options.joistSpacing < 8 || options.joistSpacing > 24) {
    throw new RangeError("Joist spacing must be between 8 and 24 inches.");
  }
  const regionBounds = bounds(normalized.outer);
  const height = regionBounds.maxZ - regionBounds.minZ;
  const width = regionBounds.maxX - regionBounds.minX;
  const pitch = options.boardWidth + options.gap;
  const rowCount = Math.ceil(height / pitch);
  const surfaceBoards = Object.freeze(Array.from({ length: rowCount }, (_, rowIndex) => {
    const z = Math.min(
      regionBounds.maxZ - 0.000001,
      regionBounds.minZ + options.boardWidth / 2 + rowIndex * pitch,
    );
    return horizontalRegionIntervalsAt(normalized, z).map((interval, segmentIndex) => Object.freeze({
      id: `deck-board-${rowIndex + 1}-${segmentIndex + 1}`,
      start: Object.freeze({ x: interval.start, z: Math.round(z * 100) / 100 }),
      end: Object.freeze({ x: interval.end, z: Math.round(z * 100) / 100 }),
    }));
  }).flat());
  const joistBays = Math.ceil(width / options.joistSpacing);
  const joists = Object.freeze(Array.from({ length: joistBays + 1 }, (_, columnIndex) => {
    const x = regionBounds.minX + (width * columnIndex) / joistBays;
    const sampleX = columnIndex === joistBays ? x - 0.000001 : x;
    return verticalRegionIntervalsAt(normalized, sampleX).map((interval, segmentIndex) => Object.freeze({
      id: `joist-${columnIndex + 1}-${segmentIndex + 1}`,
      start: Object.freeze({ x: Math.round(x * 100) / 100, z: interval.start }),
      end: Object.freeze({ x: Math.round(x * 100) / 100, z: interval.end }),
    }));
  }).flat());
  return Object.freeze({
    surfaceBoards,
    joists,
    surfaceBoardLength: Math.round(surfaceBoards.reduce((sum, member) => sum + memberLength(member), 0) * 100) / 100,
    joistLength: Math.round(joists.reduce((sum, member) => sum + memberLength(member), 0) * 100) / 100,
  });
}
