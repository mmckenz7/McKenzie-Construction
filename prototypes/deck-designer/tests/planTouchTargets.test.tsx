// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { derivePlatformGeometryV3 } from "../src/geometryV3";
import { deriveHouseContextGeometry } from "../src/houseContextGeometry";
import { normalizeDeckDesignV3, migrateDeckDesignToV3, type StairSystemV3 } from "../src/modelV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";
import { PlanViewV3 } from "../src/PlanViewV3";
import { canBeginPlanPointerGestureV3, ownsPlanPointerGestureV3, releasePlanPointerGestureV3 } from "../src/planPointerOwnerV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";

const noop = () => {};

function compactDeck(locked = false) {
  const base = migrateDeckDesignToV3(rectangleFoundationFixture.design);
  const outer = [{ x: 0, z: 0 }, { x: 48, z: 0 }, { x: 48, z: 48 }, { x: 0, z: 48 }];
  const edges = deriveGeometricPolygonEdges(outer);
  const system: StairSystemV3 = Object.freeze({
    id: "stair-system-touch-test",
    locked,
    edgeId: edges[2].id,
    offset: 0,
    width: 48,
    treadDepth: 10,
    maxRiserHeight: 7.75,
    landings: Object.freeze([]),
  });
  return normalizeDeckDesignV3({
    ...base,
    platforms: [{
      ...base.platforms[0],
      region: { outer, holes: [] },
      edgeConditions: edges.map((edge, index) => ({ edgeId: edge.id, condition: index === 0 ? "house_attachment" as const : "free" as const, attachment: index === 0 ? "unknown" as const : "none" as const })),
      construction: { ...base.platforms[0].construction, railing: { ...base.platforms[0].construction.railing, enabledEdgeIds: [] }, stairSystems: [system] },
    }],
  });
}

function markup(locked = false) {
  const design = compactDeck(locked);
  const platform = design.platforms[0];
  const stair = platform.construction.stairSystems[0];
  return renderToStaticMarkup(<PlanViewV3
    platform={platform}
    activeStairSystem={stair}
    geometry={derivePlatformGeometryV3(design, platform.id)}
    houseGeometry={deriveHouseContextGeometry(design.siteContext)}
    snapIncrement={6}
    selectedEdgeId={null}
    onSelectEdge={noop}
    onCornerPreview={noop}
    onCornerCommit={noop}
    onCancel={noop}
    onStairPreview={noop}
    onStairCommit={noop}
    onSegmentPreview={noop}
    onSegmentCommit={noop}
  />);
}

describe("active-plan touch target priority", () => {
  it("keeps large transparent targets above the unchanged visible marks", () => {
    const html = markup();
    expect(html).toContain('class="segment-move-hit"');
    expect(html).toContain('width="36" height="36"');
    expect(html).toContain('class="corner-move-hit"');
    expect(html).toContain('class="stair-move-hit"');
    expect(html).toContain('r="18"');
    expect(html).toContain('width="9" height="9"');
    expect(html).toContain('r="5.5"');
    expect(html).toContain('r="6.5"');
  });

  it("orders overlapping dense-edge controls as segment, then corner, then active stair", () => {
    const html = markup();
    const lastSegment = html.lastIndexOf('class="segment-move-hit"');
    const firstCorner = html.indexOf('class="corner-move-hit"');
    const lastCorner = html.lastIndexOf('class="corner-move-hit"');
    const stair = html.indexOf('class="stair-move-hit"');
    expect(lastSegment).toBeGreaterThan(-1);
    expect(firstCorner).toBeGreaterThan(lastSegment);
    expect(stair).toBeGreaterThan(lastCorner);
  });

  it("exposes no stair hit target when the authored stair system is locked", () => {
    expect(markup(true)).not.toContain('class="stair-move-hit"');
  });

  it("keeps one pointer owner through interleaved touch transactions and permits reuse after cleanup", () => {
    const handleFamilies = ["platform", "segment", "cutout-center", "cutout-corner", "corner", "stair", "beam"];
    let owner: number | null = null;
    expect(canBeginPlanPointerGestureV3(owner)).toBe(true);
    owner = 17;
    for (const family of handleFamilies) {
      expect(canBeginPlanPointerGestureV3(owner), family).toBe(false);
      expect(ownsPlanPointerGestureV3(owner, 99), family).toBe(false);
      expect(releasePlanPointerGestureV3(owner, 99), family).toBe(17);
    }
    expect(ownsPlanPointerGestureV3(owner, 17)).toBe(true);
    owner = releasePlanPointerGestureV3(owner, 17);
    expect(owner).toBeNull();
    expect(canBeginPlanPointerGestureV3(owner)).toBe(true);
  });

  it("wires ownership, cancel, lost-capture, and owner-before-release cleanup across every drag family", () => {
    const source = PlanViewV3.toString();
    expect(source.match(/beginPointerGesture\(event\.pointerId\)/g)).toHaveLength(7);
    expect(source.match(/onPointerCancel/g)).toHaveLength(7);
    expect(source.match(/onLostPointerCapture/g)).toHaveLength(7);
    expect(source.match(/completePointerGesture\(event\.pointerId\)/g)).toHaveLength(7);
    expect(source).toContain("completePointerGesture(event.pointerId);\n");
    expect(source).toContain("releasePointerCapture(event.pointerId)");
    expect(source).toContain("if (!editingEnabled || stairDrag.current && (!stair || stair.locked)) cancelPointerGesture(pointerId)");
    expect(source).toContain("clearPointerDrags();\n    onCancel()");
  });
});
