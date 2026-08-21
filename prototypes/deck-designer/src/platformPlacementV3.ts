import type { PolygonRegion } from "./polygonRegion";

export type PlatformPlacementDelta = Readonly<{ x: number; z: number }>;

export function translatePlatformRegion(region: PolygonRegion, delta: PlatformPlacementDelta): PolygonRegion {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.z)) throw new TypeError("Level movement must be finite.");
  const translate = (point: Readonly<{ x: number; z: number }>) => Object.freeze({ x: point.x + delta.x, z: point.z + delta.z });
  return Object.freeze({
    outer: Object.freeze(region.outer.map(translate)),
    holes: Object.freeze(region.holes.map((hole) => Object.freeze(hole.map(translate)))),
  });
}
