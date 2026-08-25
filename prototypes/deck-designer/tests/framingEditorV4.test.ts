import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { addBeamLineV4, beamLineOffsetFromPointV4, removeBeamLineV4, updateBeamLineV4 } from "../src/framingEditorV4";
import { migrateDeckDesignToV4 } from "../src/modelV4";

describe("v4 conceptual beam editing commands", () => {
  it("adds, moves, changes spacing, and removes one stable beam at a time", () => {
    const base = migrateDeckDesignToV4(DEFAULT_DESIGN), platformId = base.platforms[0].id;
    const added = addBeamLineV4(base, platformId, { id: "beam-line-2", offsetFromOutside: 96, maxSupportSpacing: 60 });
    const updated = updateBeamLineV4(added.design, platformId, { id: "beam-line-2", offsetFromOutside: 84, maxSupportSpacing: 48 });
    expect(updated.design.metadata.revision).toBe(base.metadata.revision + 2);
    expect(updated.design.platforms[0].construction.framing.beamLines.find((line) => line.id === "beam-line-2")).toEqual({ id: "beam-line-2", offsetFromOutside: 84, maxSupportSpacing: 48 });
    const removed = removeBeamLineV4(updated.design, platformId, "beam-line-1");
    expect(removed.design.platforms[0].construction.framing.beamLines.map((line) => line.id)).toEqual(["beam-line-2"]);
    expect(() => removeBeamLineV4(removed.design, platformId, "beam-line-2")).toThrow(/retain at least one/i);
  });

  it("moves the selected line from a touch point using the recorded snap step", () => {
    const design = migrateDeckDesignToV4(DEFAULT_DESIGN), platform = design.platforms[0];
    expect(beamLineOffsetFromPointV4(platform, { x: 90, z: 61 }, 6)).toBe(84);
    expect(beamLineOffsetFromPointV4(platform, { x: 90, z: -200 }, 6)).toBe(138);
  });
});
