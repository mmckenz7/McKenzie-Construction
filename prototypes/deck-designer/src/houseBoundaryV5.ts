import type { DeckPlatformV5 } from "./modelV5";
import { deriveGeometricPolygonEdges, type PolygonEdge, type PolygonPoint } from "./polygon";
import { resizePolygonEdge, setPolygonEdgeAngle } from "./polygonEditorV3";

const EPSILON = .01;
const samePoint = (a: PolygonPoint, b: PolygonPoint) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.z - b.z) <= EPSILON;
const reject = (message: string): never => { throw new RangeError(message); };

function houseEdges(platform: DeckPlatformV5): PolygonEdge[] {
  const ids = new Set(platform.edgeConditions.filter((condition) => condition.condition === "house_attachment").map((condition) => condition.edgeId));
  return deriveGeometricPolygonEdges(platform.region.outer).filter((edge) => ids.has(edge.id));
}

function houseAnchorEnd(edge: PolygonEdge, boundaries: readonly PolygonEdge[]): boolean | null {
  if (boundaries.some((boundary) => boundary.id === edge.id)) reject("Fixed house side.");
  const touching = boundaries.filter((boundary) =>
    samePoint(edge.start, boundary.start) || samePoint(edge.start, boundary.end) ||
    samePoint(edge.end, boundary.start) || samePoint(edge.end, boundary.end));
  if (touching.length === 0) return null;
  if (touching.length > 1) reject("This side touches two house boundaries; review it first.");
  const boundary = touching[0];
  const anchored = (point: PolygonPoint) => samePoint(point, boundary.start) || samePoint(point, boundary.end);
  const start = anchored(edge.start), end = anchored(edge.end);
  if (start === end) reject("This house side is fixed.");
  return end;
}

function outwardDistance(edge: PolygonEdge, point: PolygonPoint): number {
  return (point.x - edge.start.x) * edge.outward.x + (point.z - edge.start.z) * edge.outward.z;
}

function remainsOnHouseBoundary(previous: PolygonEdge, proposed: PolygonEdge): boolean {
  const dx = (previous.end.x - previous.start.x) / previous.length;
  const dz = (previous.end.z - previous.start.z) / previous.length;
  const lineDistance = (point: PolygonPoint) =>
    Math.abs((point.x - previous.start.x) * dz - (point.z - previous.start.z) * dx);
  if (lineDistance(proposed.start) > EPSILON || lineDistance(proposed.end) > EPSILON) return false;
  const project = (point: PolygonPoint) =>
    (point.x - previous.start.x) * dx + (point.z - previous.start.z) * dz;
  const start = Math.min(project(proposed.start), project(proposed.end));
  const end = Math.max(project(proposed.start), project(proposed.end));
  return Math.min(previous.length, end) - Math.max(0, start) > EPSILON;
}

export function assertHouseBoundariesPreservedV5(
  platform: DeckPlatformV5,
  proposedOuter: readonly PolygonPoint[],
): void {
  const proposedEdges = deriveGeometricPolygonEdges(proposedOuter);
  for (const houseEdge of houseEdges(platform)) {
    if (!proposedEdges.some((edge) => remainsOnHouseBoundary(houseEdge, edge)) || proposedOuter.some((point) => outwardDistance(houseEdge, point) > EPSILON)) reject("The recorded house is fixed. Move an outside side away.");
  }
}

export function resizePolygonEdgeWithHouseAnchorV5(
  platform: DeckPlatformV5,
  edgeId: string,
  requestedLength: number,
  snapIncrement: number,
): readonly PolygonPoint[] {
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const edgeIndex = edges.findIndex((edge) => edge.id === edgeId);
  const edge = edges[edgeIndex];
  if (!edge) throw new RangeError("Select an existing outline segment before changing its length.");
  const boundaries = houseEdges(platform);
  const anchorEnd = houseAnchorEnd(edge, boundaries);
  if (anchorEnd === null) return resizePolygonEdge(platform.region.outer, edgeIndex, requestedLength, snapIncrement);
  const freeEdgeIndex = anchorEnd ? (edgeIndex - 1 + edges.length) % edges.length : (edgeIndex + 1) % edges.length;
  return resizePolygonEdge(platform.region.outer, edgeIndex, requestedLength, snapIncrement, freeEdgeIndex, anchorEnd);
}

export function setPolygonEdgeAngleWithHouseAnchorV5(
  platform: DeckPlatformV5,
  edgeId: string,
  requestedDegrees: number,
): readonly PolygonPoint[] {
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const edgeIndex = edges.findIndex((edge) => edge.id === edgeId);
  const edge = edges[edgeIndex];
  if (!edge) return setPolygonEdgeAngle(platform.region.outer, edgeIndex, requestedDegrees);
  const boundaries = houseEdges(platform);
  return setPolygonEdgeAngle(platform.region.outer, edgeIndex, requestedDegrees, houseAnchorEnd(edge, boundaries) ?? false);
}
