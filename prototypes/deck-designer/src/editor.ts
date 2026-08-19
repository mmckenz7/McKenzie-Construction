import type { DeckDesign } from "./model";

export type PlatformHandle = "width" | "projection" | "cutout";
export type PlatformDimensionUpdate = Readonly<{
  width?: number;
  projection?: number;
  cutoutWidth?: number;
  cutoutDepth?: number;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapDimension(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    throw new RangeError("Snap values must be finite and the increment must be positive.");
  }
  return Math.round((value / increment) + Number.EPSILON) * increment;
}

function stairSpan(design: DeckDesign, edgeId: DeckDesign["construction"]["stairs"]["edgeId"]): number {
  const stairs = design.construction.stairs;
  return stairs.enabled && stairs.edgeId === edgeId ? stairs.offset + stairs.width : 0;
}

export function dimensionsFromHandle(
  design: DeckDesign,
  handle: PlatformHandle,
  point: Readonly<{ x: number; z: number }>,
  snapIncrement: number,
): PlatformDimensionUpdate {
  const platform = design.platform;
  if (handle === "width") {
    const frontRequirement = stairSpan(design, "front");
    const minimum = platform.kind === "l-shape"
      ? Math.max(48, platform.cutoutWidth + 24, platform.cutoutWidth + frontRequirement)
      : Math.max(48, frontRequirement);
    return Object.freeze({ width: clamp(snapDimension(point.x, snapIncrement), minimum, 1200) });
  }
  if (handle === "projection") {
    const leftRequirement = stairSpan(design, "left");
    const rightRequirement = stairSpan(design, "right");
    const minimum = platform.kind === "l-shape"
      ? Math.max(48, design.construction.framing.beamInset + snapIncrement, platform.cutoutDepth + 24, platform.cutoutDepth + rightRequirement, leftRequirement)
      : Math.max(48, design.construction.framing.beamInset + snapIncrement, leftRequirement, rightRequirement);
    return Object.freeze({ projection: clamp(snapDimension(point.z, snapIncrement), minimum, 600) });
  }

  const requiredCutoutWidth = Math.max(12, stairSpan(design, "notch-horizontal"));
  const requiredCutoutDepth = Math.max(12, stairSpan(design, "notch-vertical"));
  const maximumCutoutWidth = Math.min(
    480,
    platform.width - 24,
    platform.width - stairSpan(design, "front"),
  );
  const maximumCutoutDepth = Math.min(
    480,
    platform.projection - 24,
    platform.projection - stairSpan(design, "right"),
  );
  return Object.freeze({
    cutoutWidth: clamp(snapDimension(platform.width - point.x, snapIncrement), requiredCutoutWidth, maximumCutoutWidth),
    cutoutDepth: clamp(snapDimension(platform.projection - point.z, snapIncrement), requiredCutoutDepth, maximumCutoutDepth),
  });
}
