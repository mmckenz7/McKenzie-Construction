import { describe, expect, it } from "vitest";
import { calibrateBackgroundTransform, fittedBackgroundTransform, moveBackgroundTransform, rotateBackgroundTransform } from "../src/background";

describe("local reference image transform", () => {
  it("fits an image into the current plan while preserving its aspect ratio", () => {
    expect(fittedBackgroundTransform(2_000, 1_000, { x: 0, y: 0, width: 10_000, height: 8_000 })).toEqual({
      xMm: 700,
      yMm: 1_850,
      widthMm: 8_600,
      heightMm: 4_300,
      rotationDegrees: 0,
    });
  });

  it("calibrates uniformly around the first picked point", () => {
    expect(calibrateBackgroundTransform(
      { xMm: 1_000, yMm: 2_000, widthMm: 8_000, heightMm: 4_000, rotationDegrees: 15 },
      { xMm: 2_000, yMm: 3_000 },
      { xMm: 6_000, yMm: 3_000 },
      2_000,
    )).toEqual({ xMm: 1_500, yMm: 2_500, widthMm: 4_000, heightMm: 2_000, rotationDegrees: 15 });
  });

  it("rejects unusable calibration points and supports deterministic positioning", () => {
    const background = { xMm: 0, yMm: 0, widthMm: 1_000, heightMm: 500, rotationDegrees: 0 };
    expect(() => calibrateBackgroundTransform(background, { xMm: 1, yMm: 1 }, { xMm: 1, yMm: 1 }, 305)).toThrow(/different calibration points/i);
    expect(moveBackgroundTransform(background, 305, -610)).toEqual({ ...background, xMm: 305, yMm: -610 });
    expect(rotateBackgroundTransform(background, 370).rotationDegrees).toBe(10);
    expect(rotateBackgroundTransform(background, -190).rotationDegrees).toBe(170);
  });
});
