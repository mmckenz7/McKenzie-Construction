// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanViewV3 } from "../src/PlanViewV3";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { deriveHouseContextGeometry } from "../src/houseContextGeometry";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, normalizeDeckDesignV3, type DeckDesignV3 } from "../src/modelV3";

const noop = () => {};
const hole = (left: number) => Object.freeze([{ x: left, z: 36 }, { x: left + 36, z: 36 }, { x: left + 36, z: 72 }, { x: left, z: 72 }]);

function design(pattern: "standard" | "picture_frame", holes: readonly (readonly Readonly<{ x: number; z: number }>[])[], direction: "left_right" | "house_yard" = "left_right"): DeckDesignV3 {
  const base = migrateDeckDesignToV3(DEFAULT_DESIGN);
  const platform = base.platforms[0];
  return normalizeDeckDesignV3({ ...base, platforms: [{ ...platform, region: { ...platform.region, holes }, construction: { ...platform.construction, decking: { ...platform.construction.decking, pattern, direction } } }] });
}

function renderPlan(source: DeckDesignV3): string {
  const platform = source.platforms[0];
  return renderToStaticMarkup(<PlanViewV3 platform={platform} geometry={derivePlatformGeometryV3(source, platform.id)} houseGeometry={deriveHouseContextGeometry(source.siteContext)} snapIncrement={6} selectedEdgeId={null} onSelectEdge={noop} onCornerPreview={noop} onCornerCommit={noop} onCancel={noop} onStairPreview={noop} onStairCommit={noop} onSegmentPreview={noop} onSegmentCommit={noop} />);
}

describe("picture-frame measured-plan presentation", () => {
  it("renders the outer and opening courses at full recorded width with perimeter grain", () => {
    const html = renderPlan(design("picture_frame", [hole(36)]));
    expect(html).toContain('<g stroke-width="5.5">');
    expect(html.match(/id="picture-frame-(?:border|hole)-/g)).toHaveLength(8);
  });

  it("retains one authoritative border course for every recorded opening", () => {
    const html = renderPlan(design("picture_frame", [hole(24), hole(120)]));
    expect(html.match(/id="picture-frame-(?:border|hole)-/g)).toHaveLength(12);
  });

  it("preserves border presentation across field directions and leaves standard plans unchanged", () => {
    const horizontal = renderPlan(design("picture_frame", [hole(36)]));
    const vertical = renderPlan(design("picture_frame", [hole(36)], "house_yard"));
    expect(horizontal.match(/<line[^>]+picture-frame-(?:border|hole)-[^>]+>/g)).toEqual(vertical.match(/<line[^>]+picture-frame-(?:border|hole)-[^>]+>/g));
    expect(renderPlan(design("standard", [hole(36)]))).not.toContain("picture-frame-border-");
  });
});
