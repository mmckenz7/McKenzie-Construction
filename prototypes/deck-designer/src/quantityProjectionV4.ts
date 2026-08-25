import { derivePlatformGeometryV4, type DeckPlatformGeometryV4 } from "./geometryV4";
import { normalizeDeckDesignV4, v3CompatibilityPlatform, type DeckDesignV4, type DeckPlatformV4 } from "./modelV4";
import { deriveDeckAccessoryProjectionV3FromGeometry, type DeckProjectionQuantityV3 } from "./quantityProjectionV3";

export type DeckAccessoryProjectionReportV4 = Readonly<{
  reportVersion: 1;
  designSchemaVersion: 4;
  platformId: string;
  coordinateUnits: "in";
  quantities: readonly DeckProjectionQuantityV3[];
  warnings: readonly ["conceptual_not_for_construction", "field_verification_required", "structural_design_not_determined"];
}>;

const round = (value: number): number => Math.round(value * 100) / 100;
const memberLength = (member: Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>): number =>
  Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z);

/** @internal Geometry must come from the validated v5 render source or immediate default derivation. */
export function deriveDeckAccessoryProjectionV4FromGeometry(platform: DeckPlatformV4, geometry: DeckPlatformGeometryV4): DeckAccessoryProjectionReportV4 {
  const platformId = platform.id;
  const base = deriveDeckAccessoryProjectionV3FromGeometry(v3CompatibilityPlatform(platform), geometry);
  const beamInches = geometry.beams.reduce((sum, beam) => sum + memberLength(beam), 0);
  const spacingSummary = platform.construction.framing.beamLines.map((line) => `${line.id}: ${line.maxSupportSpacing} in`).join("; ");
  const framing: DeckProjectionQuantityV3[] = [
    Object.freeze({
      key: "beam-linear-feet",
      quantityClass: "visualization",
      amount: round(beamInches / 12),
      unit: "lin ft",
      assemblyIntent: "framing",
      sourceGeometry: Object.freeze(geometry.beams.map((beam) => `${platformId}:${beam.id}`)),
      explanation: `${platform.construction.framing.beamLines.length} recorded conceptual beam line${platform.construction.framing.beamLines.length === 1 ? "" : "s"} create ${geometry.beams.length} clipped segment${geometry.beams.length === 1 ? "" : "s"} totaling ${round(beamInches)} in; structural sizing and placement require qualified review`,
    }),
    Object.freeze({
      key: "support-post-count",
      quantityClass: "visualization",
      amount: geometry.supportPosts.length,
      unit: "each",
      assemblyIntent: "framing",
      sourceGeometry: Object.freeze(geometry.supportPosts.map((post) => `${platformId}:${post.id}`)),
      explanation: `Conceptual endpoints and evenly distributed support locations using each beam line's recorded maximum spacing (${spacingSummary}); footing and structural requirements are not determined`,
    }),
  ];
  return Object.freeze({
    ...base,
    designSchemaVersion: 4,
    quantities: Object.freeze([...framing, ...base.quantities.filter((quantity) => quantity.key !== "beam-linear-feet" && quantity.key !== "support-post-count")]),
  });
}

export function deriveDeckAccessoryProjectionV4(design: DeckDesignV4, platformId: string): DeckAccessoryProjectionReportV4 {
  const normalized = normalizeDeckDesignV4(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  return deriveDeckAccessoryProjectionV4FromGeometry(platform, derivePlatformGeometryV4(normalized, platformId));
}

export function stableDeckAccessoryProjectionV4Json(report: DeckAccessoryProjectionReportV4): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
