import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";

const snap = (value: number, increment: number): number => Math.round(value / increment) * increment;
const samePoint = (first: PolygonPoint, second: PolygonPoint): boolean =>
  Math.abs(first.x - second.x) < .01 && Math.abs(first.z - second.z) < .01;

function mergeCoincidentNeighbors(points: readonly PolygonPoint[]): readonly PolygonPoint[] {
  const merged = points.filter((point, index) => !samePoint(point, points[(index - 1 + points.length) % points.length]));
  let changed = true;
  while (changed && merged.length >= 3) {
    changed = false;
    for (let index = 0; index < merged.length; index += 1) {
      const previous = merged[(index - 1 + merged.length) % merged.length];
      const current = merged[index];
      const next = merged[(index + 1) % merged.length];
      const cross = (current.x - previous.x) * (next.z - current.z) - (current.z - previous.z) * (next.x - current.x);
      if (Math.abs(cross) < .01) {
        merged.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  if (merged.length < 3) throw new RangeError("An outline edit cannot collapse the deck below three distinct corners.");
  return Object.freeze(merged);
}

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
  const snappedProjection = Math.min(edge.length, Math.max(0, snap(projected, snapIncrement)));
  const pointAt = (distance: number, outwardDistance = 0): PolygonPoint => Object.freeze({
    x: snap(edge.start.x + dx * distance + edge.outward.x * outwardDistance, snapIncrement),
    z: snap(edge.start.z + dz * distance + edge.outward.z * outwardDistance, snapIncrement),
  });
  const next = [...outer];
  if (snappedProjection <= halfWidth) {
    next[edgeIndex] = pointAt(0, depth);
    next.splice(edgeIndex + 1, 0, pointAt(halfWidth * 2, depth), pointAt(halfWidth * 2));
  } else if (snappedProjection >= edge.length - halfWidth) {
    next[(edgeIndex + 1) % next.length] = pointAt(edge.length, depth);
    next.splice(edgeIndex + 1, 0, pointAt(edge.length - halfWidth * 2), pointAt(edge.length - halfWidth * 2, depth));
  } else {
    const center = Math.min(edge.length - halfWidth - snapIncrement, Math.max(halfWidth + snapIncrement, snappedProjection));
    next.splice(edgeIndex + 1, 0,
      pointAt(center - halfWidth), pointAt(center - halfWidth, depth),
      pointAt(center + halfWidth, depth), pointAt(center + halfWidth));
  }
  return Object.freeze(next);
}

export function movePolygonCorner(
  outer: readonly PolygonPoint[],
  cornerIndex: number,
  point: PolygonPoint,
  mergeCoincident = true,
): readonly PolygonPoint[] {
  if (!outer[cornerIndex]) throw new RangeError("Select an existing corner before moving it.");
  const next = [...outer];
  next[cornerIndex] = Object.freeze({ x: point.x, z: point.z });
  return mergeCoincident ? mergeCoincidentNeighbors(next) : Object.freeze(next);
}

export function movePolygonSegment(
  outer: readonly PolygonPoint[],
  edgeIndex: number,
  perpendicularDistance: number,
  snapIncrement: number,
  mergeCoincident = true,
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
  return mergeCoincident ? mergeCoincidentNeighbors(next) : Object.freeze(next);
}
