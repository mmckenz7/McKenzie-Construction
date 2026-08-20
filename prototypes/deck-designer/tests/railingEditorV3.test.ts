import { describe, expect, it } from "vitest";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { DEFAULT_DESIGN } from "../src/model";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { railingAssemblySummary, railingStageSummary, toggleRailingOnExactEdge } from "../src/railingEditorV3";

describe("dedicated v3 railing stage", () => {
  const platform = migrateDeckDesignToV3(DEFAULT_DESIGN).platforms[0];

  it("toggles only the selected exact free edge", () => {
    const edgeId = platform.edgeConditions.find((item) => item.condition === "free")!.edgeId;
    const removed = toggleRailingOnExactEdge(platform, edgeId);
    expect(removed.enabledEdgeIds).not.toContain(edgeId);
    const restored = toggleRailingOnExactEdge({ ...platform, construction: { ...platform.construction, railing: removed } }, edgeId);
    expect(restored.enabledEdgeIds).toContain(edgeId);
  });

  it("rejects a house side and missing side", () => {
    const houseEdgeId = platform.edgeConditions.find((item) => item.condition === "house_attachment")!.edgeId;
    expect(() => toggleRailingOnExactEdge(platform, houseEdgeId)).toThrow(/house side/i);
    expect(() => toggleRailingOnExactEdge(platform, "missing-edge")).toThrow(/no longer exists/i);
  });

  it("keeps enabled edge order deterministic regardless of tap order", () => {
    const cleared = { ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [] } } };
    const free = cleared.edgeConditions.filter((item) => item.condition === "free").map((item) => item.edgeId);
    const firstThenLast = toggleRailingOnExactEdge({ ...cleared, construction: { ...cleared.construction, railing: toggleRailingOnExactEdge(cleared, free[0]) } }, free.at(-1)!);
    const lastThenFirst = toggleRailingOnExactEdge({ ...cleared, construction: { ...cleared.construction, railing: toggleRailingOnExactEdge(cleared, free.at(-1)!) } }, free[0]);
    expect(firstThenLast.enabledEdgeIds).toEqual(lastThenFirst.enabledEdgeIds);
    expect(railingStageSummary({ ...cleared, construction: { ...cleared.construction, railing: firstThenLast } })).toEqual({ freeEdgeCount: free.length, enabledEdgeCount: 2 });
  });

  it("reports deck, stair, and landing railings as separate deterministic groups", () => {
    const base = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const withLanding = {
      ...base,
      platforms: [{
        ...base.platforms[0],
        construction: {
          ...base.platforms[0].construction,
          stairs: { ...base.platforms[0].construction.stairs, enabled: true, landingEnabled: true, landingDepth: 48 },
        },
      }],
    };
    const normalized = migrateDeckDesignToV3(withLanding);
    const geometry = derivePlatformGeometryV3(normalized, normalized.platforms[0].id);
    const assemblies = railingAssemblySummary(normalized.platforms[0], geometry);

    expect(assemblies.deck.segmentCount).toBe(4);
    expect(assemblies.stairs).toMatchObject({ present: true, segmentCount: 2, postCount: 4 });
    expect(assemblies.landing).toMatchObject({ present: true, segmentCount: 2 });
    expect(assemblies.landing.linearInches).toBe(96);
    expect(railingAssemblySummary(normalized.platforms[0], geometry)).toEqual(assemblies);
  });
});
