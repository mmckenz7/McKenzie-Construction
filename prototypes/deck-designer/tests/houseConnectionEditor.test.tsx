// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HouseConnectionEditor } from "../src/HouseConnectionEditor";
import { applyHouseConnectionV3 } from "../src/houseConnectionV3";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

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
  });
});
