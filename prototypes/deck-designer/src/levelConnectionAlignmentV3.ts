import { derivePlatformGeometryV3 } from "./geometryV3";
import { normalizeDeckDesignV3, type DeckDesignV3, type DeckPlatformV3 } from "./modelV3";
import { deriveGeometricPolygonEdges } from "./polygon";
import { translatePlatformRegion } from "./platformPlacementV3";

export type LevelConnectionAlignmentResultV3 = Readonly<{
  design: DeckDesignV3;
  movedPlatformId: string;
  delta: Readonly<{ x: number; z: number }>;
}>;

export function alignLevelConnectionV3(design: DeckDesignV3, sourcePlatformId: string, systemId: string, landingId: string, connectionId: string): LevelConnectionAlignmentResultV3 {
  const normalized = normalizeDeckDesignV3(design);
  const source = normalized.platforms.find((platform) => platform.id === sourcePlatformId);
  const system = source?.construction.stairSystems.find((item) => item.id === systemId);
  const landing = system?.landings.find((item) => item.id === landingId);
  const connection = landing?.connections.find((item) => item.id === connectionId);
  if (!source || !system || !landing || !connection) throw new RangeError("The level connection to align no longer exists.");
  if (connection.destination !== "deck" || !connection.targetPlatformId || !connection.targetEdgeId) throw new RangeError("Only an exact deck-side connection can align levels.");
  const target = normalized.platforms.find((platform) => platform.id === connection.targetPlatformId);
  if (!target) throw new RangeError("The destination level no longer exists.");
  const oldEdges = deriveGeometricPolygonEdges(target.region.outer);
  const targetEdge = oldEdges.find((edge) => edge.id === connection.targetEdgeId);
  if (!targetEdge) throw new RangeError("The destination side no longer exists.");
  const route = derivePlatformGeometryV3(normalized, source.id);
  const stringerEnds = route.stairStringers.filter((stringer) => stringer.id.includes(connection.id)).map((stringer) => stringer.end);
  if (stringerEnds.length !== 2) throw new RangeError("The connected stair endpoint could not be resolved deterministically.");
  const stairEnd = { x: (stringerEnds[0].x + stringerEnds[1].x) / 2, z: (stringerEnds[0].z + stringerEnds[1].z) / 2 };
  const edgeCenter = { x: (targetEdge.start.x + targetEdge.end.x) / 2, z: (targetEdge.start.z + targetEdge.end.z) / 2 };
  const delta = Object.freeze({ x: Math.round((stairEnd.x - edgeCenter.x) * 100) / 100, z: Math.round((stairEnd.z - edgeCenter.z) * 100) / 100 });
  const region = translatePlatformRegion(target.region, delta);
  const newEdges = deriveGeometricPolygonEdges(region.outer);
  const edgeMap = new Map(oldEdges.map((edge, index) => [edge.id, newEdges[index].id]));
  const remap = (edgeId: string) => edgeMap.get(edgeId) ?? edgeId;
  const moved: DeckPlatformV3 = {
    ...target,
    region,
    edgeConditions: target.edgeConditions.map((condition) => ({ ...condition, edgeId: remap(condition.edgeId) })),
    construction: {
      ...target.construction,
      railing: { ...target.construction.railing, enabledEdgeIds: target.construction.railing.enabledEdgeIds.map(remap) },
      stairSystems: target.construction.stairSystems.map((item) => ({ ...item, edgeId: remap(item.edgeId) })),
    },
  };
  const platforms = normalized.platforms.map((platform) => {
    const current = platform.id === target.id ? moved : platform;
    return { ...current, construction: { ...current.construction, stairSystems: current.construction.stairSystems.map((item) => ({ ...item, landings: item.landings.map((itemLanding) => ({ ...itemLanding, connections: itemLanding.connections.map((itemConnection) => itemConnection.targetPlatformId === target.id && itemConnection.targetEdgeId ? { ...itemConnection, targetEdgeId: remap(itemConnection.targetEdgeId) } : itemConnection) })) })) } };
  });
  return Object.freeze({ design: normalizeDeckDesignV3({ ...normalized, platforms, metadata: { ...normalized.metadata, revision: normalized.metadata.revision + 1 } }), movedPlatformId: target.id, delta });
}
