import { SITE_MAP_GROUND_PLANE } from "@mckenzie/site-map-core";
import { describe, expect, it } from "vitest";
import { deriveDeckDesignProjectionV5 } from "../src/designProjectionV5";
import { derivePlatformGeometryV5 } from "../src/geometryV5";
import { deriveGeometryWarningsV5 } from "../src/geometryWarningsV5";
import { createHistoryV5 } from "../src/historyV5";
import { DEFAULT_DESIGN } from "../src/model";
import { deckDesignV5Fingerprint, migrateDeckDesignToV5, normalizeDeckDesignV5, stableDeckDesignV5Json } from "../src/modelV5";
import { DeckLocalSiteContextFixtureAdapterV5, type DeckSiteContextFixtureV5 } from "../src/siteContextFixtureV5";
import { deriveDeckSiteContextProjectionV5, MILLIMETERS_PER_INCH } from "../src/siteContextProjectionV5";

function designWithHole() {
  const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
  return normalizeDeckDesignV5({
    ...base,
    platforms: base.platforms.map((platform) => ({
      ...platform,
      region: { ...platform.region, holes: [[{ x: 48, z: 48 }, { x: 72, z: 48 }, { x: 72, z: 72 }, { x: 48, z: 72 }]] },
    })),
  });
}

function fixture(update: Partial<DeckSiteContextFixtureV5> = {}): DeckSiteContextFixtureV5 {
  return {
    fixtureId: "knoxville-site-fixture",
    addressLabel: "Deidentified Knoxville evaluation site",
    baseLayer: "satellite",
    parcelVisible: true,
    parcels: [{ id: "parcel-1", outer: [{ xMm: -3_000, yMm: -2_000 }, { xMm: 9_000, yMm: -2_000 }, { xMm: 9_000, yMm: 8_000 }, { xMm: -3_000, yMm: 8_000 }] }],
    liveLocationVisible: true,
    liveLocation: { point: { xMm: 1_000, yMm: 2_000 }, accuracyMm: 4_000, observedAt: "2026-08-26T12:00:00.000Z", status: "observational" },
    ...update,
  };
}

describe("Deck v5 provider-neutral site-context preparation", () => {
  it("projects normalized Deck facts deterministically into the shared integer-millimeter plane", () => {
    const design = designWithHole();
    const first = deriveDeckSiteContextProjectionV5(design);
    const replay = deriveDeckSiteContextProjectionV5(JSON.parse(stableDeckDesignV5Json(design)));
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      projectionVersion: 1,
      plane: SITE_MAP_GROUND_PLANE,
      sourceDesignFingerprint: deckDesignV5Fingerprint(design),
      sourceUnits: "in",
      millimetersPerInch: MILLIMETERS_PER_INCH,
      limitations: ["context_only", "not_survey_or_construction_authority"],
    });
    expect(first.platforms[0].outer.points[1]).toMatchObject({ id: "platform-1:outer:point:2", xMm: Math.round(192 * 25.4), yMm: 0 });
    expect(first.platforms[0].holes[0].points[0]).toEqual({ id: "platform-1:hole:1:point:1", xMm: Math.round(48 * 25.4), yMm: Math.round(48 * 25.4) });
    expect(first.houseWalls[0].start.id).toBe("house-wall-1:start");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.platforms[0].outer.points)).toBe(true);
    expect(Object.isFrozen(first.platforms[0].outer.points[0])).toBe(true);
  });

  it("fails closed for invalid Deck context and invalid local fixture facts", () => {
    const design = designWithHole();
    const invalid = { ...design, siteContext: { ...design.siteContext, gradeElevation: Number.NaN } };
    expect(() => deriveDeckSiteContextProjectionV5(invalid)).toThrow(/gradeElevation|between/i);
    const adapter = new DeckLocalSiteContextFixtureAdapterV5(deriveDeckSiteContextProjectionV5(design));
    expect(() => adapter.present(fixture({ baseLayer: "terrain" as "satellite" }))).toThrow(/satellite or hybrid/i);
    expect(() => adapter.present(fixture({ parcels: [{ id: "parcel-1", outer: [{ xMm: 0.5, yMm: 0 }, { xMm: 1, yMm: 0 }, { xMm: 1, yMm: 1 }] }] }))).toThrow(/integer millimeters/i);
    expect(() => adapter.present(fixture({ liveLocation: { point: { xMm: 0, yMm: 0 }, accuracyMm: 0, observedAt: "2026-08-26T12:00:00.000Z", status: "observational" } }))).toThrow(/positive integer/i);
  });

  it("keeps base, parcel, and observational GPS fixture changes outside every Deck authority", () => {
    const design = designWithHole();
    const platformId = design.platforms[0].id;
    const contextProjection = deriveDeckSiteContextProjectionV5(design);
    const adapter = new DeckLocalSiteContextFixtureAdapterV5(contextProjection);
    const before = Object.freeze({
      json: stableDeckDesignV5Json(design),
      fingerprint: deckDesignV5Fingerprint(design),
      history: JSON.stringify(createHistoryV5(design)),
      geometry: JSON.stringify(derivePlatformGeometryV5(design, platformId)),
      warnings: JSON.stringify(deriveGeometryWarningsV5(design, platformId)),
      projection: JSON.stringify(deriveDeckDesignProjectionV5(design)),
    });
    const frames = [
      adapter.present(fixture()),
      adapter.present(fixture({ baseLayer: "hybrid" })),
      adapter.present(fixture({ parcelVisible: false })),
      adapter.present(fixture({ parcels: [{ id: "parcel-2", outer: [{ xMm: -10_000, yMm: -10_000 }, { xMm: 20_000, yMm: -10_000 }, { xMm: 20_000, yMm: 20_000 }] }] })),
      adapter.present(fixture({ liveLocationVisible: false })),
      adapter.present(fixture({ liveLocation: null })),
      adapter.present(fixture({ liveLocation: { point: { xMm: 8_000, yMm: 9_000 }, accuracyMm: 15_000, observedAt: "2026-08-26T12:00:05.000Z", status: "observational" } })),
    ];
    frames.forEach((frame) => {
      expect(frame.deck).toBe(contextProjection);
      expect(Object.isFrozen(frame.context)).toBe(true);
      expect(stableDeckDesignV5Json(design)).toBe(before.json);
      expect(deckDesignV5Fingerprint(design)).toBe(before.fingerprint);
      expect(JSON.stringify(createHistoryV5(design))).toBe(before.history);
      expect(JSON.stringify(derivePlatformGeometryV5(design, platformId))).toBe(before.geometry);
      expect(JSON.stringify(deriveGeometryWarningsV5(design, platformId))).toBe(before.warnings);
      expect(JSON.stringify(deriveDeckDesignProjectionV5(design))).toBe(before.projection);
    });
  });
});
