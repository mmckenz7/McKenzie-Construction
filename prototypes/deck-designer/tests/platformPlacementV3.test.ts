import { describe, expect, it } from "vitest";
import { translatePlatformRegion } from "../src/platformPlacementV3";

describe("level-layer placement", () => {
  const region = { outer: [{ x: 0, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 96 }, { x: 0, z: 96 }], holes: [[{ x: 24, z: 24 }, { x: 48, z: 24 }, { x: 48, z: 48 }, { x: 24, z: 48 }]] } as const;

  it("moves the entire selected layer, including its cutouts, without changing shape", () => {
    const moved = translatePlatformRegion(region, { x: -18, z: 30 });
    expect(moved.outer).toEqual([{ x: -18, z: 30 }, { x: 102, z: 30 }, { x: 102, z: 126 }, { x: -18, z: 126 }]);
    expect(moved.holes[0]).toEqual([{ x: 6, z: 54 }, { x: 30, z: 54 }, { x: 30, z: 78 }, { x: 6, z: 78 }]);
    expect(translatePlatformRegion(region, { x: -18, z: 30 })).toEqual(moved);
  });

  it("rejects non-finite movement", () => {
    expect(() => translatePlatformRegion(region, { x: Number.NaN, z: 0 })).toThrow(/finite/i);
  });
});
