import {
  normalizePolygon,
  polygonContainsPoint,
  signedPolygonArea,
  type PolygonPoint,
} from "./polygon";

const EPSILON = 0.000001;
const round = (value: number): number => Math.round(value * 100) / 100;
const cross = (first: PolygonPoint, second: PolygonPoint): number => first.x * second.z - first.z * second.x;

/**
 * Deterministically offsets a simple polygon toward its interior with mitered
 * corners. Invalid, collapsed, or self-intersecting results fail closed through
 * the same polygon normalization boundary used by authoritative deck regions.
 */
function deriveSignedOffsetPolygon(
  input: readonly PolygonPoint[],
  distance: number,
): readonly PolygonPoint[] {
  if (!Number.isFinite(distance)) throw new RangeError("Polygon offset distance must be finite.");
  const polygon = normalizePolygon(input);
  if (distance === 0) return polygon;

  const inset = polygon.map((current, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    const incoming = Object.freeze({ x: current.x - previous.x, z: current.z - previous.z });
    const outgoing = Object.freeze({ x: next.x - current.x, z: next.z - current.z });
    const incomingLength = Math.hypot(incoming.x, incoming.z);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.z);
    const incomingInward = Object.freeze({ x: -incoming.z / incomingLength, z: incoming.x / incomingLength });
    const outgoingInward = Object.freeze({ x: -outgoing.z / outgoingLength, z: outgoing.x / outgoingLength });
    const firstLinePoint = Object.freeze({ x: current.x + incomingInward.x * distance, z: current.z + incomingInward.z * distance });
    const secondLinePoint = Object.freeze({ x: current.x + outgoingInward.x * distance, z: current.z + outgoingInward.z * distance });
    const denominator = cross(incoming, outgoing);
    if (Math.abs(denominator) < EPSILON) throw new RangeError("Polygon inset cannot resolve a parallel corner.");
    const betweenLines = Object.freeze({ x: secondLinePoint.x - firstLinePoint.x, z: secondLinePoint.z - firstLinePoint.z });
    const alongIncoming = cross(betweenLines, outgoing) / denominator;
    const point = Object.freeze({
      x: round(firstLinePoint.x + incoming.x * alongIncoming),
      z: round(firstLinePoint.z + incoming.z * alongIncoming),
    });
    if (Math.hypot(point.x - current.x, point.z - current.z) > Math.abs(distance) * 20) {
      throw new RangeError("Polygon offset corner is too acute for the requested distance.");
    }
    return point;
  });

  let normalized: readonly PolygonPoint[];
  try {
    normalized = normalizePolygon(inset);
  } catch {
    throw new RangeError("Polygon offset collapses or intersects at the requested distance.");
  }
  const sourceArea = signedPolygonArea(polygon);
  const offsetArea = signedPolygonArea(normalized);
  const validContainment = distance > 0
    ? offsetArea < sourceArea - EPSILON && normalized.every((point) => polygonContainsPoint(polygon, point))
    : offsetArea > sourceArea + EPSILON && polygon.every((point) => polygonContainsPoint(normalized, point));
  if (!validContainment) {
    throw new RangeError(distance > 0
      ? "Polygon inset must remain fully inside the source outline."
      : "Polygon expansion must fully contain the source outline.");
  }
  return normalized;
}

export function deriveInsetPolygon(
  input: readonly PolygonPoint[],
  distance: number,
): readonly PolygonPoint[] {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("Polygon inset distance must be a finite non-negative number.");
  }
  return deriveSignedOffsetPolygon(input, distance);
}

export function deriveExpandedPolygon(
  input: readonly PolygonPoint[],
  distance: number,
): readonly PolygonPoint[] {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("Polygon expansion distance must be a finite non-negative number.");
  }
  return deriveSignedOffsetPolygon(input, -distance);
}
