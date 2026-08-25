import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { derivePlatformGeometryV4 } from "../src/geometryV4";
import { migrateDeckDesignToV4, normalizeDeckDesignV4 } from "../src/modelV4";

describe("DeckDesign v4 conceptual beam geometry", () => {
  it("projects every authored beam line with stable IDs and its own support spacing", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV4({ ...base, platforms: [{ ...platform, construction: { ...platform.construction, framing: {
      joistSpacing: 16,
      beamLines: [
        { id: "beam-line-house", offsetFromOutside: 24, maxSupportSpacing: 72 },
        { id: "beam-line-yard", offsetFromOutside: 96, maxSupportSpacing: 48 },
      ],
    } } }] });
    const geometry = derivePlatformGeometryV4(design, platform.id);
    expect(geometry.beams.map((beam) => beam.id)).toEqual(["beam-line-house-segment-1", "beam-line-yard-segment-1"]);
    expect(geometry.supportPosts.filter((post) => post.id.startsWith("beam-line-house")).length).toBe(4);
    expect(geometry.supportPosts.filter((post) => post.id.startsWith("beam-line-yard")).length).toBe(5);
  });

  it("deterministically splits each beam around a cutout", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const platform = base.platforms[0];
    const design = normalizeDeckDesignV4({ ...base, platforms: [{ ...platform,
      region: { ...platform.region, holes: [[{ x: 72, z: 48 }, { x: 120, z: 48 }, { x: 120, z: 96 }, { x: 72, z: 96 }]] },
      construction: { ...platform.construction, framing: { joistSpacing: 16, beamLines: [{ id: "beam-line-cut", offsetFromOutside: 72, maxSupportSpacing: 72 }] } },
    }] });
    const geometry = derivePlatformGeometryV4(design, platform.id);
    expect(geometry.beams.map((beam) => beam.id)).toEqual(["beam-line-cut-segment-1", "beam-line-cut-segment-2"]);
    expect(geometry.beams.map((beam) => Math.hypot(beam.end.x - beam.start.x, beam.end.z - beam.start.z))).toEqual([72, 72]);
  });
});
