// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { resolveV3NumberFieldCommit, shouldCancelV3NumberField } from "../src/V3NumberField";

describe("shared exact number field transactions", () => {
  it("commits one changed finite value", () => {
    expect(resolveV3NumberFieldCommit("18", 16, false)).toBe(18);
  });

  it("treats blank, invalid, unchanged, and canceled drafts as no-ops", () => {
    expect(resolveV3NumberFieldCommit("", 16, false)).toBeNull();
    expect(resolveV3NumberFieldCommit("not-a-number", 16, false)).toBeNull();
    expect(resolveV3NumberFieldCommit("16", 16, false)).toBeNull();
    expect(resolveV3NumberFieldCommit("18", 16, true)).toBeNull();
  });

  it("compares against the latest recorded baseline", () => {
    expect(resolveV3NumberFieldCommit("18", 16, false)).toBe(18);
    expect(resolveV3NumberFieldCommit("18", 18, false)).toBeNull();
  });

  it("does not treat Escape as cancellation during active text composition", () => {
    expect(shouldCancelV3NumberField("Escape", false)).toBe(true);
    expect(shouldCancelV3NumberField("Escape", true)).toBe(false);
    expect(shouldCancelV3NumberField("Enter", false)).toBe(false);
  });
});
