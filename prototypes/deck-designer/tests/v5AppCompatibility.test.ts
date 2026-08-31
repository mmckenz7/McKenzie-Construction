import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deckDesignV5ToV3Compatibility, migrateDeckDesignToV5 } from "../src/modelV5";
import { addBeamLineV5 } from "../src/framingEditorV5";
import { setEdgeFinishIntentV5 } from "../src/finishEditorV5";
import { restoreV5Authority } from "../src/V5App";
import { readFileSync } from "node:fs";
import { applyHouseConnectionV3, removeHouseConnectionV3 } from "../src/houseConnectionV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

describe("v5 browser compatibility adapter", () => {
  it("keeps saved multi-level recovery reachable in every compatibility shell", () => {
    expect(readFileSync(new URL("../src/LevelCutoutControls.tsx", import.meta.url), "utf8")).toContain("Keep selected level only");
    for (const file of ["V3App.tsx", "V4App.tsx", "V5App.tsx"]) {
      expect(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).toContain("onKeepSelectedLevel={keepSelectedLevelOnly}");
    }
  });
  it("preserves beam and finish facts after a legacy non-framing edit", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const free = base.platforms[0].edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const twoBeams = addBeamLineV5(base, "platform-1", { id: "beam-line-2", offsetFromOutside: 96, maxSupportSpacing: 48 }).design;
    const finished = setEdgeFinishIntentV5(twoBeams, "platform-1", free, { fasciaEnabled: true, skirtingEnabled: true });
    const compatibility = deckDesignV5ToV3Compatibility(finished);
    const edited = { ...compatibility, name: "Edited through a v3 control", metadata: { ...compatibility.metadata, revision: compatibility.metadata.revision + 1 } };
    const restored = restoreV5Authority(finished, edited);
    expect(restored.name).toBe("Edited through a v3 control");
    expect(restored.platforms[0].construction.framing.beamLines).toEqual(finished.platforms[0].construction.framing.beamLines);
    expect(restored.platforms[0].construction.edgeFinishes).toEqual(finished.platforms[0].construction.edgeFinishes);
  });

  it("preserves v5 framing and finishes when an extra house wall is removed", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const free = base.platforms[0].edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const twoBeams = addBeamLineV5(base, "platform-1", { id: "beam-line-2", offsetFromOutside: 96, maxSupportSpacing: 48 }).design;
    const finished = setEdgeFinishIntentV5(twoBeams, "platform-1", free, { fasciaEnabled: true, skirtingEnabled: true });
    const compatibility = deckDesignV5ToV3Compatibility(finished);
    const side = deriveGeometricPolygonEdges(compatibility.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!.id;
    const editable = { ...compatibility, platforms: [{ ...compatibility.platforms[0], construction: { ...compatibility.platforms[0].construction, railing: { ...compatibility.platforms[0].construction.railing, enabledEdgeIds: [] }, stairSystems: [] } }] };
    const added = applyHouseConnectionV3(editable, editable.platforms[0].id, { wallId: null, edgeId: side, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    const removed = removeHouseConnectionV3(added, editable.platforms[0].id, "house-wall-2");
    const restored = restoreV5Authority(finished, removed);
    expect(restored.siteContext.houseWalls).toHaveLength(1);
    expect(restored.platforms[0].construction.framing).toEqual(finished.platforms[0].construction.framing);
    expect(restored.platforms[0].construction.edgeFinishes).toEqual(finished.platforms[0].construction.edgeFinishes);
  });

  it("puts the protected-outline unlock action beside the plan and restores the contextual bumpout action", () => {
    const source = readFileSync(new URL("../src/V5App.tsx", import.meta.url), "utf8");
    expect(source).toContain('outlineEditingEnabled={!hasOutlineOptionLocks}');
    expect(source).toContain("Clears side options; house stays fixed.");
    expect(source).toContain('onClick={() => addBumpoutToEdge(edge.id)}>{isFree ? "Add bumpout" : "House side stays fixed"}</button>');
    expect(source).toContain("house fixed.");
    expect(source).toContain("edgeConditions: current.edgeConditions");
    expect(source).not.toContain('disabled={hasOutlineOptionLocks}');
  });
});
