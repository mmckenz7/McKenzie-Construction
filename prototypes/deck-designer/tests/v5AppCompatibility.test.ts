import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deckDesignV5ToV3Compatibility, migrateDeckDesignToV5 } from "../src/modelV5";
import { addBeamLineV5 } from "../src/framingEditorV5";
import { setEdgeFinishIntentV5 } from "../src/finishEditorV5";
import { restoreV5Authority } from "../src/V5App";
import { readFileSync } from "node:fs";

describe("v5 browser compatibility adapter", () => {
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

  it("puts the protected-outline unlock action beside the plan and restores the contextual bumpout action", () => {
    const source = readFileSync(new URL("../src/V5App.tsx", import.meta.url), "utf8");
    expect(source).toContain('outlineEditingEnabled={!hasEdgeReferences}');
    expect(source).toContain("Unlock to drag the white side handles or add a bumpout");
    expect(source).toContain('onClick={() => addBumpoutToEdge(edge.id)}>Add bumpout</button>');
    expect(source).not.toContain('disabled={hasEdgeReferences}');
  });
});
