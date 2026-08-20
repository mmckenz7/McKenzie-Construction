import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV3 } from "./modelV3";

export function toggleRailingOnExactEdge(platform: DeckPlatformV3, edgeId: string): DeckPlatformV3["construction"]["railing"] {
  const condition = platform.edgeConditions.find((item) => item.edgeId === edgeId);
  if (!condition) throw new RangeError("The selected railing side no longer exists.");
  if (condition.condition !== "free") throw new RangeError("Railings can be changed only on a free deck side, not the house side.");
  const enabled = new Set(platform.construction.railing.enabledEdgeIds);
  if (enabled.has(edgeId)) enabled.delete(edgeId); else enabled.add(edgeId);
  const enabledEdgeIds = platform.edgeConditions.filter((item) => item.condition === "free" && enabled.has(item.edgeId)).map((item) => item.edgeId);
  return Object.freeze({ ...platform.construction.railing, enabledEdgeIds: Object.freeze(enabledEdgeIds) });
}

export function railingStageSummary(platform: DeckPlatformV3) {
  const freeEdgeIds = platform.edgeConditions.filter((item) => item.condition === "free").map((item) => item.edgeId);
  return Object.freeze({
    freeEdgeCount: freeEdgeIds.length,
    enabledEdgeCount: freeEdgeIds.filter((edgeId) => platform.construction.railing.enabledEdgeIds.includes(edgeId)).length,
  });
}

export function railingAssemblySummary(platform: DeckPlatformV3, geometry: DeckPlatformGeometryV3) {
  const deckLinearInches = geometry.railSegments.reduce((sum, rail) => sum + Math.hypot(
    rail.end.x - rail.start.x,
    rail.end.z - rail.start.z,
  ), 0);
  const stairLinearInches = geometry.stairRailSegments.reduce((sum, rail) => sum + Math.hypot(
    rail.end.x - rail.start.x,
    rail.end.y - rail.start.y,
    rail.end.z - rail.start.z,
  ), 0);
  const landingLinearInches = geometry.landingRailSegments.reduce((sum, rail) => sum + Math.hypot(
    rail.end.x - rail.start.x,
    rail.end.z - rail.start.z,
  ), 0);

  return Object.freeze({
    deck: Object.freeze({ segmentCount: geometry.railSegments.length, linearInches: deckLinearInches }),
    stairs: Object.freeze({
      present: platform.construction.stairSystems.length > 0,
      segmentCount: geometry.stairRailSegments.length,
      postCount: geometry.stairRailPosts.length,
      linearInches: stairLinearInches,
    }),
    landing: Object.freeze({
      present: geometry.landings.length > 0,
      segmentCount: geometry.landingRailSegments.length,
      postCount: geometry.landingRailPosts.length,
      linearInches: landingLinearInches,
    }),
  });
}
