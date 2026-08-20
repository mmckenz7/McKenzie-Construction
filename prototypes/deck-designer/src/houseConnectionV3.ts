import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";
import { deriveGeometricPolygonEdges } from "./polygon";
import type { HouseAttachment } from "./model";

export type HouseConnectionInput = Readonly<{
  edgeId: string;
  attachment: HouseAttachment;
  doorEnabled: boolean;
  doorOffset: number;
  doorWidth: number;
}>;

export type HouseConnectionDraft = HouseConnectionInput & Readonly<{ edgeLength: number }>;

function platformFor(design: DeckDesignV3, platformId: string) {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} is unavailable.`);
  return platform;
}

export function deriveHouseConnectionDraft(design: DeckDesignV3, platformId: string): HouseConnectionDraft {
  const platform = platformFor(design, platformId);
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const condition = platform.edgeConditions.find((candidate) => candidate.condition === "house_attachment");
  const edge = edges.find((candidate) => candidate.id === condition?.edgeId) ?? edges[0];
  const wall = design.siteContext.houseWalls[0];
  const door = wall?.openings.find((opening) => opening.kind === "door");
  const wallLength = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) : 0;
  const wallDx = wallLength ? (wall.end.x - wall.start.x) / wallLength : 1;
  const wallDz = wallLength ? (wall.end.z - wall.start.z) / wallLength : 0;
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
  if (!edge) throw new RangeError("Choose the exact side of the deck that meets the house.");
  if (!(["unknown", "ledger", "non-ledger"] as const).includes(input.attachment)) throw new TypeError("Choose a supported house connection.");
  if (platform.construction.railing.enabledEdgeIds.includes(edge.id) || platform.construction.stairSystems.some((system) => system.edgeId === edge.id)) {
    throw new RangeError("Remove railings or stairs from the house side before attaching it to the house.");
  }
  if (input.doorEnabled && (!Number.isFinite(input.doorOffset) || !Number.isFinite(input.doorWidth) || input.doorWidth < 24 || input.doorWidth > 144 || input.doorOffset < 0 || input.doorOffset + input.doorWidth > edge.length)) {
    throw new RangeError("The door must be 2–12 feet wide and fit completely on the selected house side.");
  }
  const dx = (edge.end.x - edge.start.x) / edge.length;
  const dz = (edge.end.z - edge.start.z) / edge.length;
  const extension = 60;
  const previousWall = design.siteContext.houseWalls[0];
  const previousHouseEdgeId = platform.edgeConditions.find((condition) => condition.condition === "house_attachment")?.edgeId;
  if (previousHouseEdgeId && previousHouseEdgeId !== edge.id && previousWall?.openings.some((opening) => opening.kind !== "door")) {
    throw new RangeError("Changing the house side would move recorded windows. Review or remove those openings first.");
  }
  const baseElevation = design.siteContext.gradeElevation;
  const sillHeight = platform.elevation - baseElevation;
  if (sillHeight < 0 || sillHeight > 240) throw new RangeError("The door threshold must remain between grade and the 20-foot prototype limit.");
  const wallHeight = Math.max(previousWall?.height ?? 120, sillHeight + 104);
  if (wallHeight > 360) throw new RangeError("The conceptual house wall would exceed the 30-foot prototype limit.");
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
    id: previousWall?.id ?? "house-wall-1",
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
        : condition.condition === "house_attachment" ? { ...condition, condition: "free" as const, attachment: "none" as const } : condition),
    } : candidate),
    siteContext: { ...design.siteContext, houseWalls: Object.freeze([wall, ...design.siteContext.houseWalls.slice(1)]) },
    metadata: { ...design.metadata, revision: design.metadata.revision + 1 },
  });
}
