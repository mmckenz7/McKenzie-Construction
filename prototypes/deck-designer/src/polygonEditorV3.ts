import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";

const snap = (value: number, increment: number): number => Math.round(value / increment) * increment;

export function addBumpoutOnEdge(
  outer: readonly PolygonPoint[],
  edgeIndex: number,
  click: PolygonPoint,
  snapIncrement: number,
): readonly PolygonPoint[] {
  const edges = deriveGeometricPolygonEdges(outer);
  const edge = edges[edgeIndex];
  if (!edge) throw new RangeError("Select an existing outline segment before adding a corner.");
  const halfWidth = Math.max(12, snapIncrement * 2);
  const depth = Math.max(6, snapIncrement);
  if (edge.length < halfWidth * 2 + snapIncrement * 2) throw new RangeError("That segment is too short for a rectangular bumpout.");
  const dx = (edge.end.x - edge.start.x) / edge.length;
  const dz = (edge.end.z - edge.start.z) / edge.length;
  const projected = (click.x - edge.start.x) * dx + (click.z - edge.start.z) * dz;
  const center = Math.min(edge.length - halfWidth - snapIncrement, Math.max(halfWidth + snapIncrement, snap(projected, snapIncrement)));
  const pointAt = (distance: number, outwardDistance = 0): PolygonPoint => Object.freeze({
    x: snap(edge.start.x + dx * distance + edge.outward.x * outwardDistance, snapIncrement),
    z: snap(edge.start.z + dz * distance + edge.outward.z * outwardDistance, snapIncrement),
  });
  const entry = pointAt(center - halfWidth);
  const outerEntry = pointAt(center - halfWidth, depth);
  const outerExit = pointAt(center + halfWidth, depth);
  const exit = pointAt(center + halfWidth);
  const next = [...outer];
  next.splice(edgeIndex + 1, 0, entry, outerEntry, outerExit, exit);
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
