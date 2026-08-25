import type { PolygonPoint } from "./polygon";

export type PhotoTraceEnvelope = Readonly<{ width: number; projection: number }>;
export type PhotoTraceEnvelopeCommit =
  | Readonly<{ kind: "invalid" | "unchanged" }>
  | Readonly<{ kind: "auto-resize" | "stage"; envelope: PhotoTraceEnvelope }>;

export function samePhotoTraceEnvelope(first: PhotoTraceEnvelope, second: PhotoTraceEnvelope): boolean {
  return Math.abs(first.width - second.width) < .01 && Math.abs(first.projection - second.projection) < .01;
}

export function validPhotoTraceEnvelope(width: number, projection: number): PhotoTraceEnvelope | null {
  if (!Number.isFinite(width) || !Number.isFinite(projection) || width < 48 || projection < 48) return null;
  return Object.freeze({ width, projection });
}

export function resolvePhotoTraceEnvelopeCommit(
  current: PhotoTraceEnvelope,
  draft: PhotoTraceEnvelope | null,
  outer: readonly PolygonPoint[],
  stairEdgeId: string | null,
): PhotoTraceEnvelopeCommit {
  if (!draft) return Object.freeze({ kind: "invalid" });
  if (samePhotoTraceEnvelope(current, draft)) return Object.freeze({ kind: "unchanged" });
  const rectangle = [{ x: 0, z: 0 }, { x: current.width, z: 0 }, { x: current.width, z: current.projection }, { x: 0, z: current.projection }];
  const untouched = !stairEdgeId && outer.length === rectangle.length && outer.every((point, index) =>
    Math.abs(point.x - rectangle[index].x) < .01 && Math.abs(point.z - rectangle[index].z) < .01);
  return Object.freeze({ kind: untouched ? "auto-resize" : "stage", envelope: draft });
}
