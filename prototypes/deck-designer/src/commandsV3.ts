import {
  deriveGeometricPolygonEdges,
  resolveGeometricEdgeReference,
  type PolygonEdgeReferenceResolution,
} from "./polygon";
import { normalizePolygonRegion, type PolygonRegion } from "./polygonRegion";
import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";

export type EdgeReferenceUsage = "house_attachment" | "railing" | "stairs";
export type EdgeReferenceImpact = Readonly<{
  platformId: string;
  previousEdgeId: string;
  usages: readonly EdgeReferenceUsage[];
  status: "review_required" | "missing";
  candidateEdgeIds: readonly string[];
}>;

export type PolygonRegionReplacementPlan = Readonly<{
  platformId: string;
  safeToApplyWithoutReview: boolean;
  resolutions: readonly PolygonEdgeReferenceResolution[];
  automaticRemaps: readonly Readonly<{ previousEdgeId: string; nextEdgeId: string }>[];
  addedEdgeIds: readonly string[];
  impacts: readonly EdgeReferenceImpact[];
}>;

export function planPolygonRegionReplacement(
  design: DeckDesignV3,
  platformId: string,
  proposedRegion: PolygonRegion,
): PolygonRegionReplacementPlan {
  const normalizedDesign = normalizeDeckDesignV3(design);
  const platform = normalizedDesign.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const nextRegion = normalizePolygonRegion(proposedRegion);
  const previousEdges = deriveGeometricPolygonEdges(platform.region.outer);
  const nextEdges = deriveGeometricPolygonEdges(nextRegion.outer);
  const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));
  const resolutions = Object.freeze(previousEdges.map((edge) =>
    resolveGeometricEdgeReference(platform.region.outer, nextRegion.outer, edge.id)));
  const automaticRemaps = Object.freeze(resolutions
    .filter((resolution) => resolution.status === "remapped")
    .map((resolution) => Object.freeze({
      previousEdgeId: resolution.previousEdgeId,
      nextEdgeId: resolution.candidateEdgeIds[0],
    })));
  const claimedNextEdges = new Set(resolutions.flatMap((resolution) => resolution.candidateEdgeIds));
  const addedEdgeIds = Object.freeze([...nextEdgeIds].filter((edgeId) => !claimedNextEdges.has(edgeId)).sort());
  const impacts: EdgeReferenceImpact[] = [];
  for (const resolution of resolutions) {
    if (resolution.status !== "review_required" && resolution.status !== "missing") continue;
    const usages: EdgeReferenceUsage[] = [];
    const condition = platform.edgeConditions.find((candidate) => candidate.edgeId === resolution.previousEdgeId);
    if (condition?.condition === "house_attachment") usages.push("house_attachment");
    if (platform.construction.railing.enabledEdgeIds.includes(resolution.previousEdgeId)) usages.push("railing");
    if (platform.construction.stairs.enabled && platform.construction.stairs.edgeId === resolution.previousEdgeId) usages.push("stairs");
    if (usages.length === 0) continue;
    impacts.push(Object.freeze({
      platformId,
      previousEdgeId: resolution.previousEdgeId,
      usages: Object.freeze(usages),
      status: resolution.status,
      candidateEdgeIds: resolution.candidateEdgeIds,
    }));
  }
  return Object.freeze({
    platformId,
    safeToApplyWithoutReview: impacts.length === 0,
    resolutions,
    automaticRemaps,
    addedEdgeIds,
    impacts: Object.freeze(impacts),
  });
}
