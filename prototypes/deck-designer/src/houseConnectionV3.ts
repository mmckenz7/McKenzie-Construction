import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { deriveGeometricPolygonEdges, pointOnSegment } from "./polygon";
import type { HouseAttachment } from "./model";

export type HouseConnectionInput = Readonly<{
  wallId?: string | null;
  edgeId: string;
  attachment: HouseAttachment;
  doorEnabled: boolean;
  doorOffset: number;
  doorWidth: number;
  removeRailing?: boolean;
}>;

export type HouseConnectionDraft = HouseConnectionInput & Readonly<{ edgeLength: number }>;

function platformFor(design: DeckDesignV3, platformId: string) {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} is unavailable.`);
  return platform;
}

function wallEdgeId(design: DeckDesignV3, platformId: string, wallId: string): string | undefined {
  const platform = platformFor(design, platformId);
  const wall = design.siteContext.houseWalls.find((candidate) => candidate.id === wallId);
  if (!wall) return undefined;
  return deriveGeometricPolygonEdges(platform.region.outer).find((edge) =>
    platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "house_attachment") &&
    pointOnSegment(edge.start, wall.start, wall.end) && pointOnSegment(edge.end, wall.start, wall.end))?.id;
}

export function deriveHouseConnectionDraft(design: DeckDesignV3, platformId: string, wallId: string | null = design.siteContext.houseWalls[0]?.id ?? null): HouseConnectionDraft {
  const platform = platformFor(design, platformId);
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const attachedEdgeId = wallId ? wallEdgeId(design, platformId, wallId) : undefined;
  const condition = platform.edgeConditions.find((candidate) => candidate.edgeId === attachedEdgeId);
  const edge = edges.find((candidate) => candidate.id === condition?.edgeId) ?? edges[0];
  const wall = design.siteContext.houseWalls.find((candidate) => candidate.id === wallId);
  const door = wall?.openings.find((opening) => opening.kind === "door");
  const wallLength = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) : 0;
  const wallDx = wall && wallLength ? (wall.end.x - wall.start.x) / wallLength : 1;
  const wallDz = wall && wallLength ? (wall.end.z - wall.start.z) / wallLength : 0;
  const doorStart = wall && door ? { x: wall.start.x + wallDx * door.offset, z: wall.start.z + wallDz * door.offset } : null;
  const edgeDx = (edge.end.x - edge.start.x) / edge.length;
  const edgeDz = (edge.end.z - edge.start.z) / edge.length;
  const doorOffset = doorStart ? (doorStart.x - edge.start.x) * edgeDx + (doorStart.z - edge.start.z) * edgeDz : Math.max(0, (edge.length - 72) / 2);
  return Object.freeze({
    edgeId: condition?.edgeId ?? "",
    edgeLength: edge.length,
    attachment: condition?.attachment === "ledger" || condition?.attachment === "non-ledger" ? condition.attachment : "unknown",
    doorEnabled: Boolean(door),
    doorOffset: Math.max(0, Math.round(doorOffset * 100) / 100),
    doorWidth: door?.width ?? Math.min(72, edge.length),
  });
}

export function applyHouseConnectionV3(design: DeckDesignV3, platformId: string, input: HouseConnectionInput): DeckDesignV3 {
  const platform = platformFor(design, platformId);
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const edge = edges.find((candidate) => candidate.id === input.edgeId);
  if (!edge) throw new RangeError("Choose the exact deck side that meets the house.");
  if (!(["unknown", "ledger", "non-ledger"] as const).includes(input.attachment)) throw new TypeError("Choose a supported connection.");
  const hasRailing = platform.construction.railing.enabledEdgeIds.includes(edge.id);
  const hasStairs = platform.construction.stairSystems.some((system) => system.edgeId === edge.id);
  if (hasStairs || hasRailing && input.removeRailing !== true) {
    throw new RangeError("Remove railings or stairs before making this a house side.");
  }
  if (input.doorEnabled && (!Number.isFinite(input.doorOffset) || !Number.isFinite(input.doorWidth) || input.doorWidth < 24 || input.doorWidth > 144 || input.doorOffset < 0 || input.doorOffset + input.doorWidth > edge.length)) {
    throw new RangeError("The door must be 2–12 feet wide and fit this side.");
  }
  const dx = (edge.end.x - edge.start.x) / edge.length;
  const dz = (edge.end.z - edge.start.z) / edge.length;
  const extension = 60;
  const previousWall = input.wallId === null ? undefined : input.wallId ? design.siteContext.houseWalls.find((wall) => wall.id === input.wallId) : design.siteContext.houseWalls[0];
  if (input.wallId !== null && input.wallId && !previousWall) throw new RangeError("Choose a recorded wall to update.");
  const previousHouseEdgeId = previousWall ? wallEdgeId(design, platformId, previousWall.id) : undefined;
  const targetBelongsToAnotherWall = platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "house_attachment") && previousHouseEdgeId !== edge.id;
  if (targetBelongsToAnotherWall) throw new RangeError("That side already belongs to another wall.");
  if (previousHouseEdgeId && previousHouseEdgeId !== edge.id && previousWall?.openings.some((opening) => opening.kind !== "door")) {
    throw new RangeError("Changing sides would move recorded windows. Review them first.");
  }
  const baseElevation = design.siteContext.gradeElevation;
  const sillHeight = platform.elevation - baseElevation;
  if (sillHeight < 0 || sillHeight > 240) throw new RangeError("Door threshold must stay within the 20-foot prototype limit.");
  const wallHeight = Math.max(previousWall?.height ?? 120, sillHeight + 104);
  if (wallHeight > 360) throw new RangeError("House wall exceeds the 30-foot prototype limit.");
  const preservedOpenings = previousWall?.openings.filter((opening) => opening.kind !== "door") ?? [];
  const door = input.doorEnabled ? Object.freeze({
    id: previousWall?.openings.find((opening) => opening.kind === "door")?.id ?? "door-1",
    kind: "door" as const,
    offset: extension + input.doorOffset,
    width: input.doorWidth,
    sillHeight,
    height: 80,
  }) : null;
  const wall = Object.freeze({
    id: previousWall?.id ?? (() => { let sequence = 1; while (design.siteContext.houseWalls.some((candidate) => candidate.id === `house-wall-${sequence}`)) sequence += 1; return `house-wall-${sequence}`; })(),
    start: Object.freeze({ x: edge.start.x - dx * extension, z: edge.start.z - dz * extension }),
    end: Object.freeze({ x: edge.end.x + dx * extension, z: edge.end.z + dz * extension }),
    baseElevation,
    height: wallHeight,
    attachment: input.attachment,
    openings: Object.freeze([...preservedOpenings, ...(door ? [door] : [])].sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))),
  });
  return normalizeDeckDesignV3({
    ...design,
    platforms: design.platforms.map((candidate) => candidate.id === platformId ? {
      ...candidate,
      edgeConditions: candidate.edgeConditions.map((condition) => condition.edgeId === edge.id
        ? { ...condition, condition: "house_attachment" as const, attachment: input.attachment }
        : condition.edgeId === previousHouseEdgeId ? { ...condition, condition: "free" as const, attachment: "none" as const } : condition),
      construction: hasRailing && input.removeRailing === true ? {
        ...candidate.construction,
        railing: { ...candidate.construction.railing, enabledEdgeIds: candidate.construction.railing.enabledEdgeIds.filter((edgeId) => edgeId !== edge.id) },
      } : candidate.construction,
    } : candidate),
    siteContext: { ...design.siteContext, houseWalls: Object.freeze(previousWall
      ? design.siteContext.houseWalls.map((candidate) => candidate.id === previousWall.id ? wall : candidate)
      : [...design.siteContext.houseWalls, wall]) },
    metadata: { ...design.metadata, revision: design.metadata.revision + 1 },
  });
}

export function removeHouseConnectionV3(design: DeckDesignV3, platformId: string, wallId: string): DeckDesignV3 {
  const platform = platformFor(design, platformId);
  if (design.siteContext.houseWalls.length === 1) throw new RangeError("Keep one recorded house wall.");
  if (!design.siteContext.houseWalls.some((candidate) => candidate.id === wallId)) throw new RangeError("Wall removal needs review.");
  const edgeId = wallEdgeId(design, platformId, wallId);
  if (!edgeId || design.platforms.some((candidate) => candidate.id !== platformId && wallEdgeId(design, candidate.id, wallId)) ||
    design.siteContext.houseWalls.some((candidate) => candidate.id !== wallId && wallEdgeId(design, platformId, candidate.id) === edgeId)) throw new RangeError("Wall removal needs review.");
  return normalizeDeckDesignV3({
    ...design,
    platforms: design.platforms.map((candidate) => candidate.id === platform.id ? {
      ...candidate,
      edgeConditions: candidate.edgeConditions.map((condition) => condition.edgeId === edgeId
        ? { ...condition, condition: "free" as const, attachment: "none" as const }
        : condition),
    } : candidate),
    siteContext: { ...design.siteContext, houseWalls: design.siteContext.houseWalls.filter((candidate) => candidate.id !== wallId) },
    metadata: { ...design.metadata, revision: design.metadata.revision + 1 },
  });
}
