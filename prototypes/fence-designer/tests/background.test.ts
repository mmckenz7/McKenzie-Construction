import { describe, expect, it } from "vitest";
import { calibrateBackgroundTransform, fittedBackgroundTransform, moveBackgroundTransform, rotateBackgroundTransform, straightenBackgroundFromHouseCorners } from "../src/background";

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

  it("straightens a traced house's first wall to the grid and returns its measured footprint", () => {
    const result = straightenBackgroundFromHouseCorners(
      { xMm: 0, yMm: 0, widthMm: 20_000, heightMm: 20_000, rotationDegrees: 0 },
      [{ xMm: 5_000, yMm: 5_000 }, { xMm: 11_000, yMm: 8_000 }, { xMm: 9_000, yMm: 12_000 }, { xMm: 3_000, yMm: 9_000 }],
    );
    expect(result.transform.rotationDegrees).toBeCloseTo(-26.565, 3);
    expect(result.house).toMatchObject({ lengthMm: 6_708, widthMm: 4_472 });
    expect(Math.abs(result.corners[0].yMm - result.corners[1].yMm)).toBeLessThanOrEqual(1);
  });

  it("requires four usable house corners", () => {
    const background = { xMm: 0, yMm: 0, widthMm: 10_000, heightMm: 10_000, rotationDegrees: 0 };
    expect(() => straightenBackgroundFromHouseCorners(background, [])).toThrow(/four house corners/i);
    expect(() => straightenBackgroundFromHouseCorners(background, [{ xMm: 0, yMm: 0 }, { xMm: 1, yMm: 0 }, { xMm: 1, yMm: 1 }, { xMm: 0, yMm: 1 }])).toThrow(/one foot/i);
  });
});
