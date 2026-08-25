import { deriveEdgeFinishGeometryV5 } from "./edgeFinishProjectionV5";
import { deriveDeckAccessoryProjectionV4 } from "./quantityProjectionV4";
import { deckDesignV5ToV4Compatibility, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";

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

export function deriveDeckAccessoryProjectionV5(design: DeckDesignV5, platformId: string): DeckAccessoryProjectionReportV5 {
  const normalized = normalizeDeckDesignV5(design);
  const base = deriveDeckAccessoryProjectionV4(deckDesignV5ToV4Compatibility(normalized), platformId);
  const geometry = deriveEdgeFinishGeometryV5(normalized, platformId);
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
