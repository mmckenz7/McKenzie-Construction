export type MeasurementSource = "aerial_map" | "customer_drawn" | "parcel" | "gps" | "manual" | "laser" | "moasure" | "lidar" | "cad" | "derived";
export type CaptureContext = "remote_reference" | "customer_supplied" | "field_captured" | "derived";
export type VerificationState = "preliminary" | "estimated" | "field_verified" | "manually_corrected";

export type MeasurementProvenance = Readonly<{
  source: MeasurementSource;
  captureContext: CaptureContext;
  verification: VerificationState;
  observationId: string | null;
  correctionId: string | null;
  reportedAccuracyMm: string | null;
}>;

const matrixEntry = (captureContext: CaptureContext, allowedVerification: readonly VerificationState[], observationRequired: boolean) => Object.freeze({
  captureContext,
  allowedVerification: Object.freeze(allowedVerification),
  observationRequired,
});

export const MEASUREMENT_PROVENANCE_MATRIX: Readonly<Record<MeasurementSource, Readonly<{
  captureContext: CaptureContext;
  allowedVerification: readonly VerificationState[];
  observationRequired: boolean;
}>>> = Object.freeze({
  aerial_map: matrixEntry("remote_reference", ["preliminary", "estimated"], true),
  customer_drawn: matrixEntry("customer_supplied", ["preliminary", "estimated"], true),
  parcel: matrixEntry("remote_reference", ["preliminary", "estimated"], true),
  gps: matrixEntry("field_captured", ["preliminary", "estimated", "manually_corrected"], true),
  manual: matrixEntry("field_captured", ["field_verified", "manually_corrected"], true),
  laser: matrixEntry("field_captured", ["field_verified", "manually_corrected"], true),
  moasure: matrixEntry("field_captured", ["estimated", "field_verified", "manually_corrected"], true),
  lidar: matrixEntry("field_captured", ["preliminary", "estimated", "field_verified", "manually_corrected"], true),
  cad: matrixEntry("remote_reference", ["preliminary", "estimated", "field_verified", "manually_corrected"], true),
  derived: matrixEntry("derived", ["preliminary", "estimated", "field_verified", "manually_corrected"], false),
});

function optionalId(value: string | null, label: string) {
  if (value === null) return null;
  const result = value.trim();
  if (!result || result.length > 120) throw new TypeError(`${label} is invalid.`);
  return result;
}

export function createMeasurementProvenance(input: MeasurementProvenance): MeasurementProvenance {
  const policy = MEASUREMENT_PROVENANCE_MATRIX[input.source];
  if (input.captureContext !== policy.captureContext) throw new TypeError(`${input.source} requires ${policy.captureContext} capture context.`);
  if (!policy.allowedVerification.includes(input.verification)) throw new TypeError(`${input.source} cannot use ${input.verification} verification.`);
  const observationId = optionalId(input.observationId, "Observation ID");
  const correctionId = optionalId(input.correctionId, "Correction ID");
  if (policy.observationRequired && observationId === null) throw new TypeError(`${input.source} requires an observation.`);
  if (input.verification === "manually_corrected" && correctionId === null) throw new TypeError("Manually corrected measurements require a correction record.");
  if (input.verification !== "manually_corrected" && correctionId !== null) throw new TypeError("A correction record requires manually corrected verification.");
  if (input.reportedAccuracyMm !== null && !/^(0|[1-9][0-9]*)$/.test(input.reportedAccuracyMm)) throw new TypeError("Reported accuracy must be a nonnegative integer-millimeter string.");
  return Object.freeze({ ...input, observationId, correctionId });
}
