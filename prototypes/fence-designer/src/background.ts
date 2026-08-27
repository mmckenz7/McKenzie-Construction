export type PlanPosition = Readonly<{ xMm: number; yMm: number }>;

export type BackgroundTransform = Readonly<{
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDegrees: number;
}>;

export type ReferenceBackground = Readonly<{
  src: string;
  name: string;
  transform: BackgroundTransform;
  opacity: number;
  locked: boolean;
  calibrated: boolean;
}>;

export const SCALE_VERIFICATION_PERCENT_TOLERANCE = 1;
export const SCALE_VERIFICATION_MIN_TOLERANCE_MM = 152;

export type ScaleVerification = Readonly<{
  knownDistanceMm: number;
  measuredDistanceMm: number;
  residualMm: number;
  residualPercent: number;
  toleranceMm: number;
  passed: boolean;
}>;

export type ScaleCalibrationState =
  | Readonly<{ status: "uncalibrated"; provenance: "none" }>
  | Readonly<{ status: "scale-set"; provenance: "user-known-line" | "loaded-local-transform"; primaryKnownDistanceMm: number | null }>
  | Readonly<{ status: "verified" | "failed"; provenance: "two-user-known-lines"; primaryKnownDistanceMm: number | null; verification: ScaleVerification }>;

export const UNCALIBRATED_SCALE_STATE: ScaleCalibrationState = Object.freeze({ status: "uncalibrated", provenance: "none" });

export function initialScaleCalibrationState(reference: ReferenceBackground | null): ScaleCalibrationState {
  return reference?.calibrated
    ? Object.freeze({ status: "scale-set", provenance: "loaded-local-transform", primaryKnownDistanceMm: null })
    : UNCALIBRATED_SCALE_STATE;
}

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

export function verifyBackgroundScale(
  first: PlanPosition,
  second: PlanPosition,
  knownDistanceMm: number,
  percentTolerance = SCALE_VERIFICATION_PERCENT_TOLERANCE,
  minimumToleranceMm = SCALE_VERIFICATION_MIN_TOLERANCE_MM,
): ScaleVerification {
  if (!Number.isSafeInteger(knownDistanceMm) || knownDistanceMm <= 0) throw new RangeError("Verification distance must be greater than zero.");
  if (!Number.isFinite(percentTolerance) || percentTolerance <= 0 || percentTolerance > 100 || !Number.isSafeInteger(minimumToleranceMm) || minimumToleranceMm < 0) throw new RangeError("Scale verification tolerance is invalid.");
  const measuredDistanceMm = Math.round(Math.hypot(second.xMm - first.xMm, second.yMm - first.yMm));
  if (measuredDistanceMm < 1) throw new RangeError("Choose two different verification points.");
  const residualMm = measuredDistanceMm - knownDistanceMm;
  const residualPercent = Math.abs(residualMm) / knownDistanceMm * 100;
  const toleranceMm = Math.max(minimumToleranceMm, Math.round(knownDistanceMm * percentTolerance / 100));
  return Object.freeze({ knownDistanceMm, measuredDistanceMm, residualMm, residualPercent, toleranceMm, passed: Math.abs(residualMm) <= toleranceMm });
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

export function straightenBackgroundFromHouseCorners(background: BackgroundTransform, corners: readonly PlanPosition[]) {
  if (corners.length !== 4) throw new RangeError("Mark all four house corners before straightening the reference.");
  const distance = (first: PlanPosition, second: PlanPosition) => Math.hypot(second.xMm - first.xMm, second.yMm - first.yMm);
  const lengthMm = Math.round((distance(corners[0], corners[1]) + distance(corners[2], corners[3])) / 2);
  const widthMm = Math.round((distance(corners[1], corners[2]) + distance(corners[3], corners[0])) / 2);
  if (lengthMm < 305 || widthMm < 305) throw new RangeError("The traced house must be at least one foot in both directions.");
  const deltaRadians = -Math.atan2(corners[1].yMm - corners[0].yMm, corners[1].xMm - corners[0].xMm);
  const centerX = background.xMm + background.widthMm / 2;
  const centerY = background.yMm + background.heightMm / 2;
  const cosine = Math.cos(deltaRadians); const sine = Math.sin(deltaRadians);
  const straightenedCorners = corners.map((point) => {
    const dx = point.xMm - centerX; const dy = point.yMm - centerY;
    return Object.freeze({ xMm: Math.round(centerX + dx * cosine - dy * sine), yMm: Math.round(centerY + dx * sine + dy * cosine) });
  });
  return Object.freeze({
    transform: rotateBackgroundTransform(background, background.rotationDegrees + deltaRadians * 180 / Math.PI),
    house: Object.freeze({ xMm: Math.min(...straightenedCorners.map(({ xMm }) => xMm)), yMm: Math.min(...straightenedCorners.map(({ yMm }) => yMm)), lengthMm, widthMm }),
    corners: Object.freeze(straightenedCorners),
  });
}
