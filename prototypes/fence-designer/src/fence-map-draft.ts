import { addPoint, startFenceLine, type FenceDesign, type Point } from "./model";

export type FenceMapPlacementIntent = "continue-line" | "start-line";

export function placeFenceMapPoint(
  design: FenceDesign,
  point: Point,
  segmentId: string,
  fromPointId: string | null,
  intent: FenceMapPlacementIntent,
): FenceDesign {
  return intent === "start-line"
    ? startFenceLine(design, point)
    : addPoint(design, point, segmentId, fromPointId);
}
