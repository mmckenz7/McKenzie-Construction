import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { movePolygonCorner, movePolygonSegment } from "./polygonEditorV3";

export type PhotoTraceKeyboardMove = Readonly<{
  handled: boolean;
  outer: readonly PolygonPoint[];
}>;

const arrowDirections: Readonly<Record<string, PolygonPoint>> = Object.freeze({
  ArrowLeft: Object.freeze({ x: -1, z: 0 }),
  ArrowRight: Object.freeze({ x: 1, z: 0 }),
  ArrowUp: Object.freeze({ x: 0, z: -1 }),
  ArrowDown: Object.freeze({ x: 0, z: 1 }),
});

export function photoTraceCornerKeyboardMove(
  outer: readonly PolygonPoint[],
  index: number,
  key: string,
  snapIncrement: number,
  constrainHouseLine = false,
): PhotoTraceKeyboardMove {
  const direction = arrowDirections[key];
  if (!direction) return Object.freeze({ handled: false, outer });
  const corner = outer[index];
  if (!corner) throw new RangeError("Choose an existing corner before moving it.");
  const target = Object.freeze({
    x: corner.x + direction.x * snapIncrement,
    z: constrainHouseLine ? 0 : corner.z + direction.z * snapIncrement,
  });
  if (target.x === corner.x && target.z === corner.z) return Object.freeze({ handled: true, outer });
  return Object.freeze({ handled: true, outer: movePolygonCorner(outer, index, target, false, 0) });
}

export function photoTraceSegmentKeyboardMove(
  outer: readonly PolygonPoint[],
  index: number,
  key: string,
  snapIncrement: number,
): PhotoTraceKeyboardMove {
  const direction = arrowDirections[key];
  if (!direction) return Object.freeze({ handled: false, outer });
  const edge = deriveGeometricPolygonEdges(outer)[index];
  if (!edge) throw new RangeError("Choose an existing segment before moving it.");
  const projection = direction.x * edge.outward.x + direction.z * edge.outward.z;
  if (Math.abs(projection) < .5) return Object.freeze({ handled: false, outer });
  return Object.freeze({
    handled: true,
    outer: movePolygonSegment(outer, index, Math.sign(projection) * snapIncrement, snapIncrement, false),
  });
}
