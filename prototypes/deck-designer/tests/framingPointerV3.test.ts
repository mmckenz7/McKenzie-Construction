// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { beamInsetFromPointerDeltaV3 } from "../src/framingEditorV3";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";

const base = migrateDeckDesignToV3(DEFAULT_DESIGN);

describe("conceptual beam pointer delta", () => {
  it("moves from the recorded inset regardless of an off-center pointer-down", () => {
    expect(beamInsetFromPointerDeltaV3(base.platforms[0], 24, { x: 71, z: 103 }, { x: 71, z: 91 }, 6)).toBe(36);
  });

  it("keeps tap, sub-snap movement, and return-to-origin as exact no-ops", () => {
    expect(beamInsetFromPointerDeltaV3(base.platforms[0], 24, { x: 71, z: 103 }, { x: 71, z: 103 }, 6)).toBe(24);
    expect(beamInsetFromPointerDeltaV3(base.platforms[0], 24, { x: 71, z: 103 }, { x: 71, z: 101 }, 6)).toBe(24);
    expect(beamInsetFromPointerDeltaV3(base.platforms[0], 24, { x: 71, z: 103 }, { x: 71, z: 103 }, 6)).toBe(24);
  });

  it("follows the perpendicular axis after board-direction rotation and clamps bounds", () => {
    const platform = base.platforms[0];
    const rotated = normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, decking: { ...platform.construction.decking, direction: "house_yard" } } }] });
    expect(beamInsetFromPointerDeltaV3(rotated.platforms[0], 24, { x: 103, z: 71 }, { x: 91, z: 71 }, 6)).toBe(36);
    expect(beamInsetFromPointerDeltaV3(rotated.platforms[0], 24, { x: 103, z: 71 }, { x: -1000, z: 71 }, 6)).toBe(96);
  });
});
