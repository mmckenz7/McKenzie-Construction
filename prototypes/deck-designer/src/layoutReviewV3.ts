import { deriveDeckDesignProjectionV3 } from "./designProjectionV3";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { deriveGeometryWarningsV3, type GeometryWarningV3 } from "./geometryWarningsV3";

export type LayoutReviewStatusV3 = "confirmed" | "field_verify" | "finish_required";

export type LayoutReviewItemV3 = Readonly<{
  id: "outline" | "height" | "house" | "stairs" | "cutouts" | "geometry";
  label: string;
  value: string;
  status: LayoutReviewStatusV3;
}>;

export type LayoutReviewV3 = Readonly<{
  platformId: string;
  readyToContinue: boolean;
  items: readonly LayoutReviewItemV3[];
  blockers: readonly string[];
  fieldVerification: readonly string[];
  geometryWarnings: readonly GeometryWarningV3[];
}>;

const feet = (inches: number): string => `${(Math.round(inches / 12 * 100) / 100).toLocaleString()} ft`;
const squareFeet = (squareInches: number): string => `${(Math.round(squareInches / 144 * 100) / 100).toLocaleString()} sq ft`;

export function deriveLayoutReviewV3(design: DeckDesignV3, platformId: string): LayoutReviewV3 {
  const normalized = normalizeDeckDesignV3(design);
  return deriveLayoutReviewFromWarningsV3(normalized, platformId, deriveGeometryWarningsV3(normalized, platformId));
}

export function deriveLayoutReviewFromWarningsV3(design: DeckDesignV3, platformId: string, geometryWarnings: readonly GeometryWarningV3[]): LayoutReviewV3 {
  const normalized = normalizeDeckDesignV3(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const projected = deriveDeckDesignProjectionV3(normalized).platforms.find((candidate) => candidate.platformId === platformId)!;
  const measurements = projected.surface.measurements;
  const house = platform.edgeConditions.find((condition) => condition.condition === "house_attachment");
  const unfinishedSystems = platform.construction.stairSystems.filter((system) => !system.locked);
  const unfinishedLandings = platform.construction.stairSystems.flatMap((system) => system.landings.filter((landing) => !landing.locked));
  const unfinishedConnections = platform.construction.stairSystems.flatMap((system) => system.landings.flatMap((landing) => landing.connections.filter((connection) => !connection.locked)));
  const collisions = geometryWarnings.filter((warning) => warning.severity === "collision");
  const clearances = geometryWarnings.filter((warning) => warning.severity === "clearance");
  const hasUnfinishedStairs = unfinishedSystems.length + unfinishedLandings.length + unfinishedConnections.length > 0;
  const blockers: string[] = [];
  if (unfinishedSystems.length) blockers.push(`Finish ${unfinishedSystems.length} stair system${unfinishedSystems.length === 1 ? "" : "s"}.`);
  if (unfinishedLandings.length) blockers.push(`Finish ${unfinishedLandings.length} landing${unfinishedLandings.length === 1 ? "" : "s"}.`);
  if (unfinishedConnections.length) blockers.push(`Finish ${unfinishedConnections.length} landing connection${unfinishedConnections.length === 1 ? "" : "s"}.`);
  blockers.push(...collisions.map((warning) => warning.message));
  const fieldVerification: string[] = [];
  if (!house) fieldVerification.push("Confirm whether a deck side connects to the house.");
  else if (house.attachment === "unknown") fieldVerification.push("Verify the house attachment and flashing approach in the field.");
  fieldVerification.push("Verify deck height, grade, openings, and site dimensions before construction.");
  fieldVerification.push(...clearances.map((warning) => warning.message));
  const stairCount = platform.construction.stairSystems.length;
  const landingCount = platform.construction.stairSystems.reduce((sum, system) => sum + system.landings.length, 0);
  const items: readonly LayoutReviewItemV3[] = Object.freeze([
    Object.freeze({ id: "outline", label: "Deck outline", value: `${squareFeet(measurements.netAreaSquareInches)} · ${feet(measurements.outerPerimeterInches)} perimeter · ${measurements.outerEdgeCount} sides`, status: "confirmed" as const }),
    Object.freeze({ id: "height", label: "Height above grade", value: feet(platform.elevation - normalized.siteContext.gradeElevation), status: "confirmed" as const }),
    Object.freeze({ id: "house", label: "House connection", value: !house ? "Not recorded" : house.attachment === "unknown" ? "Side recorded · attachment needs field review" : `${house.attachment} intent recorded`, status: (!house || house.attachment === "unknown" ? "field_verify" : "confirmed") as LayoutReviewStatusV3 }),
    Object.freeze({ id: "stairs", label: "Stairs and landings", value: stairCount ? `${stairCount} stair system${stairCount === 1 ? "" : "s"} · ${landingCount} landing${landingCount === 1 ? "" : "s"}` : "No stairs added", status: hasUnfinishedStairs ? "finish_required" as const : "confirmed" as const }),
    Object.freeze({ id: "cutouts", label: "Cutouts", value: `${measurements.holeCount} recorded`, status: "confirmed" as const }),
    Object.freeze({ id: "geometry", label: "Geometry and framing", value: geometryWarnings.length ? `${collisions.length} collision${collisions.length === 1 ? "" : "s"} · ${clearances.length} clearance note${clearances.length === 1 ? "" : "s"}` : "None detected", status: collisions.length ? "finish_required" as const : clearances.length ? "field_verify" as const : "confirmed" as const }),
  ]);
  return Object.freeze({ platformId, readyToContinue: blockers.length === 0, items, blockers: Object.freeze(blockers), fieldVerification: Object.freeze(fieldVerification), geometryWarnings: Object.freeze([...geometryWarnings]) });
}
