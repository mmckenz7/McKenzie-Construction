import { derivePlatformGeometryV3 } from "./geometryV3";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";

export type DeckProjectionQuantityV3 = Readonly<{
  key: string;
  quantityClass: "takeoff_candidate" | "visualization";
  amount: number;
  unit: "sq ft" | "lin ft" | "each";
  assemblyIntent: "railing" | "stair" | "stair_stringer" | "stair_landing";
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
  if (platform.construction.stairs.enabled) {
    const stair = platform.construction.stairs;
    const stringerInches = geometry.stairStringers.reduce((sum, stringer) => sum + Math.hypot(
      stringer.end.x - stringer.start.x,
      stringer.end.y - stringer.start.y,
      stringer.end.z - stringer.start.z,
    ), 0);
    quantities.push(
      Object.freeze({
        key: "stair-tread-count",
        quantityClass: "visualization" as const,
        amount: geometry.stairTreads.length,
        unit: "each" as const,
        assemblyIntent: "stair" as const,
        sourceGeometry: Object.freeze(geometry.stairTreads.map((tread) => `${platformId}:${tread.id}`)),
        explanation: `${stair.edgeId} edge: ceiling of ${geometry.stairRise} in deck-to-grade rise divided by ${stair.maxRiserHeight} in maximum riser`,
      }),
      Object.freeze({
        key: "stair-run",
        quantityClass: "visualization" as const,
        amount: feet(geometry.stairTreads.length * stair.treadDepth),
        unit: "lin ft" as const,
        assemblyIntent: "stair" as const,
        sourceGeometry: Object.freeze(geometry.stairTreads.map((tread) => `${platformId}:${tread.id}`)),
        explanation: `${geometry.stairTreads.length} treads multiplied by ${stair.treadDepth} in conceptual tread depth`,
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
    );
    if (geometry.landing) {
      const landingRailInches = geometry.landingRailSegments.reduce((sum, rail) => sum + memberLength(rail), 0);
      quantities.push(
        Object.freeze({
          key: "stair-landing-area",
          quantityClass: "visualization" as const,
          amount: squareFeet(geometry.landing.width * geometry.landing.depth),
          unit: "sq ft" as const,
          assemblyIntent: "stair_landing" as const,
          sourceGeometry: Object.freeze([`${platformId}:${geometry.landing.id}`]),
          explanation: `${geometry.landing.width} in by ${geometry.landing.depth} in conceptual top landing`,
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
