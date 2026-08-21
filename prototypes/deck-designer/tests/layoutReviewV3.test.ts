import { describe, expect, it } from "vitest";
import { deriveLayoutReviewV3 } from "../src/layoutReviewV3";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3, normalizeDeckDesignV3 } from "../src/modelV3";
import { deriveGeometricPolygonEdges } from "../src/polygon";

describe("single-level layout review", () => {
  it("reports deterministic measurements and allows a stair-free layout", () => {
    const design = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const first = deriveLayoutReviewV3(design, "platform-1");
    expect(first).toEqual(deriveLayoutReviewV3(design, "platform-1"));
    expect(first.readyToContinue).toBe(true);
    expect(first.items.find((item) => item.id === "outline")?.value).toContain("sq ft");
    expect(first.items.find((item) => item.id === "stairs")?.value).toBe("No stairs added");
    expect(first.items.find((item) => item.id === "house")?.status).toBe("field_verify");
  });

  it("blocks unfinished stairs, landings, and landing connections", () => {
    const migrated = migrateDeckDesignToV3({ ...DEFAULT_DESIGN, construction: { ...DEFAULT_DESIGN.construction, stairs: { ...DEFAULT_DESIGN.construction.stairs, enabled: true, landingEnabled: true } } });
    const platform = migrated.platforms[0];
    const system = platform.construction.stairSystems[0];
    const landing = system.landings[0];
    const design = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [{ ...system, landings: [{ ...landing, connections: [{ id: "landing-connection-1", locked: false, destination: "grade", direction: "left", width: 48, treadDepth: 10 }] }] }] } }] });
    const review = deriveLayoutReviewV3(design, platform.id);
    expect(review.readyToContinue).toBe(false);
    expect(review.blockers).toEqual(["Finish 1 stair system.", "Finish 1 landing.", "Finish 1 landing connection."]);
    expect(review.items.find((item) => item.id === "stairs")?.status).toBe("finish_required");
  });

  it("rejects an unknown platform", () => {
    expect(() => deriveLayoutReviewV3(migrateDeckDesignToV3(DEFAULT_DESIGN), "missing")).toThrow("does not exist");
  });

  it("blocks a deterministic stair collision but keeps cutout clearance advisory", () => {
    const migrated = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const platform = migrated.platforms[0];
    const edges = deriveGeometricPolygonEdges(platform.region.outer);
    const system = (id: string, edgeId: string, offset: number, turn: "left" | "right") => ({ id, locked: true, edgeId, offset, width: 48, treadDepth: 10, maxRiserHeight: 7.75, landings: [{ id: `${id}-landing-1`, locked: true, afterRiser: 0, width: 48, depth: 48, turn, connections: [] }] });
    const collisionDesign = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, construction: { ...platform.construction, stairSystems: [system("stair-system-1", edges[1].id, 96, "right"), system("stair-system-2", edges[2].id, 0, "left")] } }] });
    const collisionReview = deriveLayoutReviewV3(collisionDesign, platform.id);
    expect(collisionReview.readyToContinue).toBe(false);
    expect(collisionReview.blockers).toContain("Stair systems 1 and 2 overlap in plan. Move or reroute one before continuing.");
    expect(collisionReview.items.find((item) => item.id === "geometry")?.status).toBe("finish_required");

    const clearanceDesign = normalizeDeckDesignV3({ ...migrated, platforms: [{ ...platform, region: { ...platform.region, holes: [[{ x: 6, z: 48 }, { x: 36, z: 48 }, { x: 36, z: 84 }, { x: 6, z: 84 }]] } }] });
    const clearanceReview = deriveLayoutReviewV3(clearanceDesign, platform.id);
    expect(clearanceReview.readyToContinue).toBe(true);
    expect(clearanceReview.items.find((item) => item.id === "geometry")?.status).toBe("field_verify");
    expect(clearanceReview.fieldVerification).toContain("Cutout 1 is 6 inches from the deck edge; verify the intended clearance.");
  });
});
