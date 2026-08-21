import type { PolygonPoint } from "./polygon";

function assertRectangle(hole: readonly PolygonPoint[]): void {
  if (hole.length !== 4) throw new RangeError("Direct cutout handles require a four-corner rectangle.");
}

export function moveRectangularHole(hole: readonly PolygonPoint[], delta: PolygonPoint): readonly PolygonPoint[] {
  assertRectangle(hole);
  return Object.freeze(hole.map((point) => Object.freeze({ x: point.x + delta.x, z: point.z + delta.z })));
}

export function resizeRectangularHole(hole: readonly PolygonPoint[], cornerIndex: number, pointer: PolygonPoint): readonly PolygonPoint[] {
  assertRectangle(hole);
  if (!Number.isInteger(cornerIndex) || cornerIndex < 0 || cornerIndex > 3) throw new RangeError("Cutout corner index must be 0–3.");
  const opposite = hole[(cornerIndex + 2) % 4];
  const minX = Math.min(pointer.x, opposite.x), maxX = Math.max(pointer.x, opposite.x);
  const minZ = Math.min(pointer.z, opposite.z), maxZ = Math.max(pointer.z, opposite.z);
  return Object.freeze([{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }].map((point) => Object.freeze(point)));
}
