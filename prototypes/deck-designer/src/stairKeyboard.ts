export type StairKeyboardMove = Readonly<{ handled: boolean; offset: number }>;

type Point = Readonly<{ x: number; z: number }>;
type StairPosition = Readonly<{ locked: boolean; offset: number; width: number }>;
type StairEdge = Readonly<{ start: Point; end: Point; length: number }>;

export function stairKeyboardMove(stair: StairPosition, edge: StairEdge, key: string, snapIncrement: number): StairKeyboardMove {
  if (stair.locked || !Number.isFinite(snapIncrement) || snapIncrement <= 0 || !Number.isFinite(edge.length) || edge.length < stair.width) {
    return Object.freeze({ handled: false, offset: stair.offset });
  }
  const dx = edge.end.x - edge.start.x, dz = edge.end.z - edge.start.z;
  const horizontal = Math.abs(dx) >= Math.abs(dz);
  const negativeKey = horizontal ? "ArrowLeft" : "ArrowUp";
  const positiveKey = horizontal ? "ArrowRight" : "ArrowDown";
  if (key !== negativeKey && key !== positiveKey) return Object.freeze({ handled: false, offset: stair.offset });
  const axisDirection = horizontal ? Math.sign(dx) : Math.sign(dz);
  if (axisDirection === 0) return Object.freeze({ handled: false, offset: stair.offset });
  const visualDirection = key === positiveKey ? 1 : -1;
  const maximum = edge.length - stair.width;
  const offset = Math.min(maximum, Math.max(0, stair.offset + visualDirection * axisDirection * snapIncrement));
  return Object.freeze({ handled: true, offset });
}
