import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";

const snap = (value: number, increment: number): number => Math.round(value / increment) * increment;
const samePoint = (first: PolygonPoint, second: PolygonPoint): boolean =>
  Math.abs(first.x - second.x) < .01 && Math.abs(first.z - second.z) < .01;

function snapCoordinateToCorners(
  value: number,
  values: readonly number[],
  threshold: number,
): number {
  if (threshold <= 0) return value;
  const nearest = values
    .map((candidate, priority) => ({ candidate, distance: Math.abs(candidate - value), priority }))
    .filter(({ distance }) => distance <= threshold + .01)
    .sort((first, second) => first.distance - second.distance || first.priority - second.priority)[0];
  return nearest?.candidate ?? value;
}

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
  alignmentThreshold = 0,
): readonly PolygonPoint[] {
  if (!outer[cornerIndex]) throw new RangeError("Select an existing corner before moving it.");
  const next = [...outer];
  const adjacentIndexes = [(cornerIndex - 1 + outer.length) % outer.length, (cornerIndex + 1) % outer.length];
  const otherCorners = [...adjacentIndexes.map((index) => outer[index]), ...outer.filter((_, index) => index !== cornerIndex && !adjacentIndexes.includes(index))];
  next[cornerIndex] = Object.freeze({
    x: snapCoordinateToCorners(point.x, otherCorners.map((candidate) => candidate.x), alignmentThreshold),
    z: snapCoordinateToCorners(point.z, otherCorners.map((candidate) => candidate.z), alignmentThreshold),
  });
  return mergeCoincident ? mergeCoincidentNeighbors(next) : Object.freeze(next);
}

export function moveOrthogonalPolygonCorner(
  outer: readonly PolygonPoint[],
  cornerIndex: number,
  point: PolygonPoint,
  mergeCoincident = true,
  alignmentThreshold = 0,
): readonly PolygonPoint[] {
  const current = outer[cornerIndex];
  if (!current) throw new RangeError("Select an existing corner before moving it.");
  const previousIndex = (cornerIndex - 1 + outer.length) % outer.length;
  const nextIndex = (cornerIndex + 1) % outer.length;
  const previous = outer[previousIndex];
  const following = outer[nextIndex];
  const previousAxis = Math.abs(previous.x - current.x) < .01 ? "x" : Math.abs(previous.z - current.z) < .01 ? "z" : null;
  const followingAxis = Math.abs(following.x - current.x) < .01 ? "x" : Math.abs(following.z - current.z) < .01 ? "z" : null;
  if (!previousAxis || !followingAxis || previousAxis === followingAxis) {
    throw new RangeError("This corner is angled. Turn off Keep attached sides square to move it freely.");
  }
  const snappedCorner = movePolygonCorner(outer, cornerIndex, point, false, alignmentThreshold)[cornerIndex];
  const moved = [...outer];
  moved[cornerIndex] = snappedCorner;
  moved[previousIndex] = Object.freeze({ ...previous, [previousAxis]: snappedCorner[previousAxis] });
  moved[nextIndex] = Object.freeze({ ...following, [followingAxis]: snappedCorner[followingAxis] });
  return mergeCoincident ? mergeCoincidentNeighbors(moved) : Object.freeze(moved);
}

export function deriveCornerAlignmentGuides(
  outer: readonly PolygonPoint[],
  cornerIndex: number,
): Readonly<{ x: number | null; z: number | null }> {
  const corner = outer[cornerIndex];
  if (!corner) return Object.freeze({ x: null, z: null });
  const others = outer.filter((_, index) => index !== cornerIndex);
  return Object.freeze({
    x: others.some((candidate) => Math.abs(candidate.x - corner.x) < .01) ? corner.x : null,
    z: others.some((candidate) => Math.abs(candidate.z - corner.z) < .01) ? corner.z : null,
  });
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
  const requestedDistance = snap(perpendicularDistance, snapIncrement);
  const endpointIndexes = new Set([edgeIndex, (edgeIndex + 1) % outer.length]);
  const magneticDistance = outer
    .map((point, index) => ({
      index,
      distance: (point.x - edge.start.x) * edge.outward.x + (point.z - edge.start.z) * edge.outward.z,
    }))
    .filter(({ index, distance }) => !endpointIndexes.has(index) && Math.abs(distance - requestedDistance) <= snapIncrement + .01)
    .sort((first, second) => Math.abs(first.distance - requestedDistance) - Math.abs(second.distance - requestedDistance) || first.index - second.index)[0]?.distance;
  const distance = magneticDistance ?? requestedDistance;
  const movedStart = Object.freeze({ x: edge.start.x + edge.outward.x * distance, z: edge.start.z + edge.outward.z * distance });
  const movedEnd = Object.freeze({ x: edge.end.x + edge.outward.x * distance, z: edge.end.z + edge.outward.z * distance });
  const next = [...outer];
  next[edgeIndex] = movedStart;
  next[(edgeIndex + 1) % next.length] = movedEnd;
  return mergeCoincident ? mergeCoincidentNeighbors(next) : Object.freeze(next);
}

export function resizePolygonEdge(
  outer: readonly PolygonPoint[],
  edgeIndex: number,
  requestedLength: number,
  snapIncrement: number,
): readonly PolygonPoint[] {
  const edges = deriveGeometricPolygonEdges(outer);
  const edge = edges[edgeIndex];
  if (!edge) throw new RangeError("Select an existing outline segment before changing its length.");
  const length = snap(requestedLength, snapIncrement);
  if (!Number.isFinite(length) || length < snapIncrement) throw new RangeError(`Side length must be at least ${snapIncrement} inches.`);
  const direction = { x: (edge.end.x - edge.start.x) / edge.length, z: (edge.end.z - edge.start.z) / edge.length };
  const connectedEdgeIndex = (edgeIndex + 1) % edges.length;
  const connectedEdge = edges[connectedEdgeIndex];
  const alignment = connectedEdge.outward.x * direction.x + connectedEdge.outward.z * direction.z;
  if (Math.abs(alignment) < .99) throw new RangeError("Exact side length requires a square connected side; drag the corner for an angled layout.");
  return movePolygonSegment(outer, connectedEdgeIndex, (length - edge.length) / alignment, snapIncrement);
}
