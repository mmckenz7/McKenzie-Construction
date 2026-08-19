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

export type PolygonRegionReplacementResult = Readonly<{
  command: "replace_polygon_region";
  design: DeckDesignV3;
  notices: readonly string[];
  plan: PolygonRegionReplacementPlan;
}>;

export class PolygonEdgeReviewRequiredError extends Error {
  readonly plan: PolygonRegionReplacementPlan;

  constructor(plan: PolygonRegionReplacementPlan) {
    super("Polygon region replacement requires explicit edge-attachment review.");
    this.name = "PolygonEdgeReviewRequiredError";
    this.plan = plan;
  }
}

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

export function applyPolygonRegionReplacement(
  design: DeckDesignV3,
  platformId: string,
  proposedRegion: PolygonRegion,
): PolygonRegionReplacementResult {
  const normalizedDesign = normalizeDeckDesignV3(design);
  const plan = planPolygonRegionReplacement(normalizedDesign, platformId, proposedRegion);
  if (!plan.safeToApplyWithoutReview) throw new PolygonEdgeReviewRequiredError(plan);
  const platform = normalizedDesign.platforms.find((candidate) => candidate.id === platformId)!;
  const nextRegion = normalizePolygonRegion(proposedRegion);
  const nextEdges = deriveGeometricPolygonEdges(nextRegion.outer);
  const conditionByPrevious = new Map(platform.edgeConditions.map((condition) => [condition.edgeId, condition]));
  const conditionByNext = new Map<string, DeckDesignV3["platforms"][number]["edgeConditions"][number]>();
  for (const resolution of plan.resolutions) {
    const previousCondition = conditionByPrevious.get(resolution.previousEdgeId)!;
    if (resolution.status === "preserved" || resolution.status === "remapped") {
      conditionByNext.set(resolution.candidateEdgeIds[0], Object.freeze({
        ...previousCondition,
        edgeId: resolution.candidateEdgeIds[0],
      }));
    } else {
      for (const candidateEdgeId of resolution.candidateEdgeIds) {
        conditionByNext.set(candidateEdgeId, Object.freeze({ edgeId: candidateEdgeId, condition: "free", attachment: "none" }));
      }
    }
  }
  const edgeConditions = Object.freeze(nextEdges.map((edge) => conditionByNext.get(edge.id) ?? Object.freeze({
    edgeId: edge.id,
    condition: "free" as const,
    attachment: "none" as const,
  })));
  const remapReference = (edgeId: string): string => {
    const resolution = plan.resolutions.find((candidate) => candidate.previousEdgeId === edgeId);
    if (!resolution || (resolution.status !== "preserved" && resolution.status !== "remapped")) {
      throw new PolygonEdgeReviewRequiredError(plan);
    }
    return resolution.candidateEdgeIds[0];
  };
  const remapInactiveStairReference = (edgeId: string): string => {
    const resolution = plan.resolutions.find((candidate) => candidate.previousEdgeId === edgeId);
    if (resolution && (resolution.status === "preserved" || resolution.status === "remapped")) {
      const nextEdgeId = resolution.candidateEdgeIds[0];
      if (edgeConditions.some((condition) => condition.edgeId === nextEdgeId && condition.condition === "free")) return nextEdgeId;
    }
    const freeEdge = edgeConditions.find((condition) => condition.condition === "free");
    if (!freeEdge) throw new RangeError("An edited platform must retain at least one free edge.");
    return freeEdge.edgeId;
  };
  const nextStairEdgeId = platform.construction.stairs.enabled
    ? remapReference(platform.construction.stairs.edgeId)
    : remapInactiveStairReference(platform.construction.stairs.edgeId);
  const nextPlatform = Object.freeze({
    ...platform,
    region: nextRegion,
    edgeConditions,
    construction: Object.freeze({
      ...platform.construction,
      railing: Object.freeze({
        ...platform.construction.railing,
        enabledEdgeIds: Object.freeze(platform.construction.railing.enabledEdgeIds.map(remapReference)),
      }),
      stairs: Object.freeze({
        ...platform.construction.stairs,
        edgeId: nextStairEdgeId,
      }),
    }),
  });
  const nextDesign = normalizeDeckDesignV3({
    ...normalizedDesign,
    platforms: normalizedDesign.platforms.map((candidate) => candidate.id === platformId ? nextPlatform : candidate),
    metadata: { ...normalizedDesign.metadata, revision: normalizedDesign.metadata.revision + 1 },
  });
  const defaultedFreeEdges = nextEdges.filter((edge) => !conditionByNext.has(edge.id)).length;
  return Object.freeze({
    command: "replace_polygon_region",
    design: nextDesign,
    notices: Object.freeze([
      `Platform ${platformId} region replaced at revision ${nextDesign.metadata.revision}.`,
      ...(plan.automaticRemaps.length > 0 ? [`${plan.automaticRemaps.length} edge references remapped geometrically.`] : []),
      ...(defaultedFreeEdges > 0 ? [`${defaultedFreeEdges} new edges defaulted to free with no attachment intent.`] : []),
      ...(!platform.construction.stairs.enabled && nextStairEdgeId !== platform.construction.stairs.edgeId
        ? ["Inactive stair placeholder followed the edited outline; no active stair geometry was moved."]
        : []),
    ]),
    plan,
  });
}
