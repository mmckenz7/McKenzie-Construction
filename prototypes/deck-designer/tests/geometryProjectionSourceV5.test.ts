import { describe, expect, it } from "vitest";
import { deriveDeckDesignProjectionV5, type DeckPlatformGeometrySourceV5 } from "../src/designProjectionV5";
import { setEdgeFinishIntentV5 } from "../src/finishEditorV5";
import { derivePlatformGeometryV5 } from "../src/geometryV5";
import { DEFAULT_DESIGN } from "../src/model";
import { deckDesignV5ToV3Compatibility, migrateDeckDesignToV5, normalizeDeckDesignV5, type DeckDesignV5 } from "../src/modelV5";
import { addPlatformLevelV3 } from "../src/platformCommandsV3";
import rectangle from "./fixtures/rectangle-foundation.json";
import lShape from "./fixtures/l-shape-landing.json";

function geometrySource(design: DeckDesignV5, platformId: string): DeckPlatformGeometrySourceV5 {
  const projection = deriveDeckDesignProjectionV5(design);
  return Object.freeze([projection.designFingerprint, derivePlatformGeometryV5(design, platformId)]);
}

function withPlatform(design: DeckDesignV5, update: (platform: DeckDesignV5["platforms"][number]) => DeckDesignV5["platforms"][number]): DeckDesignV5 {
  return normalizeDeckDesignV5({ ...design, platforms: design.platforms.map((platform, index) => index === 0 ? update(platform) : platform) });
}

function changedDesigns(base: DeckDesignV5): readonly DeckDesignV5[] {
  const platform = base.platforms[0];
  const freeEdgeId = platform.edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
  return Object.freeze([
    migrateDeckDesignToV5({ ...DEFAULT_DESIGN, platform: { ...DEFAULT_DESIGN.platform, width: DEFAULT_DESIGN.platform.width + 24 } }),
    withPlatform(base, (item) => ({ ...item, region: { ...item.region, holes: [[{ x: 48, z: 48 }, { x: 72, z: 48 }, { x: 72, z: 72 }, { x: 48, z: 72 }]] } })),
    withPlatform(base, (item) => ({ ...item, construction: { ...item.construction, stairSystems: [{ id: "stair-system-1", locked: true, edgeId: freeEdgeId, offset: 24, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: "landing-1", locked: true, afterRiser: 3, width: 48, depth: 48, turn: "left", connections: [] }] }] } })),
    withPlatform(base, (item) => ({ ...item, construction: { ...item.construction, framing: { ...item.construction.framing, beamLines: item.construction.framing.beamLines.map((line, index) => index === 0 ? { ...line, offsetFromOutside: line.offsetFromOutside + 6 } : line) } } })),
    withPlatform(base, (item) => ({ ...item, construction: { ...item.construction, decking: { ...item.construction.decking, direction: "house_yard" } } })),
    setEdgeFinishIntentV5(base, platform.id, freeEdgeId, { fasciaEnabled: true, skirtingEnabled: true }),
    withPlatform(base, (item) => ({ ...item, elevation: item.elevation + 12 })),
  ]);
}

describe("v5 immutable geometry projection source", () => {
  it.each([DEFAULT_DESIGN, rectangle.design, lShape.design])("preserves exact projection JSON with current source reuse", (input) => {
    const design = migrateDeckDesignToV5(input);
    const source = geometrySource(design, design.platforms[0].id);
    expect(JSON.stringify(deriveDeckDesignProjectionV5(design, source))).toBe(JSON.stringify(deriveDeckDesignProjectionV5(design)));
    expect(JSON.stringify(deriveDeckDesignProjectionV5(design, source))).toBe(JSON.stringify(deriveDeckDesignProjectionV5(design, source)));
  });

  it("rejects stale same-ID geometry after every authored geometry input class changes", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const source = geometrySource(base, base.platforms[0].id);
    expect(Object.isFrozen(source)).toBe(true);
    changedDesigns(base).forEach((changed) => expect(() => deriveDeckDesignProjectionV5(changed, source)).toThrow(/stale/i));
  });

  it("preserves exact results for current dimensions, cutouts, stairs, landings, framing, direction, finishes, and elevation", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    changedDesigns(base).forEach((design) => {
      const source = geometrySource(design, design.platforms[0].id);
      expect(JSON.stringify(deriveDeckDesignProjectionV5(design, source))).toBe(JSON.stringify(deriveDeckDesignProjectionV5(design)));
    });
  });

  it("rejects wrong and cross-platform sources without affecting the default path", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const multi = migrateDeckDesignToV5(addPlatformLevelV3(deckDesignV5ToV3Compatibility(base), "platform-1", "platform-2", 72, { x: 240, z: 0 }).design);
    const first = geometrySource(multi, "platform-1");
    expect(JSON.stringify(deriveDeckDesignProjectionV5(multi, first))).toBe(JSON.stringify(deriveDeckDesignProjectionV5(multi)));
    expect(() => deriveDeckDesignProjectionV5(multi, Object.freeze([first[0], { ...first[1], platformId: "missing-platform" }]))).toThrow(/mismatched/i);
    expect(deriveDeckDesignProjectionV5(multi).platforms.map((platform) => platform.platformId)).toEqual(["platform-1", "platform-2"]);
  });
});
