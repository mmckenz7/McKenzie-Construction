import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { addBeamLineV4 } from "../src/framingEditorV4";
import { deckDesignV4ToV3Compatibility, migrateDeckDesignToV4 } from "../src/modelV4";
import { restoreV4BeamLines } from "../src/V4App";

describe("v4 browser compatibility adapter", () => {
  it("preserves all v4 beam facts after a legacy non-framing edit", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const twoBeams = addBeamLineV4(base, base.platforms[0].id, { id: "beam-line-2", offsetFromOutside: 96, maxSupportSpacing: 48 }).design;
    const compatibility = deckDesignV4ToV3Compatibility(twoBeams);
    const edited = { ...compatibility, name: "Edited through a v3 control", metadata: { ...compatibility.metadata, revision: compatibility.metadata.revision + 1 } };
    const restored = restoreV4BeamLines(twoBeams, edited);
    expect(restored.name).toBe("Edited through a v3 control");
    expect(restored.platforms[0].construction.framing.beamLines).toEqual(twoBeams.platforms[0].construction.framing.beamLines);
  });
});
