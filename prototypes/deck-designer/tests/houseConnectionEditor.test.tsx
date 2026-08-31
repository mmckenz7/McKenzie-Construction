// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HouseConnectionEditor, eligibleNewHouseWallEdgeIds, newHouseWallPrompt } from "../src/HouseConnectionEditor";
import { applyHouseConnectionV3 } from "../src/houseConnectionV3";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { readFileSync } from "node:fs";

function render(design = migrateDeckDesignToV3(DEFAULT_DESIGN)): string {
  return renderToStaticMarkup(<HouseConnectionEditor design={design} platform={design.platforms[0]} onApply={() => undefined} onError={() => undefined} />);
}

describe("house connection editor", () => {
  it("makes the second locking house wall discoverable without hiding the first wall", () => {
    const initial = render();
    expect(initial).toContain("Wall 1");
    expect(initial).toContain("Add second wall");
    expect(initial).toContain('aria-pressed="true"');

    const base = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const editable = { ...base, platforms: base.platforms.map((platform) => ({ ...platform, construction: { ...platform.construction, railing: { ...platform.construction.railing, enabledEdgeIds: [] }, stairSystems: [] } })) };
    const side = deriveGeometricPolygonEdges(editable.platforms[0].region.outer).find((edge) => edge.start.x === 0 && edge.end.x === 0)!;
    const withCorner = applyHouseConnectionV3(editable, editable.platforms[0].id, { wallId: null, edgeId: side.id, attachment: "ledger", doorEnabled: false, doorOffset: 0, doorWidth: 72 });
    const cornerMarkup = render(withCorner);
    expect(cornerMarkup).toContain("Wall 1");
    expect(cornerMarkup).toContain("Wall 2");
    expect(cornerMarkup).toContain("Add another wall");
    expect(cornerMarkup).toContain("Remove selected wall");
    expect(initial).not.toContain("Remove selected wall");
    const source = readFileSync(new URL("../src/HouseConnectionEditor.tsx", import.meta.url), "utf8");
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain("sideSelector.current?.focus()");
    expect(source).toContain("eligibleNewWallEdgeIds.length === 1");
    expect(source).not.toContain('aria-pressed={addingWall}');
  });

  it("preselects only one unambiguous free perpendicular side", () => {
    const base = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const edges = deriveGeometricPolygonEdges(base.platforms[0].region.outer);
    const perpendicular = edges.filter((edge) => edge.start.x === edge.end.x);
    const onlyOne = {
      ...base.platforms[0],
      construction: { ...base.platforms[0].construction, railing: { ...base.platforms[0].construction.railing, enabledEdgeIds: [perpendicular[1].id] }, stairSystems: [] },
    };
    expect(eligibleNewHouseWallEdgeIds(onlyOne)).toEqual([perpendicular[0].id]);
    expect(eligibleNewHouseWallEdgeIds({ ...onlyOne, construction: { ...onlyOne.construction, railing: { ...onlyOne.construction.railing, enabledEdgeIds: [] } } })).toHaveLength(2);
  });

  it("explains zero and ambiguous candidates instead of disabling the final action", () => {
    expect(newHouseWallPrompt(0, 2)).toContain("Unlock outline editing");
    expect(newHouseWallPrompt(2, 2)).toContain("Choose Left or Right side");
    const source = readFileSync(new URL("../src/HouseConnectionEditor.tsx", import.meta.url), "utf8");
    expect(source).toContain('disabled={!addingWall && !edgeId}');
    expect(source).toContain("sideSelector.current?.focus(); return;");
    expect(source).toContain("eligibleNewWallEdgeIds.length, wallNumber");
    expect(source).toContain("selectableEdges.map");
  });
});
