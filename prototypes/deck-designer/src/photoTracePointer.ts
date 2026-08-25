import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { movePolygonCorner, movePolygonSegment } from "./polygonEditorV3";

function snappedDelta(value: number, snapIncrement: number): number {
  if (!Number.isFinite(snapIncrement) || snapIncrement <= 0) throw new RangeError("Photo trace drag step must be greater than zero.");
  return Math.round(value / snapIncrement) * snapIncrement;
}

export function samePhotoTrace(left: readonly PolygonPoint[], right: readonly PolygonPoint[]): boolean {
  return left.length === right.length && left.every((point, index) => point.x === right[index].x && point.z === right[index].z);
}

export function photoTraceCornerFromPointer(
  outer: readonly PolygonPoint[],
  index: number,
  pointerDown: PolygonPoint,
  pointer: PolygonPoint,
  snapIncrement: number,
  constrainHouseLine = false,
): readonly PolygonPoint[] {
  const corner = outer[index];
  if (!corner) throw new RangeError("Choose an existing corner before moving it.");
  const target = Object.freeze({
    x: corner.x + snappedDelta(pointer.x - pointerDown.x, snapIncrement),
    z: constrainHouseLine ? 0 : corner.z + snappedDelta(pointer.z - pointerDown.z, snapIncrement),
  });
  if (target.x === corner.x && target.z === corner.z) return outer;
  return movePolygonCorner(outer, index, target, false, 0);
}

export function photoTraceSegmentFromPointer(
  outer: readonly PolygonPoint[],
  index: number,
  pointerDown: PolygonPoint,
  pointer: PolygonPoint,
  snapIncrement: number,
): readonly PolygonPoint[] {
  const edge = deriveGeometricPolygonEdges(outer)[index];
  if (!edge) throw new RangeError("Choose an existing segment before moving it.");
  const projection = (pointer.x - pointerDown.x) * edge.outward.x + (pointer.z - pointerDown.z) * edge.outward.z;
  const distance = snappedDelta(projection, snapIncrement);
  if (distance === 0) return outer;
  return movePolygonSegment(outer, index, distance, snapIncrement, false);
}

export function photoTraceStairOffsetFromPointer(
  edge: Readonly<{ start: PolygonPoint; end: PolygonPoint; length: number }>,
  startingOffset: number,
  stairWidth: number,
  pointerDown: PolygonPoint,
  pointer: PolygonPoint,
  snapIncrement: number,
): number {
  if (!Number.isFinite(snapIncrement) || snapIncrement <= 0) throw new RangeError("Photo trace drag step must be greater than zero.");
  if (!Number.isFinite(startingOffset) || !Number.isFinite(stairWidth) || stairWidth <= 0 || stairWidth > edge.length) {
    throw new RangeError("Temporary stair placement must fit on its selected segment.");
  }
  const alongX = (edge.end.x - edge.start.x) / edge.length;
  const alongZ = (edge.end.z - edge.start.z) / edge.length;
  const alongDelta = (pointer.x - pointerDown.x) * alongX + (pointer.z - pointerDown.z) * alongZ;
  const offset = Math.round((startingOffset + alongDelta) / snapIncrement) * snapIncrement;
  return Math.max(0, Math.min(edge.length - stairWidth, offset));
}
