import type { PolygonEdge, PolygonPoint } from "./polygon";

export type ConnectedStairAssemblyFitV3 = Readonly<{
  offset: number;
  treadDepth: number;
  topLandingDepth: number;
  turn: "straight" | "left" | "right";
  targetEdgeId: string;
  missDistance: number;
}>;

const rotate = (direction: PolygonPoint, turn: "straight" | "left" | "right"): PolygonPoint => turn === "left"
  ? { x: direction.z, z: -direction.x }
  : turn === "right" ? { x: -direction.z, z: direction.x } : direction;

function distanceToEdge(point: PolygonPoint, edge: PolygonEdge): number {
  const dx = edge.end.x - edge.start.x, dz = edge.end.z - edge.start.z;
  const lengthSquared = dx * dx + dz * dz;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - edge.start.x) * dx + (point.z - edge.start.z) * dz) / lengthSquared)) : 0;
  return Math.hypot(point.x - (edge.start.x + dx * ratio), point.z - (edge.start.z + dz * ratio));
}

export function fitConnectedStairAssemblyV3(args: Readonly<{
  sourceEdge: PolygonEdge;
  targetEdges: readonly PolygonEdge[];
  riserCount: number;
  width: number;
  preferredOffset?: number;
  allowedTurns?: readonly ("left" | "right")[];
  treadDepths?: readonly number[];
  topLandingDepth?: number;
  targetEdgeId?: string;
  snapIncrement?: number;
}>): ConnectedStairAssemblyFitV3 {
  const { sourceEdge, riserCount, width } = args;
  if (riserCount < 1 || width > sourceEdge.length) throw new RangeError("The connected stair assembly does not fit the selected upper side.");
  const targetEdges = args.targetEdgeId ? args.targetEdges.filter((edge) => edge.id === args.targetEdgeId) : args.targetEdges;
  if (!targetEdges.length) throw new RangeError("The lower level needs an outer free side for its landing.");
  const turns = args.allowedTurns ?? ["left", "right"];
  const treadDepths = args.treadDepths ?? Array.from({ length: 21 }, (_, index) => 9 + index * .25);
  const topDepth = args.topLandingDepth ?? Math.max(48, width);
  const snap = args.snapIncrement ?? 6;
  const maxOffset = sourceEdge.length - width;
  const offsets = Array.from({ length: Math.floor(maxOffset / snap) + 1 }, (_, index) => index * snap);
  if (offsets.at(-1) !== maxOffset) offsets.push(maxOffset);
  let best: (ConnectedStairAssemblyFitV3 & { score: number }) | undefined;
  const edgeDx = (sourceEdge.end.x - sourceEdge.start.x) / sourceEdge.length;
  const edgeDz = (sourceEdge.end.z - sourceEdge.start.z) / sourceEdge.length;
  for (const turn of turns) for (const treadDepth of treadDepths) for (const offset of offsets) {
    const attachment = { x: sourceEdge.start.x + edgeDx * (offset + width / 2), z: sourceEdge.start.z + edgeDz * (offset + width / 2) };
    const topCenter = { x: attachment.x + sourceEdge.outward.x * topDepth / 2, z: attachment.z + sourceEdge.outward.z * topDepth / 2 };
    const direction = rotate(sourceEdge.outward, turn);
    const flightOrigin = { x: topCenter.x + direction.x * width / 2, z: topCenter.z + direction.z * width / 2 };
    // The destination deck edge meets the near edge of its top landing: the
    // exact point where the descending flight ends. The landing then projects
    // outward from that fixed deck edge and neither platform is translated.
    const arrival = { x: flightOrigin.x + direction.x * riserCount * treadDepth, z: flightOrigin.z + direction.z * riserCount * treadDepth };
    for (const targetEdge of targetEdges) {
      // The landing's near edge is centered at arrival and spans `width`.
      // Subtracting its half-width turns centerline distance into edge-clearance.
      const missDistance = Math.max(0, distanceToEdge(arrival, targetEdge) - width / 2);
      const perpendicularity = 1 - Math.abs(direction.x * targetEdge.outward.x + direction.z * targetEdge.outward.z);
      const preference = Math.abs(treadDepth - 10) * 2 + perpendicularity * 5 + Math.abs(offset - (args.preferredOffset ?? 48)) / 120;
      const score = missDistance * 1000 + preference;
      if (!best || score < best.score) best = { offset, treadDepth, topLandingDepth: topDepth, turn, targetEdgeId: targetEdge.id, missDistance, score };
    }
  }
  if (!best || best.missDistance > 6) throw new RangeError("These fixed deck positions need a different stair side, another landing, or a level-position adjustment before they can connect exactly.");
  const { score: _score, ...fit } = best;
  return Object.freeze(fit);
}
