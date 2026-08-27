import { SITE_MAP_GROUND_PLANE, type SiteMapGroundPlane } from "@mckenzie/site-map-core";
import { deckDesignV5Fingerprint, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";

export const MILLIMETERS_PER_INCH = 25.4 as const;

export type DeckGroundPointV5 = Readonly<{ id: string; xMm: number; yMm: number }>;
export type DeckGroundRingV5 = Readonly<{ id: string; points: readonly DeckGroundPointV5[] }>;

export type DeckSiteContextProjectionV5 = Readonly<{
  projectionVersion: 1;
  plane: SiteMapGroundPlane;
  sourceDesignId: string;
  sourceDesignFingerprint: string;
  sourceRevision: number;
  sourceUnits: "in";
  millimetersPerInch: typeof MILLIMETERS_PER_INCH;
  gradeElevationMm: number;
  platforms: readonly Readonly<{
    id: string;
    elevationMm: number;
    outer: DeckGroundRingV5;
    holes: readonly DeckGroundRingV5[];
  }>[];
  houseWalls: readonly Readonly<{
    id: string;
    start: DeckGroundPointV5;
    end: DeckGroundPointV5;
    baseElevationMm: number;
    heightMm: number;
  }>[];
  limitations: readonly ["context_only", "not_survey_or_construction_authority"];
}>;

function toIntegerMillimeters(inches: number, label: string): number {
  if (!Number.isFinite(inches)) throw new TypeError(`${label} must be a finite inch value.`);
  const millimeters = Math.round(inches * MILLIMETERS_PER_INCH);
  if (!Number.isSafeInteger(millimeters)) throw new RangeError(`${label} is outside the local ground-plane range.`);
  return millimeters;
}

function groundPoint(id: string, x: number, z: number): DeckGroundPointV5 {
  return Object.freeze({
    id,
    xMm: toIntegerMillimeters(x, `${id}.x`),
    yMm: toIntegerMillimeters(z, `${id}.z`),
  });
}

function groundRing(id: string, points: readonly Readonly<{ x: number; z: number }>[]): DeckGroundRingV5 {
  if (points.length < 3) throw new RangeError(`${id} requires at least three points.`);
  return Object.freeze({
    id,
    points: Object.freeze(points.map((point, index) => groundPoint(`${id}:point:${index + 1}`, point.x, point.z))),
  });
}

/**
 * Projects authored DeckDesign facts into the integer-millimeter ground plane
 * consumed by site-context renderers. The projection is read-only and never
 * feeds edits back into DeckDesign.
 */
export function deriveDeckSiteContextProjectionV5(design: DeckDesignV5): DeckSiteContextProjectionV5 {
  const normalized = normalizeDeckDesignV5(design);
  const platformIds = new Set<string>();
  const platforms = Object.freeze([...normalized.platforms]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((platform) => {
      if (platformIds.has(platform.id)) throw new RangeError("Site-context platform IDs must be unique.");
      platformIds.add(platform.id);
      return Object.freeze({
        id: platform.id,
        elevationMm: toIntegerMillimeters(platform.elevation, `${platform.id}.elevation`),
        outer: groundRing(`${platform.id}:outer`, platform.region.outer),
        holes: Object.freeze(platform.region.holes.map((hole, index) => groundRing(`${platform.id}:hole:${index + 1}`, hole))),
      });
    }));
  const wallIds = new Set<string>();
  const houseWalls = Object.freeze([...normalized.siteContext.houseWalls]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((wall) => {
      if (wallIds.has(wall.id)) throw new RangeError("Site-context house-wall IDs must be unique.");
      wallIds.add(wall.id);
      return Object.freeze({
        id: wall.id,
        start: groundPoint(`${wall.id}:start`, wall.start.x, wall.start.z),
        end: groundPoint(`${wall.id}:end`, wall.end.x, wall.end.z),
        baseElevationMm: toIntegerMillimeters(wall.baseElevation, `${wall.id}.baseElevation`),
        heightMm: toIntegerMillimeters(wall.height, `${wall.id}.height`),
      });
    }));
  return Object.freeze({
    projectionVersion: 1,
    plane: SITE_MAP_GROUND_PLANE,
    sourceDesignId: normalized.id,
    sourceDesignFingerprint: deckDesignV5Fingerprint(normalized),
    sourceRevision: normalized.metadata.revision,
    sourceUnits: "in",
    millimetersPerInch: MILLIMETERS_PER_INCH,
    gradeElevationMm: toIntegerMillimeters(normalized.siteContext.gradeElevation, "gradeElevation"),
    platforms,
    houseWalls,
    limitations: Object.freeze(["context_only", "not_survey_or_construction_authority"] as const),
  });
}
