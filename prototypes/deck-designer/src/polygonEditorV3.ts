import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";

const snap = (value: number, increment: number): number => Math.round(value / increment) * increment;

export function addCornerOnEdge(
  outer: readonly PolygonPoint[],
  edgeIndex: number,
  click: PolygonPoint,
  snapIncrement: number,
): readonly PolygonPoint[] {
  const edges = deriveGeometricPolygonEdges(outer);
  const edge = edges[edgeIndex];
  if (!edge) throw new RangeError("Select an existing outline segment before adding a corner.");
  if (edge.length < snapIncrement * 3) throw new RangeError("That segment is too short for another snapped corner.");
  const dx = (edge.end.x - edge.start.x) / edge.length;
  const dz = (edge.end.z - edge.start.z) / edge.length;
  const projected = (click.x - edge.start.x) * dx + (click.z - edge.start.z) * dz;
  const distance = Math.min(edge.length - snapIncrement, Math.max(snapIncrement, snap(projected, snapIncrement)));
  const inset = Math.max(1, snapIncrement);
  const corner = Object.freeze({
    x: snap(edge.start.x + dx * distance - edge.outward.x * inset, snapIncrement),
    z: snap(edge.start.z + dz * distance - edge.outward.z * inset, snapIncrement),
  });
  const next = [...outer];
  next.splice(edgeIndex + 1, 0, corner);
  return Object.freeze(next);
}

export function movePolygonSegment(
  outer: readonly PolygonPoint[],
  edgeIndex: number,
  perpendicularDistance: number,
  snapIncrement: number,
): readonly PolygonPoint[] {
  const edges = deriveGeometricPolygonEdges(outer);
  const edge = edges[edgeIndex];
  if (!edge) throw new RangeError("Select an existing outline segment before moving it.");
  const distance = snap(perpendicularDistance, snapIncrement);
  const movedStart = Object.freeze({ x: edge.start.x + edge.outward.x * distance, z: edge.start.z + edge.outward.z * distance });
  const movedEnd = Object.freeze({ x: edge.end.x + edge.outward.x * distance, z: edge.end.z + edge.outward.z * distance });
  const next = [...outer];
  next[edgeIndex] = movedStart;
  next[(edgeIndex + 1) % next.length] = movedEnd;
  return Object.freeze(next);
}
