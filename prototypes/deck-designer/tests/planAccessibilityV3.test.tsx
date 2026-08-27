// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { deriveHouseContextGeometry } from "../src/houseContextGeometry";
import { migrateDeckDesignToV3, normalizeDeckDesignV3, type DeckDesignV3 } from "../src/modelV3";
import { PlanViewV3 } from "../src/PlanViewV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";

const noop = () => {};

function renderPlan(
  design: DeckDesignV3,
  options: Readonly<{
    editingEnabled?: boolean;
    outlineEditingEnabled?: boolean;
    selectedEdgeId?: string | null;
    selectedHoleIndex?: number | null;
    selectedLandingId?: string | null;
    activeStairSystemId?: string | null;
  }> = {},
) {
  const platform = design.platforms[0];
  const geometry = derivePlatformGeometryV3(design, platform.id);
  const geometryBefore = JSON.stringify(geometry);
  const designBefore = JSON.stringify(design);
  const html = renderToStaticMarkup(<PlanViewV3
    platform={platform}
    activeStairSystem={platform.construction.stairSystems.find((system) => system.id === options.activeStairSystemId) ?? null}
    geometry={geometry}
    houseGeometry={deriveHouseContextGeometry(design.siteContext)}
    snapIncrement={6}
    editingEnabled={options.editingEnabled}
    outlineEditingEnabled={options.outlineEditingEnabled}
    selectedEdgeId={options.selectedEdgeId ?? null}
    selectedHoleIndex={options.selectedHoleIndex ?? null}
    selectedLandingId={options.selectedLandingId ?? null}
    onSelectEdge={noop}
    onSelectStairSystem={noop}
    onSelectLanding={noop}
    onSelectHole={noop}
    onCornerPreview={noop}
    onCornerCommit={noop}
    onCancel={noop}
    onStairPreview={noop}
    onStairCommit={noop}
    onSegmentPreview={noop}
    onSegmentCommit={noop}
  />);
  expect(JSON.stringify(geometry)).toBe(geometryBefore);
  expect(JSON.stringify(design)).toBe(designBefore);
  return html;
}

describe("interactive measured-plan accessibility", () => {
  it("exposes editable child controls through one labelled and described group", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const selectedEdgeId = design.platforms[0].edgeConditions[1].edgeId;
    const html = renderPlan(design, { selectedEdgeId });
    expect(html).toContain('role="group"');
    expect(html).not.toContain('role="img"');
    expect(html).toMatch(/aria-label="Editable 4-corner deck outline" aria-describedby="([^"]+)"/);
    expect(html).toContain("Tab through deck objects and movement handles.");
    expect(html).toContain('role="button" tabindex="0"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("provides concise side-selection instructions outside layout editing", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const html = renderPlan(design, { editingEnabled: false });
    expect(html).toContain('aria-label="Side selection plan with 4 deck sides"');
    expect(html).toContain("Tab through the deck sides. Press Enter or Space to select a side.");
    expect(html).not.toContain("movement handles");
  });

  it("keeps side selection available but hides deceptive outline handles while side options lock the outline", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const html = renderPlan(design, { outlineEditingEnabled: false });
    expect(html).toContain('aria-label="Deck plan with locked 4-corner outline"');
    expect(html).toContain("unlock outline editing before moving sides and corners");
    expect(html).toContain('aria-label="Select 16′ 0″ side"');
    expect(html).not.toContain('class="segment-move-hit"');
    expect(html).not.toContain('class="corner-move-hit"');
  });

  it("reports the exact selected cutout without placing pressed state on movement handles", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...base.platforms[0], region: { ...base.platforms[0].region, holes: [[{ x: 48, z: 48 }, { x: 96, z: 48 }, { x: 96, z: 96 }, { x: 48, z: 96 }]] } }],
    });
    const html = renderPlan(design, { selectedHoleIndex: 0 });
    expect(html).toMatch(/aria-label="Select cutout 1" aria-pressed="true"/);
    expect(html).not.toMatch(/class="(?:cutout|corner|segment|beam|stair)-move-hit"[^>]*aria-pressed/);
  });

  it("reports only the exact selected landing while retaining stair-system selection state", () => {
    const design = migrateDeckDesignToV3(lShapeLandingFixture.design);
    const system = design.platforms[0].construction.stairSystems[0];
    const landing = system.landings[0];
    const treadCount = derivePlatformGeometryV3(design, design.platforms[0].id).stairTreads.length;
    const selected = renderPlan(design, { activeStairSystemId: system.id, selectedLandingId: landing.id });
    const unselected = renderPlan(design, { activeStairSystemId: system.id });
    expect(selected).toMatch(new RegExp(`aria-label="Edit landing in ${system.id.replaceAll("-", " ")}" aria-pressed="true"`));
    expect(unselected).toMatch(new RegExp(`aria-label="Edit landing in ${system.id.replaceAll("-", " ")}" aria-pressed="false"`));
    expect(selected).toMatch(new RegExp(`aria-label="Edit ${system.id.replaceAll("-", " ")}" aria-pressed="true"`));
    expect(selected.match(new RegExp(`aria-label="Edit ${system.id.replaceAll("-", " ")}"`, "g"))).toHaveLength(1);
    expect(selected.match(/class="plan-object-hit" aria-hidden="true"/g)).toHaveLength(treadCount);
  });

  it("exposes one control per authored stair system while retaining every tread hit polygon", () => {
    const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const platform = base.platforms[0];
    const freeEdges = platform.edgeConditions.filter((condition) => condition.condition === "free").map((condition) => condition.edgeId);
    const design = normalizeDeckDesignV3({
      ...base,
      platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [
        { id: "stair-system-1", locked: true, edgeId: freeEdges[0], offset: 12, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [] },
        { id: "stair-system-2", locked: true, edgeId: freeEdges[1], offset: 24, width: 36, treadDepth: 10, maxRiserHeight: 7.75, landings: [] },
      ] } }],
    });
    const geometry = derivePlatformGeometryV3(design, platform.id);
    const html = renderPlan(design, { activeStairSystemId: "stair-system-2" });
    expect(html.match(/class="plan-stair-system-hit" role="button" tabindex="0"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Edit stair system 1"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Edit stair system 2"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="Edit stair system 1" aria-pressed="false"/);
    expect(html).toMatch(/aria-label="Edit stair system 2" aria-pressed="true"/);
    expect(html.match(/class="plan-object-hit" aria-hidden="true"/g)).toHaveLength(geometry.stairTreads.length);
    expect(new Set(geometry.stairTreads.map((tread) => tread.systemId))).toEqual(new Set(["stair-system-1", "stair-system-2"]));
  });
});
