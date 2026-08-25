import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveWarningSelectionV5 } from "../src/warningLocatorV5";
import { migrateDeckDesignToV5, normalizeDeckDesignV5 } from "../src/modelV5";
import type { GeometryWarningV5 } from "../src/geometryWarningsV5";

describe("v5 contextual warning locator", () => {
  it("selects the exact cutout and beam from stable geometry IDs", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV5({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes: [[
      { x: 72, z: 48 }, { x: 120, z: 48 }, { x: 120, z: 84 }, { x: 72, z: 84 },
    ]] } }] });
    const warning: GeometryWarningV5 = Object.freeze({ id: "beam-note", severity: "clearance", geometryIds: Object.freeze(["beam-line-1", "platform-1:hole-1"]), message: "Review beam and cutout." });
    expect(deriveWarningSelectionV5(design.platforms[0], warning)).toEqual({ holeIndex: 0, beamLineId: "beam-line-1", stairSystemId: null, edgeId: null });
  });

  it("fails closed when warning IDs are stale", () => {
    const platform = migrateDeckDesignToV5(DEFAULT_DESIGN).platforms[0];
    const warning: GeometryWarningV5 = Object.freeze({ id: "stale", severity: "clearance", geometryIds: Object.freeze(["beam-missing", "platform-1:hole-9"]), message: "Stale references." });
    expect(deriveWarningSelectionV5(platform, warning)).toEqual({ holeIndex: null, beamLineId: null, stairSystemId: null, edgeId: null });
  });
});
