import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";

export type PhotoTraceStairPreview = Readonly<{
  edgeId: string;
  offset: number;
  width: number;
  treads: readonly (readonly PolygonPoint[])[];
}>;

export function centeredStairOffset(edgeLength: number, stairWidth = 48, snapIncrement = 6): number {
  if (!Number.isFinite(edgeLength) || !Number.isFinite(stairWidth) || edgeLength < stairWidth || stairWidth <= 0) {
    throw new RangeError("The selected side is too short for the recorded stair width.");
  }
  return Math.min(edgeLength - stairWidth, Math.max(0, Math.round((edgeLength - stairWidth) / 2 / snapIncrement) * snapIncrement));
}

export function validateStairOffset(edgeLength: number, offset: number, stairWidth = 48): number {
  if (!Number.isFinite(offset) || offset < 0 || offset + stairWidth > edgeLength) {
    throw new RangeError("Stair position must keep the full stair width on the selected side.");
  }
  return offset;
}

export function derivePhotoTraceStairPreview(
  outer: readonly PolygonPoint[],
  edgeId: string,
  surfaceElevation: number,
  gradeElevation = 0,
  stairWidth = 48,
  treadDepth = 10,
  maxRiserHeight = 7.75,
  requestedOffset?: number,
): PhotoTraceStairPreview {
  const edge = deriveGeometricPolygonEdges(outer).find((candidate) => candidate.id === edgeId);
  if (!edge) throw new RangeError("The selected stair side no longer exists.");
  const offset = requestedOffset === undefined ? centeredStairOffset(edge.length, stairWidth) : validateStairOffset(edge.length, requestedOffset, stairWidth);
  const rise = surfaceElevation - gradeElevation;
  if (!Number.isFinite(rise) || rise <= 0) throw new RangeError("Deck height must remain above grade to preview stairs.");
  const riserCount = Math.ceil(rise / maxRiserHeight);
  const alongX = (edge.end.x - edge.start.x) / edge.length;
  const alongZ = (edge.end.z - edge.start.z) / edge.length;
  const start = Object.freeze({ x: edge.start.x + alongX * offset, z: edge.start.z + alongZ * offset });
  const end = Object.freeze({ x: start.x + alongX * stairWidth, z: start.z + alongZ * stairWidth });
  const treads = Object.freeze(Array.from({ length: riserCount }, (_, index) => {
    const near = treadDepth * index;
    const far = treadDepth * (index + 1);
    return Object.freeze([
      Object.freeze({ x: start.x + edge.outward.x * near, z: start.z + edge.outward.z * near }),
      Object.freeze({ x: end.x + edge.outward.x * near, z: end.z + edge.outward.z * near }),
      Object.freeze({ x: end.x + edge.outward.x * far, z: end.z + edge.outward.z * far }),
      Object.freeze({ x: start.x + edge.outward.x * far, z: start.z + edge.outward.z * far }),
    ]);
  }));
  return Object.freeze({ edgeId, offset, width: stairWidth, treads });
}
