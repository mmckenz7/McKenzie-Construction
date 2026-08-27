import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV5, stableDeckDesignV5Json } from "../src/modelV5";
import { deriveDeckSiteContextPresentationV5 } from "../src/siteContextPresentationV5";
import { deriveDeckSiteContextProjectionV5 } from "../src/siteContextProjectionV5";
import { SiteContextReadinessV5 } from "../src/SiteContextReadinessV5";

describe("Deck site-context presentation v5", () => {
  it("derives a deterministic read-only local overlay without changing Deck authority", () => {
    const design = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const before = stableDeckDesignV5Json(design);
    const projection = deriveDeckSiteContextProjectionV5(design);
    const first = deriveDeckSiteContextPresentationV5(projection);
    const second = deriveDeckSiteContextPresentationV5(projection);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ plane: "MCKENZIE_LOCAL_MM", readiness: "local_overlay_ready", connection: "awaiting_promoted_fence_contract", authority: "context_only_not_survey_or_construction" });
    expect(first.platforms).toHaveLength(design.platforms.length);
    expect(Object.isFrozen(first)).toBe(true);
    expect(stableDeckDesignV5Json(design)).toBe(before);
  });

  it("renders honest customer-facing readiness without inventing provider or field facts", () => {
    const projection = deriveDeckSiteContextProjectionV5(migrateDeckDesignToV5(DEFAULT_DESIGN));
    const html = renderToStaticMarkup(<SiteContextReadinessV5 projection={projection} />);
    expect(html).toContain("Local overlay ready");
    expect(html).toContain("Map connection not active");
    expect(html).toContain("MCKENZIE_LOCAL_MM");
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
