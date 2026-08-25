export type PlanPosition = Readonly<{ xMm: number; yMm: number }>;

export type BackgroundTransform = Readonly<{
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDegrees: number;
}>;

export function fittedBackgroundTransform(
  imageWidthPx: number,
  imageHeightPx: number,
  view: Readonly<{ x: number; y: number; width: number; height: number }>,
): BackgroundTransform {
  if (!Number.isFinite(imageWidthPx) || imageWidthPx <= 0 || !Number.isFinite(imageHeightPx) || imageHeightPx <= 0) throw new RangeError("The reference image needs valid dimensions.");
  const scale = Math.min(view.width * 0.86 / imageWidthPx, view.height * 0.86 / imageHeightPx);
  const widthMm = Math.max(1, Math.round(imageWidthPx * scale));
  const heightMm = Math.max(1, Math.round(imageHeightPx * scale));
  return Object.freeze({
    xMm: Math.round(view.x + (view.width - widthMm) / 2),
    yMm: Math.round(view.y + (view.height - heightMm) / 2),
    widthMm,
    heightMm,
    rotationDegrees: 0,
  });
}

export function calibrateBackgroundTransform(
  background: BackgroundTransform,
  first: PlanPosition,
  second: PlanPosition,
  knownDistanceMm: number,
): BackgroundTransform {
  if (!Number.isSafeInteger(knownDistanceMm) || knownDistanceMm <= 0) throw new RangeError("Calibration distance must be greater than zero.");
  const currentDistance = Math.hypot(second.xMm - first.xMm, second.yMm - first.yMm);
  if (currentDistance < 1) throw new RangeError("Choose two different calibration points.");
  const scale = knownDistanceMm / currentDistance;
  if (!Number.isFinite(scale) || scale < 0.01 || scale > 100) throw new RangeError("The calibration change is too large. Check the selected points and known distance.");
  const centerX = background.xMm + background.widthMm / 2;
  const centerY = background.yMm + background.heightMm / 2;
  const nextWidth = Math.max(1, Math.round(background.widthMm * scale));
  const nextHeight = Math.max(1, Math.round(background.heightMm * scale));
  const nextCenterX = first.xMm + (centerX - first.xMm) * scale;
  const nextCenterY = first.yMm + (centerY - first.yMm) * scale;
  return Object.freeze({
    ...background,
    xMm: Math.round(nextCenterX - nextWidth / 2),
    yMm: Math.round(nextCenterY - nextHeight / 2),
    widthMm: nextWidth,
    heightMm: nextHeight,
  });
}

export function moveBackgroundTransform(background: BackgroundTransform, dxMm: number, dyMm: number): BackgroundTransform {
  if (!Number.isSafeInteger(dxMm) || !Number.isSafeInteger(dyMm)) throw new TypeError("Background movement must use whole millimeters.");
  return Object.freeze({ ...background, xMm: background.xMm + dxMm, yMm: background.yMm + dyMm });
}

export function rotateBackgroundTransform(background: BackgroundTransform, rotationDegrees: number): BackgroundTransform {
  if (!Number.isFinite(rotationDegrees)) throw new TypeError("Background rotation must be a number.");
  const normalized = ((rotationDegrees % 360) + 360) % 360;
  return Object.freeze({ ...background, rotationDegrees: normalized > 180 ? normalized - 360 : normalized });
}
