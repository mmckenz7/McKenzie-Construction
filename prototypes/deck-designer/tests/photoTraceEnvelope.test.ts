// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { rectangleTrace } from "../src/PhotoOutlineTracer";
import { resolvePhotoTraceEnvelopeCommit, samePhotoTraceEnvelope, validPhotoTraceEnvelope } from "../src/photoTraceEnvelope";

const current = Object.freeze({ width: 240, projection: 144 });

describe("temporary photo trace envelope staging", () => {
  it("rejects partial or undersized drafts without changing the current envelope", () => {
    expect(validPhotoTraceEnvelope(Number.NaN, 144)).toBeNull();
    expect(validPhotoTraceEnvelope(36, 144)).toBeNull();
    expect(resolvePhotoTraceEnvelopeCommit(current, null, rectangleTrace(240, 144), null)).toEqual({ kind: "invalid" });
  });

  it("auto-resizes only an untouched rectangle without temporary stairs", () => {
    const next = Object.freeze({ width: 264, projection: 156 });
    expect(resolvePhotoTraceEnvelopeCommit(current, next, rectangleTrace(240, 144), null)).toEqual({ kind: "auto-resize", envelope: next });
    expect(samePhotoTraceEnvelope(current, { width: 240, projection: 144 })).toBe(true);
  });

  it("stages a changed size when custom corners or temporary stairs exist", () => {
    const next = Object.freeze({ width: 264, projection: 144 });
    const custom = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 144 }, { x: 120, z: 144 }, { x: 120, z: 168 }, { x: 0, z: 168 }];
    expect(resolvePhotoTraceEnvelopeCommit(current, next, custom, null)).toEqual({ kind: "stage", envelope: next });
    expect(resolvePhotoTraceEnvelopeCommit(current, next, rectangleTrace(240, 144), "edge:temporary")).toEqual({ kind: "stage", envelope: next });
  });

  it("clears pending state when drafts return to the measured envelope", () => {
    expect(resolvePhotoTraceEnvelopeCommit(current, { width: 240, projection: 144 }, rectangleTrace(240, 144), "edge:temporary")).toEqual({ kind: "unchanged" });
  });
});
