import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { addBeamLineV4 } from "../src/framingEditorV4";
import { deckDesignV4ToV3Compatibility, migrateDeckDesignToV4 } from "../src/modelV4";
import { restoreV4BeamLines } from "../src/V4App";
import { applyHouseConnectionV3, removeHouseConnectionV3 } from "../src/houseConnectionV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

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

  it("preserves v4 beam authority when an extra house wall is removed", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN);
    const twoBeams = addBeamLineV4(base, base.platforms[0].id, { id: "beam-line-2", offsetFromOutside: 96, maxSupportSpacing: 48 }).design;
    const compatibility = deckDesignV4ToV3Compatibility(twoBeams);
    const side = deriveGeometricPolygonEdges(compatibility.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!.id;
    const editable = { ...compatibility, platforms: [{ ...compatibility.platforms[0], construction: { ...compatibility.platforms[0].construction, railing: { ...compatibility.platforms[0].construction.railing, enabledEdgeIds: [] }, stairSystems: [] } }] };
    const added = applyHouseConnectionV3(editable, editable.platforms[0].id, { wallId: null, edgeId: side, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    const removed = removeHouseConnectionV3(added, editable.platforms[0].id, "house-wall-2");
    const restored = restoreV4BeamLines(twoBeams, removed);
    expect(restored.siteContext.houseWalls).toHaveLength(1);
    expect(restored.platforms[0].construction.framing.beamLines).toEqual(twoBeams.platforms[0].construction.framing.beamLines);
  });
});
