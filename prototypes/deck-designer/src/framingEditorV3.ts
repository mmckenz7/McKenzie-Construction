import type { DeckPlatformV3 } from "./modelV3";

type Point = Readonly<{ x: number; z: number }>;

const axisBounds = (platform: DeckPlatformV3) => {
  const values = platform.region.outer.map((point) => platform.construction.decking.direction === "left_right" ? point.z : point.x);
  return Object.freeze({ minimum: Math.min(...values), maximum: Math.max(...values) });
};

export function beamInsetBoundsV3(platform: DeckPlatformV3): Readonly<{ minimum: number; maximum: number }> {
  const bounds = axisBounds(platform);
  return Object.freeze({ minimum: 6, maximum: Math.max(6, Math.min(120, (bounds.maximum - bounds.minimum) / 2)) });
}

export function effectiveBeamInsetV3(platform: DeckPlatformV3): number {
  const bounds = beamInsetBoundsV3(platform);
  return Math.max(bounds.minimum, Math.min(bounds.maximum, platform.construction.framing.beamInset));
}

export function clampBeamInsetV3(platform: DeckPlatformV3, inset: number): number {
  if (!Number.isFinite(inset)) throw new TypeError("Beam distance must be a finite number.");
  const bounds = beamInsetBoundsV3(platform);
  return Math.max(bounds.minimum, Math.min(bounds.maximum, inset));
}

export function beamInsetFromPointV3(platform: DeckPlatformV3, point: Point, snapIncrement: number): number {
  if (!Number.isFinite(snapIncrement) || snapIncrement <= 0) throw new RangeError("Beam drag step must be greater than zero.");
  const bounds = axisBounds(platform);
  const coordinate = platform.construction.decking.direction === "left_right" ? point.z : point.x;
  const inset = Math.round((bounds.maximum - coordinate) / snapIncrement) * snapIncrement;
  return clampBeamInsetV3(platform, inset);
}
