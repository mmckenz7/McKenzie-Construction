import { SITE_MAP_GROUND_PLANE, normalizedMapCoordinate, type LocalGroundToWgs84Registration } from "@mckenzie/site-map-core";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV5, stableDeckDesignV5Json } from "../src/modelV5";
import { deriveDeckSiteContextMapSceneV5, deriveDeckSiteContextPresentationV5 } from "../src/siteContextPresentationV5";
import { deriveDeckSiteContextProjectionV5 } from "../src/siteContextProjectionV5";
import { SiteContextReadinessV5 } from "../src/SiteContextReadinessV5";

describe("Deck site-context presentation v5", () => {
  const registration: LocalGroundToWgs84Registration = Object.freeze({
    localAnchor: Object.freeze({ xMm: 0, yMm: 0 }),
    mapAnchor: normalizedMapCoordinate("-83.9207000", "35.9606000"),
    xAxisBearingDegrees: 90,
  });

  it("derives a deterministic read-only local overlay without changing Deck authority", () => {
    const design = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const before = stableDeckDesignV5Json(design);
    const projection = deriveDeckSiteContextProjectionV5(design);
    const first = deriveDeckSiteContextPresentationV5(projection);
    const second = deriveDeckSiteContextPresentationV5(projection);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ plane: SITE_MAP_GROUND_PLANE, readiness: "local_overlay_ready", connection: "shared_read_only_contract_ready", authority: "context_only_not_survey_or_construction" });
    expect(first.platforms).toHaveLength(design.platforms.length);
    expect(Object.isFrozen(first)).toBe(true);
    expect(stableDeckDesignV5Json(design)).toBe(before);
  });

  it("projects Deck-owned local geometry through the shared immutable read-only scene contract", () => {
    const design = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const before = stableDeckDesignV5Json(design);
    const projection = deriveDeckSiteContextProjectionV5(design);
    const first = deriveDeckSiteContextMapSceneV5(projection, registration);
    const replay = deriveDeckSiteContextMapSceneV5(projection, registration);
    expect(first).toEqual(replay);
    expect(first.polygons).toHaveLength(design.platforms.length);
    expect(first.polylines).toHaveLength(design.siteContext.houseWalls.length);
    expect(first.polygons[0]?.id).toBe(`deck-platform:${design.platforms[0].id}`);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.polygons)).toBe(true);
    expect(stableDeckDesignV5Json(design)).toBe(before);
  });

  it("keeps disposable map registration outside Deck authority", () => {
    const design = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const before = stableDeckDesignV5Json(design);
    const projection = deriveDeckSiteContextProjectionV5(design);
    const moved = deriveDeckSiteContextMapSceneV5(projection, Object.freeze({
      ...registration,
      mapAnchor: normalizedMapCoordinate("-83.9206000", "35.9605000"),
      xAxisBearingDegrees: 135,
    }));
    expect(moved).not.toEqual(deriveDeckSiteContextMapSceneV5(projection, registration));
    expect(stableDeckDesignV5Json(design)).toBe(before);
  });

  it("renders honest customer-facing readiness without inventing provider or field facts", () => {
    const projection = deriveDeckSiteContextProjectionV5(migrateDeckDesignToV5(DEFAULT_DESIGN));
    const html = renderToStaticMarkup(<SiteContextReadinessV5 projection={projection} />);
    expect(html).toContain("Local overlay ready");
    expect(html).toContain("Map connection not active");
    expect(html).toContain(SITE_MAP_GROUND_PLANE);
    expect(html).toContain("shared read-only site-map contract");
    expect(html).toContain("not a survey or construction authority");
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toMatch(/satellite|parcel data|live location|field verified/i);
  });

  it("fails closed for mutable or empty projections", () => {
    const valid = deriveDeckSiteContextProjectionV5(migrateDeckDesignToV5(DEFAULT_DESIGN));
    expect(() => deriveDeckSiteContextPresentationV5({ ...valid })).toThrow(/frozen read-only/i);
    expect(() => deriveDeckSiteContextPresentationV5(Object.freeze({ ...valid, platforms: [valid.platforms[0]] }))).toThrow(/frozen read-only/i);
    expect(() => deriveDeckSiteContextPresentationV5(Object.freeze({ ...valid, platforms: Object.freeze([]), houseWalls: Object.freeze([]) }))).toThrow(/requires local geometry/i);
  });
});
