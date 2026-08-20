import { derivePlatformGeometryV3 } from "./geometryV3";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";

export type DeckProjectionQuantityV3 = Readonly<{
  key: string;
  quantityClass: "takeoff_candidate" | "visualization";
  amount: number;
  unit: "sq ft" | "lin ft" | "each";
  assemblyIntent: "railing" | "stair" | "stair_stringer" | "stair_landing" | "stair_railing";
  sourceGeometry: readonly string[];
  explanation: string;
}>;

export type DeckAccessoryProjectionReportV3 = Readonly<{
  reportVersion: 1;
  designSchemaVersion: 3;
  platformId: string;
  coordinateUnits: "in";
  quantities: readonly DeckProjectionQuantityV3[];
  warnings: readonly [
    "conceptual_not_for_construction",
    "field_verification_required",
    "structural_design_not_determined",
  ];
}>;

const round = (value: number): number => Math.round(value * 100) / 100;
const feet = (inches: number): number => round(inches / 12);
const squareFeet = (squareInches: number): number => round(squareInches / 144);
const memberLength = (member: Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>): number =>
  Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z);

export function deriveDeckAccessoryProjectionV3(
  design: DeckDesignV3,
  platformId: string,
): DeckAccessoryProjectionReportV3 {
  const normalized = normalizeDeckDesignV3(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const geometry = derivePlatformGeometryV3(normalized, platformId);
  const railInches = geometry.railSegments.reduce((sum, rail) => sum + memberLength(rail), 0);
  const quantities: DeckProjectionQuantityV3[] = [
    Object.freeze({
      key: "railing-linear-feet",
      quantityClass: "takeoff_candidate" as const,
      amount: feet(railInches),
      unit: "lin ft" as const,
      assemblyIntent: "railing" as const,
      sourceGeometry: Object.freeze(geometry.railSegments.map((rail) => `${platformId}:${rail.id}`)),
      explanation: `${geometry.railSegments.length} enabled free-edge railing segments totaling ${round(railInches)} in`,
    }),
    Object.freeze({
      key: "railing-post-count",
      quantityClass: "visualization" as const,
      amount: geometry.railPosts.length,
      unit: "each" as const,
      assemblyIntent: "railing" as const,
      sourceGeometry: Object.freeze(geometry.railPosts.map((post) => `${platformId}:${post.id}`)),
      explanation: `Conceptual unique railing endpoints and intermediate posts in bays not exceeding ${platform.construction.framing.maxPostSpacing} in`,
    }),
  ];
  if (platform.construction.stairSystems.length > 0) {
    const stairSystems = platform.construction.stairSystems;
    const connectedFlights = stairSystems.reduce((sum, system) => sum + system.landings.reduce((landingSum, landing) => landingSum + landing.connections.length, 0), 0);
    const stringerInches = geometry.stairStringers.reduce((sum, stringer) => sum + Math.hypot(
      stringer.end.x - stringer.start.x,
      stringer.end.y - stringer.start.y,
      stringer.end.z - stringer.start.z,
    ), 0);
    const stairRailInches = geometry.stairRailSegments.reduce((sum, rail) => sum + Math.hypot(
      rail.end.x - rail.start.x,
      rail.end.y - rail.start.y,
      rail.end.z - rail.start.z,
    ), 0);
    quantities.push(
      Object.freeze({
        key: "stair-tread-count",
        quantityClass: "visualization" as const,
        amount: geometry.stairTreads.length,
        unit: "each" as const,
        assemblyIntent: "stair" as const,
        sourceGeometry: Object.freeze(geometry.stairTreads.map((tread) => `${platformId}:${tread.id}`)),
        explanation: `${stairSystems.length} recorded stair system${stairSystems.length === 1 ? "" : "s"} plus ${connectedFlights} shared-landing flight${connectedFlights === 1 ? "" : "s"}; every tread derives from recorded rise and tread intent`,
      }),
      Object.freeze({
        key: "stair-run",
        quantityClass: "visualization" as const,
        amount: feet(geometry.stairTreads.reduce((sum, tread) => sum + tread.depth, 0)),
        unit: "lin ft" as const,
        assemblyIntent: "stair" as const,
        sourceGeometry: Object.freeze(geometry.stairTreads.map((tread) => `${platformId}:${tread.id}`)),
        explanation: `${geometry.stairTreads.length} system-scoped treads summed from their recorded conceptual tread depths`,
      }),
      Object.freeze({
        key: "stair-stringer-count",
        quantityClass: "visualization" as const,
        amount: geometry.stairStringers.length,
        unit: "each" as const,
        assemblyIntent: "stair_stringer" as const,
        sourceGeometry: Object.freeze(geometry.stairStringers.map((stringer) => `${platformId}:${stringer.id}`)),
        explanation: "Conceptual side stringer paths for visualization; structural count is not determined",
      }),
      Object.freeze({
        key: "stair-stringer-linear-feet",
        quantityClass: "visualization" as const,
        amount: feet(stringerInches),
        unit: "lin ft" as const,
        assemblyIntent: "stair_stringer" as const,
        sourceGeometry: Object.freeze(geometry.stairStringers.map((stringer) => `${platformId}:${stringer.id}`)),
        explanation: `${geometry.stairStringers.length} conceptual side paths totaling ${round(stringerInches)} in; structural sizing is not determined`,
      }),
      Object.freeze({
        key: "stair-railing-linear-feet",
        quantityClass: "takeoff_candidate" as const,
        amount: feet(stairRailInches),
        unit: "lin ft" as const,
        assemblyIntent: "stair_railing" as const,
        sourceGeometry: Object.freeze(geometry.stairRailSegments.map((rail) => `${platformId}:${rail.id}`)),
        explanation: `${geometry.stairRailSegments.length} conceptual descending-side handrail paths totaling ${round(stairRailInches)} in; final code and product assembly require review`,
      }),
      Object.freeze({
        key: "stair-railing-post-count",
        quantityClass: "visualization" as const,
        amount: geometry.stairRailPosts.length,
        unit: "each" as const,
        assemblyIntent: "stair_railing" as const,
        sourceGeometry: Object.freeze(geometry.stairRailPosts.map((post) => `${platformId}:${post.id}`)),
        explanation: "Conceptual top and bottom posts on both stair sides; intermediate balusters and final assembly are not determined",
      }),
    );
    if (geometry.landings.length > 0) {
      const landingRailInches = geometry.landingRailSegments.reduce((sum, rail) => sum + memberLength(rail), 0);
      const landingArea = geometry.landings.reduce((sum, landing) => sum + landing.width * landing.depth, 0);
      quantities.push(
        Object.freeze({
          key: "stair-landing-area",
          quantityClass: "visualization" as const,
          amount: squareFeet(landingArea),
          unit: "sq ft" as const,
          assemblyIntent: "stair_landing" as const,
          sourceGeometry: Object.freeze(geometry.landings.map((landing) => `${platformId}:${landing.id}`)),
          explanation: geometry.landings.length === 1
            ? `${geometry.landings[0].width} in by ${geometry.landings[0].depth} in conceptual ${geometry.landings[0].position} landing at ${round(geometry.landings[0].y)} in elevation in ${geometry.landings[0].systemId}`
            : `${geometry.landings.length} system-associated landings totaling ${round(landingArea)} sq in at recorded stair-route elevations; shared junctions are counted once`,
        }),
        Object.freeze({
          key: "landing-support-post-count",
          quantityClass: "visualization" as const,
          amount: geometry.landingSupportPosts.length,
          unit: "each" as const,
          assemblyIntent: "stair_landing" as const,
          sourceGeometry: Object.freeze(geometry.landingSupportPosts.map((post) => `${platformId}:${post.id}`)),
          explanation: "Conceptual outer landing support locations; structural count is not determined",
        }),
        Object.freeze({
          key: "landing-railing-linear-feet",
          quantityClass: "takeoff_candidate" as const,
          amount: feet(landingRailInches),
          unit: "lin ft" as const,
          assemblyIntent: "stair_landing" as const,
          sourceGeometry: Object.freeze(geometry.landingRailSegments.map((rail) => `${platformId}:${rail.id}`)),
          explanation: `${geometry.landingRailSegments.length} conceptual landing-side segments totaling ${round(landingRailInches)} in`,
        }),
        Object.freeze({
          key: "landing-railing-post-count",
          quantityClass: "visualization" as const,
          amount: geometry.landingRailPosts.length,
          unit: "each" as const,
          assemblyIntent: "stair_landing" as const,
          sourceGeometry: Object.freeze(geometry.landingRailPosts.map((post) => `${platformId}:${post.id}`)),
          explanation: "Conceptual landing-side endpoints; final assembly posts are not determined",
        }),
      );
    }
  }
  return Object.freeze({
    reportVersion: 1,
    designSchemaVersion: 3,
    platformId,
    coordinateUnits: "in",
    quantities: Object.freeze(quantities),
    warnings: Object.freeze([
      "conceptual_not_for_construction",
      "field_verification_required",
      "structural_design_not_determined",
    ] as const),
  });
}

export function stableDeckAccessoryProjectionV3Json(report: DeckAccessoryProjectionReportV3): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
