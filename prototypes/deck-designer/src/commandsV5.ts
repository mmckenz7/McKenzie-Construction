import { applyPolygonRegionReplacement, planPolygonRegionReplacement } from "./commandsV3";
import type { PolygonEdgeReferenceResolution } from "./polygon";
import type { PolygonRegion } from "./polygonRegion";
import { deckDesignV5ToV3Compatibility, migrateDeckDesignToV5, normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";
import { assertHouseBoundariesPreservedV5 } from "./houseBoundaryV5";

export type EdgeReferenceUsageV5 = "house_attachment" | "railing" | "stairs" | "fascia" | "skirting";
export type EdgeReferenceImpactV5 = Readonly<{
  platformId: string;
  previousEdgeId: string;
  usages: readonly EdgeReferenceUsageV5[];
  status: "review_required" | "missing";
  candidateEdgeIds: readonly string[];
}>;

export type PolygonRegionReplacementPlanV5 = Readonly<{
  platformId: string;
  safeToApplyWithoutReview: boolean;
  resolutions: readonly PolygonEdgeReferenceResolution[];
  automaticRemaps: readonly Readonly<{ previousEdgeId: string; nextEdgeId: string }>[];
  addedEdgeIds: readonly string[];
  impacts: readonly EdgeReferenceImpactV5[];
}>;

export class PolygonEdgeReviewRequiredErrorV5 extends Error {
  readonly plan: PolygonRegionReplacementPlanV5;

  constructor(plan: PolygonRegionReplacementPlanV5) {
    super("Polygon region replacement requires explicit edge-attachment or finish review.");
    this.name = "PolygonEdgeReviewRequiredErrorV5";
    this.plan = plan;
  }
}

export function planPolygonRegionReplacementV5(
  design: DeckDesignV5,
  platformId: string,
  proposedRegion: PolygonRegion,
): PolygonRegionReplacementPlanV5 {
  const normalized = normalizeDeckDesignV5(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  assertHouseBoundariesPreservedV5(platform, proposedRegion.outer);
  const base = planPolygonRegionReplacement(deckDesignV5ToV3Compatibility(normalized), platformId, proposedRegion);
  const finishByEdge = new Map(platform.construction.edgeFinishes.map((finish) => [finish.edgeId, finish]));
  const impacts = base.impacts.map((impact): EdgeReferenceImpactV5 => Object.freeze({ ...impact, usages: Object.freeze([...impact.usages]) }));
  for (const resolution of base.resolutions) {
    if (resolution.status !== "review_required" && resolution.status !== "missing") continue;
    const finish = finishByEdge.get(resolution.previousEdgeId);
    if (!finish) continue;
    const usages: EdgeReferenceUsageV5[] = [];
    if (finish.fasciaEnabled) usages.push("fascia");
    if (finish.skirtingEnabled) usages.push("skirting");
    const existing = impacts.find((impact) => impact.previousEdgeId === resolution.previousEdgeId);
    if (existing) {
      const index = impacts.indexOf(existing);
      impacts[index] = Object.freeze({ ...existing, usages: Object.freeze([...existing.usages, ...usages]) });
    } else {
      impacts.push(Object.freeze({ platformId, previousEdgeId: resolution.previousEdgeId, usages: Object.freeze(usages), status: resolution.status, candidateEdgeIds: resolution.candidateEdgeIds }));
    }
  }
  return Object.freeze({ ...base, safeToApplyWithoutReview: impacts.length === 0, impacts: Object.freeze(impacts) });
}

export function applyPolygonRegionReplacementV5(
  design: DeckDesignV5,
  platformId: string,
  proposedRegion: PolygonRegion,
) {
  const normalized = normalizeDeckDesignV5(design);
  const plan = planPolygonRegionReplacementV5(normalized, platformId, proposedRegion);
  if (!plan.safeToApplyWithoutReview) throw new PolygonEdgeReviewRequiredErrorV5(plan);
  const applied = applyPolygonRegionReplacement(deckDesignV5ToV3Compatibility(normalized), platformId, proposedRegion);
  const migrated = migrateDeckDesignToV5(applied.design);
  const remap = (edgeId: string): string => {
    const resolution = plan.resolutions.find((candidate) => candidate.previousEdgeId === edgeId);
    if (!resolution || (resolution.status !== "preserved" && resolution.status !== "remapped")) throw new PolygonEdgeReviewRequiredErrorV5(plan);
    return resolution.candidateEdgeIds[0];
  };
  const restored = normalizeDeckDesignV5({
    ...migrated,
    platforms: migrated.platforms.map((platform) => {
      const previous = normalized.platforms.find((candidate) => candidate.id === platform.id)!;
      return {
        ...platform,
        construction: {
          ...platform.construction,
          framing: previous.construction.framing,
          edgeFinishes: platform.id === platformId
            ? previous.construction.edgeFinishes.map((finish) => ({ ...finish, edgeId: remap(finish.edgeId) }))
            : previous.construction.edgeFinishes,
        },
      };
    }),
  });
  return Object.freeze({
    command: "replace_polygon_region" as const,
    design: restored,
    notices: Object.freeze([
      ...applied.notices,
      ...(normalized.platforms.find((platform) => platform.id === platformId)!.construction.edgeFinishes.length > 0
        ? ["Selected fascia and skirting references were preserved or uniquely remapped."]
        : []),
    ]),
    plan,
  });
}
