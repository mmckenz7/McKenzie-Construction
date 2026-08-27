import type { DeckPlatformV5 } from "./modelV5";
import { deriveGeometricPolygonEdges, type PolygonEdge, type PolygonPoint } from "./polygon";
import { resizePolygonEdge } from "./polygonEditorV3";

const EPSILON = .01;
const samePoint = (a: PolygonPoint, b: PolygonPoint) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.z - b.z) <= EPSILON;
const reject = (message: string): never => { throw new RangeError(message); };

function houseEdges(platform: DeckPlatformV5): PolygonEdge[] {
  const ids = new Set(platform.edgeConditions.filter((condition) => condition.condition === "house_attachment").map((condition) => condition.edgeId));
  return deriveGeometricPolygonEdges(platform.region.outer).filter((edge) => ids.has(edge.id));
}

function outwardDistance(edge: PolygonEdge, point: PolygonPoint): number {
  return (point.x - edge.start.x) * edge.outward.x + (point.z - edge.start.z) * edge.outward.z;
}

export function assertHouseBoundariesPreservedV5(
  platform: DeckPlatformV5,
  proposedOuter: readonly PolygonPoint[],
): void {
  const proposedEdges = deriveGeometricPolygonEdges(proposedOuter);
  for (const houseEdge of houseEdges(platform)) {
    if (!proposedEdges.some((edge) => edge.id === houseEdge.id) || proposedOuter.some((point) => outwardDistance(houseEdge, point) > EPSILON)) reject("The recorded house is fixed. Move an outside side away.");
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
  if (boundaries.some((boundary) => boundary.id === edge.id)) {
    reject("The house-side length is fixed. Edit a free side.");
  }
  const touching = boundaries.filter((boundary) =>
    samePoint(edge.start, boundary.start) || samePoint(edge.start, boundary.end) ||
    samePoint(edge.end, boundary.start) || samePoint(edge.end, boundary.end));
  if (touching.length === 0) return resizePolygonEdge(platform.region.outer, edgeIndex, requestedLength, snapIncrement);
  if (touching.length > 1) reject("This side touches two house boundaries; review it first.");

  const boundary = touching[0];
  const anchored = (point: PolygonPoint) => samePoint(point, boundary.start) || samePoint(point, boundary.end);
  const startAnchored = anchored(edge.start), endAnchored = anchored(edge.end);
  if (startAnchored === endAnchored) reject("The house-side anchor is ambiguous.");
  const freeEdgeIndex = startAnchored ? (edgeIndex + 1) % edges.length : (edgeIndex - 1 + edges.length) % edges.length;
  return resizePolygonEdge(platform.region.outer, edgeIndex, requestedLength, snapIncrement, freeEdgeIndex, endAnchored);
}
