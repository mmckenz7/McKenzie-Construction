// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveGeometry } from "../src/geometry";
import { normalizeDesign } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { derivePolygonProjectionReport } from "../src/polygonReport";
import { deriveQuantities } from "../src/quantities";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";
import lShapeLandingFixture from "./fixtures/l-shape-landing.json";
import multiWallContextFixture from "./fixtures/multi-wall-context.json";

const fixtures = [rectangleFoundationFixture, lShapeLandingFixture, multiWallContextFixture];

describe("v2 to v3 projection equivalence gate", () => {
  it.each(fixtures)("preserves $design.name core geometry quantities", (fixture) => {
    const v2 = normalizeDesign(fixture.design);
    const v2Quantities = Object.fromEntries(
      deriveQuantities(v2, deriveGeometry(v2)).map((line) => [line.id, line.quantity]),
    );
    const v3 = migrateDeckDesignToV3(v2);
    const platform = v3.platforms[0];
    const v3Report = derivePolygonProjectionReport(platform.id, platform.region, {
      boardWidth: platform.construction.decking.boardWidth,
      gap: platform.construction.decking.gap,
      joistSpacing: platform.construction.framing.joistSpacing,
    });
    const v3Quantities = Object.fromEntries(v3Report.quantities.map((line) => [line.key, line.amount]));
    expect(v3Quantities["platform-area"]).toBe(v2Quantities["platform-area"]);
    expect(v3Quantities["decking-linear-feet"]).toBe(v2Quantities["decking-linear-feet"]);
    expect(v3Quantities["joist-linear-feet"]).toBe(v2Quantities["joist-linear-feet"]);
    expect(v3Quantities["joist-segment-count"]).toBe(v2Quantities["joist-count"]);
  });

  it("keeps site-context-only changes out of platform material projections", () => {
    const rectangle = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const multiWall = migrateDeckDesignToV3(multiWallContextFixture.design);
    const project = (design: typeof rectangle) => {
      const platform = design.platforms[0];
      return derivePolygonProjectionReport(platform.id, platform.region, {
        boardWidth: platform.construction.decking.boardWidth,
        gap: platform.construction.decking.gap,
        joistSpacing: platform.construction.framing.joistSpacing,
      }).quantities;
    };
    expect(project(multiWall)).toEqual(project(rectangle));
    expect(multiWall.siteContext).not.toEqual(rectangle.siteContext);
  });
});
