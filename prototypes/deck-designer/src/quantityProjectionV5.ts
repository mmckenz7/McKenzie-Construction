import { derivePlatformGeometryV5, type DeckPlatformGeometryV5 } from "./geometryV5";
import { normalizeDeckDesignV5, v4CompatibilityPlatform, type DeckDesignV5, type DeckPlatformV5 } from "./modelV5";
import { deriveDeckAccessoryProjectionV4FromGeometry } from "./quantityProjectionV4";

export type DeckProjectionQuantityV5 = Readonly<{
  key: string;
  quantityClass: "takeoff_candidate" | "visualization";
  amount: number;
  unit: "sq ft" | "lin ft" | "each";
  assemblyIntent: "framing" | "railing" | "stair" | "stair_stringer" | "stair_landing" | "stair_railing" | "fascia" | "skirting";
  sourceGeometry: readonly string[];
  explanation: string;
}>;

export type DeckAccessoryProjectionReportV5 = Readonly<{
  reportVersion: 1;
  designSchemaVersion: 5;
  platformId: string;
  coordinateUnits: "in";
  quantities: readonly DeckProjectionQuantityV5[];
  warnings: readonly ["conceptual_not_for_construction", "field_verification_required", "structural_design_not_determined"];
}>;

const round = (value: number): number => Math.round(value * 100) / 100;
const length = (span: Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>) => Math.hypot(span.end.x - span.start.x, span.end.z - span.start.z);

/** @internal Geometry must come from the validated v5 render source or immediate default derivation. */
export function deriveDeckAccessoryProjectionV5FromGeometry(platform: DeckPlatformV5, geometry: DeckPlatformGeometryV5): DeckAccessoryProjectionReportV5 {
  const platformId = platform.id;
  const base = deriveDeckAccessoryProjectionV4FromGeometry(v4CompatibilityPlatform(platform), geometry);
  const fasciaInches = geometry.fasciaSpans.reduce((sum, span) => sum + length(span), 0);
  const skirtingSquareInches = geometry.skirtingPanels.reduce((sum, panel) => sum + length(panel) * (panel.top - panel.bottom), 0);
  const finishes: DeckProjectionQuantityV5[] = [];
  if (geometry.fasciaSpans.length > 0) finishes.push(Object.freeze({
    key: "fascia-linear-feet", quantityClass: "visualization", amount: round(fasciaInches / 12), unit: "lin ft", assemblyIntent: "fascia",
    sourceGeometry: Object.freeze(geometry.fasciaSpans.map((span) => `${platformId}:${span.id}`)),
    explanation: `${geometry.fasciaSpans.length} selected free-edge fascia span${geometry.fasciaSpans.length === 1 ? "" : "s"} totaling ${round(fasciaInches)} in after stair openings; product, waste, and installation details are not determined`,
  }));
  if (geometry.skirtingPanels.length > 0) finishes.push(Object.freeze({
    key: "skirting-area", quantityClass: "visualization", amount: round(skirtingSquareInches / 144), unit: "sq ft", assemblyIntent: "skirting",
    sourceGeometry: Object.freeze(geometry.skirtingPanels.map((panel) => `${platformId}:${panel.id}`)),
    explanation: `${geometry.skirtingPanels.length} selected free-edge conceptual panel${geometry.skirtingPanels.length === 1 ? "" : "s"} measured from recorded grade to deck elevation after stair openings; product, ventilation, access, waste, and installation details are not determined`,
  }));
  return Object.freeze({ ...base, designSchemaVersion: 5, quantities: Object.freeze([...base.quantities, ...finishes]) as readonly DeckProjectionQuantityV5[] });
}

export function deriveDeckAccessoryProjectionV5(design: DeckDesignV5, platformId: string): DeckAccessoryProjectionReportV5 {
  const normalized = normalizeDeckDesignV5(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  return deriveDeckAccessoryProjectionV5FromGeometry(platform, derivePlatformGeometryV5(normalized, platformId));
}
