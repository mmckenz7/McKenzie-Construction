import { DEFAULT_DESIGN, normalizeDesign, updateDesign, type HouseAttachment } from "./model";
import { migrateDeckDesignToV3, type DeckDesignV3 } from "./modelV3";
import { deriveGeometricPolygonEdges, geometricPolygonEdgeId, type PolygonPoint } from "./polygon";
import { normalizePolygonRegion } from "./polygonRegion";

export type ConfirmedPhotoFacts = Readonly<{
  designName: string;
  layoutIntent: "rectangle" | "non-standard";
  width: number;
  projection: number;
  surfaceElevation: number | null;
  doorWidth: number | null;
  attachment: HouseAttachment;
}>;

export type PhotoIntakeReview = Readonly<{
  confirmed: readonly string[];
  fieldVerification: readonly string[];
  outlineWarning: string | null;
}>;

export type GuidedPhotoRole = "wide-site" | "house-connection" | "left-corner" | "right-corner" | "stairs-grade" | "elevated-overview";
export type PhotoCoverageReview = Readonly<{
  addedCount: number;
  missingRecommendedRoles: readonly GuidedPhotoRole[];
  message: string;
}>;

const NON_STANDARD_RECOMMENDED: readonly GuidedPhotoRole[] = Object.freeze([
  "wide-site", "house-connection", "left-corner", "right-corner", "elevated-overview",
]);

const inches = (value: number, label: string, minimum: number, maximum: number): number => {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum} inches.`);
  }
  return Math.round(value * 100) / 100;
};

export function normalizeConfirmedPhotoFacts(facts: ConfirmedPhotoFacts): ConfirmedPhotoFacts {
  const designName = facts.designName.trim();
  if (!designName || designName.length > 120) throw new TypeError("Design name is required and must be 120 characters or fewer.");
  if (facts.layoutIntent !== "rectangle" && facts.layoutIntent !== "non-standard") throw new TypeError("Choose rectangle or non-standard layout intent.");
  if (!["unknown", "ledger", "non-ledger"].includes(facts.attachment)) throw new TypeError("Choose a supported house attachment status.");
  return Object.freeze({
    designName,
    layoutIntent: facts.layoutIntent,
    width: inches(facts.width, "Deck width", 48, 1200),
    projection: inches(facts.projection, "Deck projection", 48, 600),
    surfaceElevation: facts.surfaceElevation === null ? null : inches(facts.surfaceElevation, "Deck height", 6, 144),
    doorWidth: facts.doorWidth === null ? null : inches(facts.doorWidth, "Door width", 12, 240),
    attachment: facts.attachment,
  });
}

export function reviewConfirmedPhotoFacts(facts: ConfirmedPhotoFacts, outlineConfirmed = false): PhotoIntakeReview {
  const normalized = normalizeConfirmedPhotoFacts(facts);
  return Object.freeze({
    confirmed: Object.freeze([
      `Layout intent: ${normalized.layoutIntent}`,
      `Deck footprint: ${normalized.width} × ${normalized.projection} inches`,
      ...(normalized.surfaceElevation === null ? [] : [`Deck height: ${normalized.surfaceElevation} inches`]),
      ...(normalized.doorWidth === null ? [] : [`Door width reference: ${normalized.doorWidth} inches`]),
      `House attachment response: ${normalized.attachment}`,
    ]),
    fieldVerification: Object.freeze([
      ...(normalized.surfaceElevation === null ? ["Deck height is carried from the current design until measured."] : []),
      ...(normalized.doorWidth === null ? ["Door width and wall position are not recorded."] : ["Door position is not recorded, so the opening is not placed automatically."]),
      ...(normalized.attachment === "unknown" ? ["House attachment remains unknown."] : ["Visible and concealed attachment conditions still require field verification."]),
      "Photos are reference evidence only and do not generate authoritative geometry.",
      ...(normalized.layoutIntent === "non-standard" && outlineConfirmed ? ["The non-standard outline was manually traced and confirmed; field measurements still control final dimensions."] : []),
    ]),
    outlineWarning: normalized.layoutIntent === "non-standard" && !outlineConfirmed
      ? "Non-standard outline is not confirmed. The first rectangle is an editable overall-size envelope."
      : null,
  });
}

export function reviewPhotoCoverage(
  layoutIntent: ConfirmedPhotoFacts["layoutIntent"],
  guidedRoles: readonly GuidedPhotoRole[],
  additionalCount: number,
): PhotoCoverageReview {
  if (layoutIntent !== "rectangle" && layoutIntent !== "non-standard") throw new TypeError("Photo coverage requires a supported layout intent.");
  if (!Number.isInteger(additionalCount) || additionalCount < 0 || additionalCount > 6) throw new RangeError("Additional photo count must be from 0 through 6.");
  const uniqueRoles = Object.freeze([...new Set(guidedRoles)]);
  const missingRecommendedRoles = layoutIntent === "non-standard"
    ? Object.freeze(NON_STANDARD_RECOMMENDED.filter((role) => !uniqueRoles.includes(role)))
    : Object.freeze([] as GuidedPhotoRole[]);
  const addedCount = uniqueRoles.length + additionalCount;
  const message = addedCount === 0
    ? "No photos added; manual design remains available."
    : missingRecommendedRoles.length > 0
      ? `${missingRecommendedRoles.length} recommended non-standard-deck angle${missingRecommendedRoles.length === 1 ? " is" : "s are"} still missing.`
      : layoutIntent === "non-standard"
        ? "Good multi-angle coverage for reviewing a non-standard outline."
        : "Photo coverage is optional for this rectangle start.";
  return Object.freeze({ addedCount, missingRecommendedRoles, message });
}

export function createDesignFromConfirmedPhotoFacts(base: DeckDesignV3, facts: ConfirmedPhotoFacts, confirmedOuter?: readonly PolygonPoint[]): DeckDesignV3 {
  const normalized = normalizeConfirmedPhotoFacts(facts);
  const currentElevation = base.platforms[0]?.elevation ?? DEFAULT_DESIGN.platform.surfaceElevation;
  const legacy = updateDesign(DEFAULT_DESIGN, {
    name: normalized.designName,
    kind: "rectangle",
    width: normalized.width,
    projection: normalized.projection,
    surfaceElevation: normalized.surfaceElevation ?? currentElevation,
    houseAttachment: normalized.attachment,
  });
  const migrated = migrateDeckDesignToV3(normalizeDesign({
    ...legacy,
    id: base.id,
    metadata: { ...legacy.metadata, revision: base.metadata.revision + 1 },
  }));
  if (!confirmedOuter) return migrated;
  if (normalized.layoutIntent !== "non-standard") throw new TypeError("A traced outline requires non-standard layout intent.");
  const region = normalizePolygonRegion({ outer: confirmedOuter, holes: [] });
  const expectedHouseEdgeId = geometricPolygonEdgeId({ x: 0, z: 0 }, { x: normalized.width, z: 0 });
  const edges = deriveGeometricPolygonEdges(region.outer);
  if (!edges.some((edge) => edge.id === expectedHouseEdgeId)) throw new RangeError("The traced outline must preserve the confirmed house edge.");
  const freeEdges = edges.filter((edge) => edge.id !== expectedHouseEdgeId);
  if (freeEdges.length === 0) throw new RangeError("The traced outline must expose a free edge.");
  const stairEdge = [...freeEdges].sort((first, second) => second.length - first.length || first.id.localeCompare(second.id))[0];
  const platform = migrated.platforms[0];
  return migrateDeckDesignToV3({
    ...migrated,
    platforms: [{
      ...platform,
      region,
      edgeConditions: edges.map((edge) => ({ edgeId: edge.id, condition: edge.id === expectedHouseEdgeId ? "house_attachment" : "free", attachment: edge.id === expectedHouseEdgeId ? normalized.attachment : "none" })),
      construction: {
        ...platform.construction,
        railing: { ...platform.construction.railing, enabledEdgeIds: freeEdges.map((edge) => edge.id) },
        stairs: { ...platform.construction.stairs, enabled: false, edgeId: stairEdge.id, offset: 0 },
      },
    }],
  });
}
