import { describe, expect, it } from "vitest";
import { createMeasurementProvenance, MEASUREMENT_PROVENANCE_MATRIX } from "../src/measurement-provenance";

describe("measurement provenance and verification", () => {
  it("keeps phone GPS field-captured but not field-verified", () => {
    const provenance = createMeasurementProvenance({
      source: "gps",
      captureContext: "field_captured",
      verification: "estimated",
      observationId: "gps-observation-1",
      correctionId: null,
      reportedAccuracyMm: "2500",
    });
    expect(provenance).toMatchObject({ source: "gps", captureContext: "field_captured", verification: "estimated" });
    expect(() => createMeasurementProvenance({ ...provenance, verification: "field_verified" })).toThrow("gps cannot use field_verified");
  });

  it("requires explicit verification for Moasure regardless of reported accuracy", () => {
    const base = {
      source: "moasure" as const,
      captureContext: "field_captured" as const,
      observationId: "moasure-observation-1",
      correctionId: null,
      reportedAccuracyMm: "10",
    };
    expect(createMeasurementProvenance({ ...base, verification: "estimated" })).toMatchObject({ verification: "estimated" });
    expect(createMeasurementProvenance({ ...base, verification: "field_verified" })).toMatchObject({ verification: "field_verified" });
  });

  it("requires observations and correction evidence", () => {
    expect(() => createMeasurementProvenance({
      source: "parcel", captureContext: "remote_reference", verification: "preliminary", observationId: null, correctionId: null, reportedAccuracyMm: null,
    })).toThrow("requires an observation");
    expect(() => createMeasurementProvenance({
      source: "manual", captureContext: "field_captured", verification: "manually_corrected", observationId: "manual-observation-1", correctionId: null, reportedAccuracyMm: null,
    })).toThrow("require a correction record");
  });

  it("keeps source, capture context, confidence, and verification independent", () => {
    expect(MEASUREMENT_PROVENANCE_MATRIX.aerial_map).toMatchObject({ captureContext: "remote_reference", allowedVerification: ["preliminary", "estimated"] });
    expect(MEASUREMENT_PROVENANCE_MATRIX.moasure.captureContext).toBe("field_captured");
    expect(MEASUREMENT_PROVENANCE_MATRIX.lidar.allowedVerification).toContain("field_verified");
    expect(MEASUREMENT_PROVENANCE_MATRIX.cad.allowedVerification).toContain("preliminary");
  });
});
