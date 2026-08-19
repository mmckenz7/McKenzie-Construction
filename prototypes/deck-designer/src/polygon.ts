export type PolygonPoint = Readonly<{ x: number; z: number }>;
export type PolygonEdge = Readonly<{
  id: string;
  start: PolygonPoint;
  end: PolygonPoint;
  length: number;
  outward: PolygonPoint;
}>;
export type PolygonInterval = Readonly<{ start: number; end: number }>;
export type PolygonEdgeReferenceResolution = Readonly<{
  status: "preserved" | "remapped" | "review_required" | "missing";
  previousEdgeId: string;
  candidateEdgeIds: readonly string[];
}>;

const EPSILON = 0.000001;
const samePoint = (a: PolygonPoint, b: PolygonPoint): boolean =>
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.z - b.z) < EPSILON;
const cross = (a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

export function signedPolygonArea(points: readonly PolygonPoint[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function pointOnSegment(point: PolygonPoint, start: PolygonPoint, end: PolygonPoint): boolean {
  return Math.abs(cross(start, end, point)) < EPSILON &&
    point.x >= Math.min(start.x, end.x) - EPSILON && point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.z >= Math.min(start.z, end.z) - EPSILON && point.z <= Math.max(start.z, end.z) + EPSILON;
}

function segmentsIntersect(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) < EPSILON && pointOnSegment(c, a, b)) ||
    (Math.abs(abD) < EPSILON && pointOnSegment(d, a, b)) ||
    (Math.abs(cdA) < EPSILON && pointOnSegment(a, c, d)) ||
    (Math.abs(cdB) < EPSILON && pointOnSegment(b, c, d));
}

export function polygonContainsPoint(points: readonly PolygonPoint[], point: PolygonPoint): boolean {
  const normalized = normalizePolygon(points);
  let inside = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const start = normalized[index];
    const end = normalized[(index + 1) % normalized.length];
    if (pointOnSegment(point, start, end)) return false;
    if ((start.z > point.z) !== (end.z > point.z)) {
      const crossingX = start.x + ((point.z - start.z) * (end.x - start.x)) / (end.z - start.z);
      if (crossingX > point.x) inside = !inside;
    }
  }
  return inside;
}

export function polygonsIntersect(first: readonly PolygonPoint[], second: readonly PolygonPoint[]): boolean {
  const a = normalizePolygon(first);
  const b = normalizePolygon(second);
  for (let firstIndex = 0; firstIndex < a.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < b.length; secondIndex += 1) {
      if (segmentsIntersect(
        a[firstIndex], a[(firstIndex + 1) % a.length],
        b[secondIndex], b[(secondIndex + 1) % b.length],
      )) return true;
    }
  }
  return false;
}

export function normalizePolygon(input: readonly PolygonPoint[]): readonly PolygonPoint[] {
  const withoutClosingPoint = input.length > 1 && samePoint(input[0], input[input.length - 1])
    ? input.slice(0, -1)
    : [...input];
  if (withoutClosingPoint.length < 3 || withoutClosingPoint.length > 24) {
    throw new RangeError("A deck outline must contain between 3 and 24 vertices.");
  }
  const points = withoutClosingPoint.map((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new TypeError(`Deck outline vertex ${index + 1} must contain finite coordinates.`);
    }
    if (Math.abs(point.x) > 2400 || Math.abs(point.z) > 2400) {
      throw new RangeError(`Deck outline vertex ${index + 1} must remain within the 200-foot prototype workspace.`);
    }
    return Object.freeze({ x: Math.round(point.x * 100) / 100, z: Math.round(point.z * 100) / 100 });
  });
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (samePoint(current, next)) throw new RangeError("Adjacent deck outline vertices must be distinct.");
    if (Math.abs(cross(previous, current, next)) < EPSILON) {
      throw new RangeError("Deck outline cannot contain redundant collinear vertices.");
    }
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
        throw new RangeError("Deck outline edges cannot intersect.");
      }
    }
  }
  const area = signedPolygonArea(points);
  if (Math.abs(area) < 576) throw new RangeError("Deck outline must enclose at least 4 square feet.");
  const positive = area > 0 ? points : [...points].reverse();
  let startIndex = 0;
  for (let index = 1; index < positive.length; index += 1) {
    if (positive[index].z < positive[startIndex].z ||
        (positive[index].z === positive[startIndex].z && positive[index].x < positive[startIndex].x)) startIndex = index;
  }
  return Object.freeze(
    Array.from({ length: positive.length }, (_, index) => positive[(startIndex + index) % positive.length]),
  );
}

export function derivePolygonEdges(points: readonly PolygonPoint[]): readonly PolygonEdge[] {
  const normalized = normalizePolygon(points);
  return Object.freeze(normalized.map((start, index) => {
    const end = normalized[(index + 1) % normalized.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    return Object.freeze({
      id: `custom-edge-${index + 1}`,
      start,
      end,
      length,
      outward: Object.freeze({ x: dz / length, z: -dx / length }),
    });
  }));
}

const encodeCoordinate = (value: number): string => {
  const scaled = Math.round(value * 100);
  return `${scaled < 0 ? "n" : "p"}${Math.abs(scaled)}`;
};

export function geometricPolygonEdgeId(start: PolygonPoint, end: PolygonPoint): string {
  return `edge-${encodeCoordinate(start.x)}-${encodeCoordinate(start.z)}--${encodeCoordinate(end.x)}-${encodeCoordinate(end.z)}`;
}

export function deriveGeometricPolygonEdges(points: readonly PolygonPoint[]): readonly PolygonEdge[] {
  const normalized = normalizePolygon(points);
  return Object.freeze(normalized.map((start, index) => {
    const end = normalized[(index + 1) % normalized.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    return Object.freeze({
      id: geometricPolygonEdgeId(start, end),
      start,
      end,
      length,
      outward: Object.freeze({ x: dz / length, z: -dx / length }),
    });
  }));
}

function collinearOverlapLength(first: PolygonEdge, second: PolygonEdge): number {
  const dx = first.end.x - first.start.x;
  const dz = first.end.z - first.start.z;
  if (Math.abs(cross(first.start, first.end, second.start)) > EPSILON ||
      Math.abs(cross(first.start, first.end, second.end)) > EPSILON) return 0;
  const project = (point: PolygonPoint) => ((point.x - first.start.x) * dx + (point.z - first.start.z) * dz) / first.length;
  const secondStart = project(second.start);
  const secondEnd = project(second.end);
  return Math.max(0, Math.min(first.length, Math.max(secondStart, secondEnd)) - Math.max(0, Math.min(secondStart, secondEnd)));
}

export function resolveGeometricEdgeReference(
  previousPoints: readonly PolygonPoint[],
  nextPoints: readonly PolygonPoint[],
  previousEdgeId: string,
): PolygonEdgeReferenceResolution {
  const previousEdges = deriveGeometricPolygonEdges(previousPoints);
  const nextEdges = deriveGeometricPolygonEdges(nextPoints);
  if (nextEdges.some((edge) => edge.id === previousEdgeId)) {
    return Object.freeze({ status: "preserved", previousEdgeId, candidateEdgeIds: Object.freeze([previousEdgeId]) });
  }
  const previous = previousEdges.find((edge) => edge.id === previousEdgeId);
  if (!previous) return Object.freeze({ status: "missing", previousEdgeId, candidateEdgeIds: Object.freeze([]) });
  const candidates = nextEdges
    .map((edge) => ({ edge, overlap: collinearOverlapLength(previous, edge) }))
    .filter((candidate) => candidate.overlap > EPSILON)
    .sort((a, b) => b.overlap - a.overlap || a.edge.id.localeCompare(b.edge.id));
  if (candidates.length === 0) {
    return Object.freeze({ status: "missing", previousEdgeId, candidateEdgeIds: Object.freeze([]) });
  }
  return Object.freeze({
    status: candidates.length === 1 ? "remapped" : "review_required",
    previousEdgeId,
    candidateEdgeIds: Object.freeze(candidates.map((candidate) => candidate.edge.id)),
  });
}

export function horizontalIntervalsAt(points: readonly PolygonPoint[], z: number): readonly PolygonInterval[] {
  if (!Number.isFinite(z)) throw new TypeError("Scanline elevation must be finite.");
  const normalized = normalizePolygon(points);
  const intersections: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const start = normalized[index];
    const end = normalized[(index + 1) % normalized.length];
    if ((start.z <= z && end.z > z) || (end.z <= z && start.z > z)) {
      intersections.push(start.x + ((z - start.z) * (end.x - start.x)) / (end.z - start.z));
    }
  }
  intersections.sort((a, b) => a - b);
  if (intersections.length % 2 !== 0) throw new RangeError("Deck outline produced an invalid scanline projection.");
  return Object.freeze(Array.from({ length: intersections.length / 2 }, (_, index) => Object.freeze({
    start: Math.round(intersections[index * 2] * 100) / 100,
    end: Math.round(intersections[index * 2 + 1] * 100) / 100,
  })));
}

export function verticalIntervalsAt(points: readonly PolygonPoint[], x: number): readonly PolygonInterval[] {
  return horizontalIntervalsAt(points.map((point) => ({ x: point.z, z: point.x })), x);
}
