import { describe, expect, it } from "vitest";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { DEFAULT_DESIGN } from "../src/model";
import { railingStageSummary, toggleRailingOnExactEdge } from "../src/railingEditorV3";

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
});
