import { derivePolygonEdges, type PolygonPoint } from "./polygon";
import { normalizePolygonRegion, polygonRegionArea, type PolygonRegion } from "./polygonRegion";
import { derivePolygonMembers } from "./polygonProjection";
import type { DeckBoardDirection } from "./polygonProjection";

export type ProjectionQuantityClass = "takeoff_candidate" | "visualization";
export type ProjectionQuantity = Readonly<{
  key: string;
  quantityClass: ProjectionQuantityClass;
  amount: number;
  unit: "sq ft" | "lin ft" | "each";
  assemblyIntent: "platform_surface" | "outer_boundary" | "hole_boundary" | "decking_layout" | "joist_layout";
  sourceGeometry: readonly string[];
  explanation: string;
}>;

export type PolygonProjectionReport = Readonly<{
  reportVersion: 1;
  regionId: string;
  coordinateUnits: "in";
  measurements: Readonly<{
    netAreaSquareInches: number;
    outerPerimeterInches: number;
    holeAreaSquareInches: number;
    holePerimeterInches: number;
    outerEdgeCount: number;
    holeCount: number;
  }>;
  quantities: readonly ProjectionQuantity[];
  warnings: readonly [
    "conceptual_not_for_construction",
    "field_verification_required",
    "framing_intent_not_structural",
  ];
}>;

const length = (start: PolygonPoint, end: PolygonPoint): number =>
  Math.hypot(end.x - start.x, end.z - start.z);
const round = (value: number): number => Math.round(value * 100) / 100;
const feet = (inches: number): number => round(inches / 12);
const squareFeet = (squareInches: number): number => round(squareInches / 144);
const perimeter = (points: readonly PolygonPoint[]): number =>
  points.reduce((sum, point, index) => sum + length(point, points[(index + 1) % points.length]), 0);

export function derivePolygonProjectionReport(
  regionId: string,
  region: PolygonRegion,
  options: Readonly<{ boardWidth: number; gap: number; joistSpacing: number; boardDirection?: DeckBoardDirection }>,
): PolygonProjectionReport {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(regionId)) {
    throw new TypeError("Region ID must be a stable lowercase identifier of 1 to 64 characters.");
  }
  const normalized = normalizePolygonRegion(region);
  const members = derivePolygonMembers(normalized, options);
  const grossArea = Math.abs(normalized.outer.reduce((sum, point, index) => {
    const next = normalized.outer[(index + 1) % normalized.outer.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2);
  const netArea = polygonRegionArea(normalized);
  const holeArea = grossArea - netArea;
  const outerPerimeter = perimeter(normalized.outer);
  const holePerimeter = normalized.holes.reduce((sum, hole) => sum + perimeter(hole), 0);
  const outerEdges = derivePolygonEdges(normalized.outer);
  const quantities: readonly ProjectionQuantity[] = Object.freeze([
    Object.freeze({
      key: "platform-area",
      quantityClass: "takeoff_candidate" as const,
      amount: squareFeet(netArea),
      unit: "sq ft" as const,
      assemblyIntent: "platform_surface" as const,
      sourceGeometry: Object.freeze([`${regionId}:outer`, ...normalized.holes.map((_, index) => `${regionId}:hole-${index + 1}`)]),
      explanation: `${round(grossArea)} sq in gross minus ${round(holeArea)} sq in of recorded holes, divided by 144`,
    }),
    Object.freeze({
      key: "outer-perimeter",
      quantityClass: "takeoff_candidate" as const,
      amount: feet(outerPerimeter),
      unit: "lin ft" as const,
      assemblyIntent: "outer_boundary" as const,
      sourceGeometry: Object.freeze(outerEdges.map((edge) => `${regionId}:${edge.id}`)),
      explanation: `${outerEdges.length} normalized outer edges totaling ${round(outerPerimeter)} in`,
    }),
    Object.freeze({
      key: "hole-perimeter",
      quantityClass: "takeoff_candidate" as const,
      amount: feet(holePerimeter),
      unit: "lin ft" as const,
      assemblyIntent: "hole_boundary" as const,
      sourceGeometry: Object.freeze(normalized.holes.map((_, index) => `${regionId}:hole-${index + 1}`)),
      explanation: `${normalized.holes.length} recorded hole rings totaling ${round(holePerimeter)} in`,
    }),
    Object.freeze({
      key: "decking-linear-feet",
      quantityClass: "takeoff_candidate" as const,
      amount: feet(members.surfaceBoardLength),
      unit: "lin ft" as const,
      assemblyIntent: "decking_layout" as const,
      sourceGeometry: Object.freeze(members.surfaceBoards.map((member) => `${regionId}:${member.id}`)),
      explanation: `${members.surfaceBoards.length} projected board segments totaling ${members.surfaceBoardLength} in; no waste or product-length conversion applied`,
    }),
    Object.freeze({
      key: "joist-linear-feet",
      quantityClass: "visualization" as const,
      amount: feet(members.joistLength),
      unit: "lin ft" as const,
      assemblyIntent: "joist_layout" as const,
      sourceGeometry: Object.freeze(members.joists.map((member) => `${regionId}:${member.id}`)),
      explanation: `${members.joists.length} conceptual joist segments totaling ${members.joistLength} in; structural sizing and count are not determined`,
    }),
    Object.freeze({
      key: "joist-segment-count",
      quantityClass: "visualization" as const,
      amount: members.joists.length,
      unit: "each" as const,
      assemblyIntent: "joist_layout" as const,
      sourceGeometry: Object.freeze(members.joists.map((member) => `${regionId}:${member.id}`)),
      explanation: "Count of projected visualization segments after splitting conceptual joist lines around recorded holes",
    }),
  ]);
  return Object.freeze({
    reportVersion: 1,
    regionId,
    coordinateUnits: "in",
    measurements: Object.freeze({
      netAreaSquareInches: round(netArea),
      outerPerimeterInches: round(outerPerimeter),
      holeAreaSquareInches: round(holeArea),
      holePerimeterInches: round(holePerimeter),
      outerEdgeCount: outerEdges.length,
      holeCount: normalized.holes.length,
    }),
    quantities,
    warnings: Object.freeze([
      "conceptual_not_for_construction",
      "field_verification_required",
      "framing_intent_not_structural",
    ] as const),
  });
}

export function stablePolygonProjectionReportJson(report: PolygonProjectionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
