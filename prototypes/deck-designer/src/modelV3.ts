import {
  DEFAULT_DESIGN,
  normalizeDesign,
  type DeckDesign,
  type DeckEdgeId,
  type HouseAttachment,
} from "./model";
import {
  deriveGeometricPolygonEdges,
  geometricPolygonEdgeId,
  type PolygonPoint,
} from "./polygon";
import { normalizePolygonRegion, type PolygonRegion } from "./polygonRegion";

export type DeckPlatformV3 = Readonly<{
  id: string;
  elevation: number;
  region: PolygonRegion;
  edgeConditions: readonly Readonly<{
    edgeId: string;
    condition: "house_attachment" | "free";
    attachment: HouseAttachment | "none";
  }>[];
  construction: Readonly<{
    decking: DeckDesign["construction"]["decking"];
    framing: DeckDesign["construction"]["framing"];
    railing: Readonly<{ height: number; enabledEdgeIds: readonly string[] }>;
    stairSystems: readonly StairSystemV3[];
    /** Derived, non-serialized compatibility view of the first stair system. */
    stairs: LegacyStairsV3;
  }>;
}>;

export type StairLandingV3 = Readonly<{
  id: string;
  locked: boolean;
  afterRiser: number;
  width: number;
  depth: number;
  turn: "straight" | "left" | "right" | "switchback";
  connections: readonly StairLandingConnectionV3[];
  /** When present, this landing terminates the primary stair route at another deck level. */
  terminalPlatformId?: string;
  /** Exact free edge that receives the terminal landing. */
  terminalEdgeId?: string;
}>;

export type StairLandingConnectionV3 = Readonly<{
  id: string;
  locked: boolean;
  destination: "deck" | "grade";
  direction: "straight" | "left" | "right";
  width: number;
  treadDepth: number;
  /** Exact destination for a deck-bound flight. Absent only for legacy generic deck connections. */
  targetPlatformId?: string;
  /** Exact free edge on the destination platform. Absent only for legacy level connections. */
  targetEdgeId?: string;
}>;

export type StairSystemV3 = Readonly<{
  id: string;
  locked: boolean;
  edgeId: string;
  offset: number;
  width: number;
  treadDepth: number;
  maxRiserHeight: number;
  landings: readonly StairLandingV3[];
}>;

type LegacyStairsV3 = Omit<DeckDesign["construction"]["stairs"], "edgeId"> & Readonly<{
      edgeId: string;
      landingTurn: "straight" | "left" | "right" | "switchback";
      landingPosition: "top" | "midway";
      upperFlightRisers: number;
      landingWidth: number;
    }>;

export type DeckDesignV3 = Readonly<{
  schemaVersion: 3;
  id: string;
  name: string;
  units: "in";
  platforms: readonly DeckPlatformV3[];
  siteContext: DeckDesign["siteContext"];
  metadata: DeckDesign["metadata"];
}>;

function v2OuterRing(design: DeckDesign): readonly PolygonPoint[] {
  const { width, projection, kind, cutoutWidth, cutoutDepth } = design.platform;
  if (kind === "rectangle") {
    return Object.freeze([
      Object.freeze({ x: 0, z: 0 }), Object.freeze({ x: width, z: 0 }),
      Object.freeze({ x: width, z: projection }), Object.freeze({ x: 0, z: projection }),
    ]);
  }
  const innerX = width - cutoutWidth;
  const innerZ = projection - cutoutDepth;
  return Object.freeze([
    Object.freeze({ x: 0, z: 0 }), Object.freeze({ x: width, z: 0 }),
    Object.freeze({ x: width, z: innerZ }), Object.freeze({ x: innerX, z: innerZ }),
    Object.freeze({ x: innerX, z: projection }), Object.freeze({ x: 0, z: projection }),
  ]);
}

function semanticV2EdgeIds(design: DeckDesign): Readonly<Record<DeckEdgeId, string>> {
  const { width, projection, kind, cutoutWidth, cutoutDepth } = design.platform;
  const innerX = width - cutoutWidth;
  const innerZ = projection - cutoutDepth;
  return Object.freeze({
    front: geometricPolygonEdgeId({ x: kind === "l-shape" ? innerX : width, z: projection }, { x: 0, z: projection }),
    left: geometricPolygonEdgeId({ x: 0, z: projection }, { x: 0, z: 0 }),
    right: geometricPolygonEdgeId({ x: width, z: 0 }, { x: width, z: kind === "l-shape" ? innerZ : projection }),
    "notch-horizontal": geometricPolygonEdgeId({ x: width, z: innerZ }, { x: innerX, z: innerZ }),
    "notch-vertical": geometricPolygonEdgeId({ x: innerX, z: innerZ }, { x: innerX, z: projection }),
  });
}

function migrateNormalizedV2(design: DeckDesign): DeckDesignV3 {
  const region = normalizePolygonRegion({ outer: v2OuterRing(design), holes: [] });
  const edges = deriveGeometricPolygonEdges(region.outer);
  const semanticEdges = semanticV2EdgeIds(design);
  const houseEdgeId = geometricPolygonEdgeId({ x: 0, z: 0 }, { x: design.platform.width, z: 0 });
  const houseAttachment = design.siteContext.houseWalls[0]?.attachment ?? "unknown";
  const platform: DeckPlatformV3 = Object.freeze({
    id: "platform-1",
    elevation: design.platform.surfaceElevation,
    region,
    edgeConditions: Object.freeze(edges.map((edge) => Object.freeze({
      edgeId: edge.id,
      condition: edge.id === houseEdgeId ? "house_attachment" as const : "free" as const,
      attachment: edge.id === houseEdgeId ? houseAttachment : "none" as const,
    }))),
    construction: constructionWithDerivedLegacyStairs({
      decking: design.construction.decking,
      framing: design.construction.framing,
      railing: Object.freeze({
        height: design.construction.railing.height,
        enabledEdgeIds: Object.freeze(design.construction.railing.enabledEdges.map((edgeId) => semanticEdges[edgeId])),
      }),
      stairSystems: design.construction.stairs.enabled ? Object.freeze([Object.freeze({
        id: "stair-system-1",
        locked: false,
        edgeId: semanticEdges[design.construction.stairs.edgeId],
        offset: design.construction.stairs.offset,
        width: design.construction.stairs.width,
        treadDepth: design.construction.stairs.treadDepth,
        maxRiserHeight: design.construction.stairs.maxRiserHeight,
        landings: design.construction.stairs.landingEnabled ? Object.freeze([Object.freeze({
          id: "stair-system-1-landing-1",
          locked: false,
          afterRiser: 0,
          width: design.construction.stairs.width,
          depth: design.construction.stairs.landingDepth,
          turn: "straight" as const,
          connections: Object.freeze([]),
        })]) : Object.freeze([]),
      })]) : Object.freeze([]),
    }, semanticEdges.front),
  });
  return Object.freeze({
    schemaVersion: 3,
    id: design.id,
    name: design.name,
    units: "in",
    platforms: Object.freeze([platform]),
    siteContext: design.siteContext,
    metadata: design.metadata,
  });
}

function legacyStairsFromSystems(systems: readonly StairSystemV3[], fallbackEdgeId: string): LegacyStairsV3 {
  const system = systems[0];
  const landing = system?.landings[0];
  return Object.freeze({
    enabled: Boolean(system),
    edgeId: system?.edgeId ?? fallbackEdgeId,
    offset: system?.offset ?? DEFAULT_DESIGN.construction.stairs.offset,
    width: system?.width ?? DEFAULT_DESIGN.construction.stairs.width,
    treadDepth: system?.treadDepth ?? DEFAULT_DESIGN.construction.stairs.treadDepth,
    maxRiserHeight: system?.maxRiserHeight ?? DEFAULT_DESIGN.construction.stairs.maxRiserHeight,
    landingEnabled: Boolean(landing),
    landingDepth: landing?.depth ?? DEFAULT_DESIGN.construction.stairs.landingDepth,
    landingTurn: landing?.turn ?? "straight",
    landingPosition: landing && landing.afterRiser > 0 ? "midway" : "top",
    upperFlightRisers: landing?.afterRiser || 3,
    landingWidth: landing?.width ?? system?.width ?? DEFAULT_DESIGN.construction.stairs.width,
  });
}

function legacySystemFromStairs(stairs: Partial<LegacyStairsV3>, id: string): Partial<StairSystemV3> {
  const width = stairs.width ?? DEFAULT_DESIGN.construction.stairs.width;
  const landingEnabled = stairs.landingEnabled === true;
  return {
    id,
    locked: false,
    edgeId: stairs.edgeId,
    offset: stairs.offset,
    width,
    treadDepth: stairs.treadDepth,
    maxRiserHeight: stairs.maxRiserHeight,
    landings: landingEnabled ? [{
      id: `${id}-landing-1`,
      locked: false,
      afterRiser: stairs.landingPosition === "midway" ? (stairs.upperFlightRisers ?? 3) : 0,
      width: stairs.landingWidth ?? width,
      depth: stairs.landingDepth ?? DEFAULT_DESIGN.construction.stairs.landingDepth,
      turn: stairs.landingTurn ?? "straight",
      connections: [],
    }] : [],
  };
}

function constructionWithDerivedLegacyStairs(
  construction: Omit<DeckPlatformV3["construction"], "stairs">,
  fallbackEdgeId: string,
): DeckPlatformV3["construction"] {
  const result = { ...construction } as DeckPlatformV3["construction"];
  Object.defineProperty(result, "stairs", {
    value: legacyStairsFromSystems(construction.stairSystems, fallbackEdgeId),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(result);
}

function normalizePlatformV3(
  design: DeckDesignV3,
  platform: DeckPlatformV3,
  seenIds: Set<string>,
): DeckPlatformV3 {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(platform.id) || seenIds.has(platform.id)) {
    throw new TypeError("Every v3 platform must have a unique stable lowercase ID.");
  }
  seenIds.add(platform.id);
  const region = normalizePolygonRegion(platform.region);
  const edges = deriveGeometricPolygonEdges(region.outer);
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (platform.edgeConditions.length !== edges.length) {
    throw new RangeError("Every v3 outer edge must have exactly one edge condition.");
  }
  const conditionIds = new Set<string>();
  const edgeConditions = Object.freeze(platform.edgeConditions.map((condition) => {
    if (!edgeIds.has(condition.edgeId) || conditionIds.has(condition.edgeId)) {
      throw new RangeError("V3 edge conditions must reference every outer edge exactly once.");
    }
    conditionIds.add(condition.edgeId);
    if (condition.condition === "house_attachment") {
      if (!(["unknown", "ledger", "non-ledger"] as const).includes(condition.attachment as HouseAttachment)) {
        throw new TypeError("A house-attachment edge requires recorded attachment intent.");
      }
    } else if (condition.condition === "free") {
      if (condition.attachment !== "none") throw new TypeError("A free edge cannot record house attachment intent.");
    } else {
      throw new TypeError("V3 edge condition is unsupported.");
    }
    return Object.freeze({ ...condition });
  }));
  const freeEdgeIds = new Set(edgeConditions.filter((condition) => condition.condition === "free").map((condition) => condition.edgeId));
  if (freeEdgeIds.size === 0) throw new RangeError("A v3 platform must expose at least one free edge.");
  const shared = normalizeDesign({
    ...DEFAULT_DESIGN,
    id: design.id,
    name: design.name,
    siteContext: design.siteContext,
    platform: { ...DEFAULT_DESIGN.platform, surfaceElevation: platform.elevation },
    construction: {
      decking: platform.construction.decking,
      framing: platform.construction.framing,
      railing: { height: platform.construction.railing.height, enabledEdges: [] },
      stairs: { ...DEFAULT_DESIGN.construction.stairs, enabled: false, edgeId: "front" },
    },
    metadata: design.metadata,
  });
  if (!Array.isArray(platform.construction.railing.enabledEdgeIds) ||
      new Set(platform.construction.railing.enabledEdgeIds).size !== platform.construction.railing.enabledEdgeIds.length) {
    throw new RangeError("V3 railing edge references must be a unique list.");
  }
  if (platform.construction.railing.enabledEdgeIds.some((edgeId) => !freeEdgeIds.has(edgeId))) {
    throw new RangeError("V3 railing can reference only recorded free edges.");
  }
  const rawConstruction = platform.construction as DeckPlatformV3["construction"] & { stairs?: Partial<LegacyStairsV3> };
  const explicitLegacyOverride = Object.prototype.propertyIsEnumerable.call(rawConstruction, "stairs") ? rawConstruction.stairs : null;
  const rawSystems: readonly Partial<StairSystemV3>[] = explicitLegacyOverride
    ? (explicitLegacyOverride.enabled ? [legacySystemFromStairs(explicitLegacyOverride, "stair-system-1")] : [])
    : Array.isArray(rawConstruction.stairSystems)
      ? rawConstruction.stairSystems
      : rawConstruction.stairs?.enabled
        ? [legacySystemFromStairs(rawConstruction.stairs, "stair-system-1")]
        : [];
  if (rawSystems.length > 6) throw new RangeError("A platform can contain at most six stair systems in this prototype.");
  const systemIds = new Set<string>();
  const openingsByEdge = new Map<string, { start: number; end: number; systemId: string }[]>();
  const stairSystems = Object.freeze(rawSystems.map((candidate, systemIndex): StairSystemV3 => {
    const id = candidate.id ?? `stair-system-${systemIndex + 1}`;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || systemIds.has(id)) throw new TypeError("Every stair system requires a unique stable lowercase ID.");
    systemIds.add(id);
    const edgeId = candidate.edgeId ?? [...freeEdgeIds][0];
    if (!freeEdgeIds.has(edgeId)) throw new RangeError("V3 stairs must reference a recorded free edge.");
    const normalizedStair = normalizeDesign({
      ...DEFAULT_DESIGN,
      platform: { ...DEFAULT_DESIGN.platform, surfaceElevation: shared.platform.surfaceElevation },
      siteContext: shared.siteContext,
      construction: { ...DEFAULT_DESIGN.construction, stairs: {
        ...DEFAULT_DESIGN.construction.stairs,
        enabled: false,
        edgeId: "front",
        offset: candidate.offset,
        width: candidate.width,
        treadDepth: candidate.treadDepth,
        maxRiserHeight: candidate.maxRiserHeight,
      } },
    }).construction.stairs;
    const stairEdge = edges.find((edge) => edge.id === edgeId)!;
    if (normalizedStair.offset + normalizedStair.width > stairEdge.length) throw new RangeError("V3 stairs must fit within their recorded free edge.");
    const existingOpenings = openingsByEdge.get(edgeId) ?? [];
    const opening = { start: normalizedStair.offset, end: normalizedStair.offset + normalizedStair.width, systemId: id };
    if (existingOpenings.some((item) => opening.start < item.end && opening.end > item.start)) throw new RangeError("Stair systems on the same deck side cannot overlap.");
    openingsByEdge.set(edgeId, [...existingOpenings, opening]);
    const totalRisers = Math.ceil((shared.platform.surfaceElevation - shared.siteContext.gradeElevation) / normalizedStair.maxRiserHeight);
    const landingIds = new Set<string>();
    let previousAfterRiser = -1;
    const landings = Object.freeze((candidate.landings ?? []).map((landing, landingIndex): StairLandingV3 => {
      const landingId = landing.id ?? `${id}-landing-${landingIndex + 1}`;
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(landingId) || landingIds.has(landingId)) throw new TypeError("Every stair landing requires a unique stable lowercase ID within its stair system.");
      landingIds.add(landingId);
      const afterRiser = landing.afterRiser ?? 0;
      if (!Number.isInteger(afterRiser) || afterRiser < 0 || afterRiser >= totalRisers || afterRiser <= previousAfterRiser) throw new RangeError("Landing positions must be unique increasing whole riser counts below the total stair rise.");
      previousAfterRiser = afterRiser;
      const width = landing.width ?? normalizedStair.width;
      const depth = landing.depth ?? 48;
      const turn = landing.turn ?? "straight";
      if (!Number.isFinite(width) || width < 30 || width > 144 || width < normalizedStair.width) throw new RangeError("A landing must be 30–144 inches wide and at least as wide as its stairs.");
      if (!Number.isFinite(depth) || depth < 24 || depth > 120) throw new RangeError("A landing depth must be between 24 and 120 inches.");
      if (!["straight", "left", "right", "switchback"].includes(turn)) throw new TypeError("A landing turn must be straight, left, right, or switchback.");
      if (turn !== "straight" && depth < normalizedStair.width) throw new RangeError("A turning landing must be at least as deep as the stair width.");
      if (turn === "switchback" && (afterRiser === 0 || width < normalizedStair.width * 2)) throw new RangeError("A switchback needs a midway landing at least twice the stair width.");
      if (turn === "switchback" && afterRiser < Math.ceil(totalRisers / 2)) throw new RangeError("A switchback landing must be at or beyond the halfway riser so the lower flight stays outside the deck.");
      if (turn === "switchback" && (landing.connections?.length ?? 0) > 0) throw new RangeError("A switchback landing cannot also branch into another stair flight.");
      const connectionIds = new Set<string>();
      const usedDirections = new Set<string>([turn]);
      const connections = Object.freeze((landing.connections ?? []).map((connection, connectionIndex): StairLandingConnectionV3 => {
        const connectionId = connection.id ?? `${landingId}-connection-${connectionIndex + 1}`;
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(connectionId) || connectionIds.has(connectionId)) throw new TypeError("Every shared-landing stair connection requires a unique stable lowercase ID.");
        connectionIds.add(connectionId);
        const destination = connection.destination ?? "grade";
        const targetPlatformId = connection.targetPlatformId;
        const targetEdgeId = connection.targetEdgeId;
        const direction = connection.direction ?? (["left", "right", "straight"] as const).find((candidateDirection) => !usedDirections.has(candidateDirection)) ?? "straight";
        if (destination !== "deck" && destination !== "grade") throw new TypeError("A shared-landing stair connection must lead to deck or grade.");
        if (!["straight", "left", "right"].includes(direction)) throw new TypeError("A shared-landing stair direction must be straight, left, or right.");
        if (usedDirections.has(direction)) throw new RangeError("Stair flights attached to one landing must use different open sides.");
        if (targetPlatformId !== undefined) {
          if (destination !== "deck") throw new TypeError("Only a deck-bound stair connection can name a destination platform.");
          if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(targetPlatformId) || targetPlatformId === platform.id) throw new RangeError("A level connection must name another stable platform ID.");
          const target = design.platforms.find((item) => item.id === targetPlatformId);
          if (!target) throw new RangeError(`Destination platform ${targetPlatformId} does not exist.`);
          if (targetEdgeId !== undefined && !target.edgeConditions.some((condition) => condition.edgeId === targetEdgeId && condition.condition === "free")) {
            throw new RangeError("A level connection must reference an exact free side on its destination level.");
          }
          const actualRise = totalRisers > 0 ? (shared.platform.surfaceElevation - shared.siteContext.gradeElevation) / totalRisers : 0;
          const landingElevation = shared.platform.surfaceElevation - afterRiser * actualRise;
          if (Math.abs(target.elevation - landingElevation) < .01) throw new RangeError("A connected level must be above or below the shared landing.");
        } else if (targetEdgeId !== undefined) throw new RangeError("A destination side requires a destination level.");
        else if (destination === "deck" && afterRiser === 0) throw new RangeError("A legacy deck-bound merged stair requires a landing below deck elevation.");
        usedDirections.add(direction);
        const connectionWidth = connection.width ?? normalizedStair.width;
        const connectionTreadDepth = connection.treadDepth ?? normalizedStair.treadDepth;
        if (!Number.isFinite(connectionWidth) || connectionWidth < 30 || connectionWidth > 96 || connectionWidth > width) throw new RangeError("A merged stair must be 30–96 inches wide and fit its shared landing.");
        if (!Number.isFinite(connectionTreadDepth) || connectionTreadDepth < 9 || connectionTreadDepth > 14) throw new RangeError("A merged stair tread depth must be between 9 and 14 inches.");
        return Object.freeze({ id: connectionId, locked: connection.locked === true, destination, direction, width: connectionWidth, treadDepth: connectionTreadDepth, ...(targetPlatformId === undefined ? {} : { targetPlatformId }), ...(targetEdgeId === undefined ? {} : { targetEdgeId }) });
      }));
      const terminalPlatformId = landing.terminalPlatformId;
      const terminalEdgeId = landing.terminalEdgeId;
      if ((terminalPlatformId === undefined) !== (terminalEdgeId === undefined)) throw new RangeError("A terminal landing requires both a destination level and its exact free side.");
      if (terminalPlatformId !== undefined && terminalEdgeId !== undefined) {
        if (landingIndex !== (candidate.landings?.length ?? 0) - 1) throw new RangeError("Only the final landing can terminate an upper stair route at another level.");
        if (connections.length > 0) throw new RangeError("A terminal level landing cannot also create another connected flight.");
        const target = design.platforms.find((item) => item.id === terminalPlatformId);
        if (!target || target.id === platform.id) throw new RangeError("A terminal landing must name another recorded deck level.");
        if (target.elevation >= shared.platform.surfaceElevation) throw new RangeError("A terminal landing must connect to a lower deck level.");
        if (target.elevation <= shared.siteContext.gradeElevation) throw new RangeError("A terminal landing must remain above recorded grade.");
        if (!target.edgeConditions.some((condition) => condition.edgeId === terminalEdgeId && condition.condition === "free")) throw new RangeError("A terminal landing must reference an exact free side on the lower level.");
        const expectedRisers = Math.ceil((shared.platform.surfaceElevation - target.elevation) / normalizedStair.maxRiserHeight);
        if (afterRiser !== expectedRisers) throw new RangeError("A terminal landing riser count must match the measured difference between deck levels.");
      }
      return Object.freeze({ id: landingId, locked: landing.locked === true, afterRiser, width, depth, turn, connections, ...(terminalPlatformId === undefined ? {} : { terminalPlatformId }), ...(terminalEdgeId === undefined ? {} : { terminalEdgeId }) });
    }));
    return Object.freeze({ id, locked: candidate.locked === true, edgeId, offset: normalizedStair.offset, width: normalizedStair.width, treadDepth: normalizedStair.treadDepth, maxRiserHeight: normalizedStair.maxRiserHeight, landings });
  }));
  return Object.freeze({
    id: platform.id,
    elevation: shared.platform.surfaceElevation,
    region,
    edgeConditions,
    construction: constructionWithDerivedLegacyStairs({
      decking: shared.construction.decking,
      framing: shared.construction.framing,
      railing: Object.freeze({
        height: shared.construction.railing.height,
        enabledEdgeIds: Object.freeze([...platform.construction.railing.enabledEdgeIds]),
      }),
      stairSystems,
    }, [...freeEdgeIds][0]),
  });
}

export function normalizeDeckDesignV3(design: DeckDesignV3): DeckDesignV3 {
  if (design.schemaVersion !== 3) throw new TypeError("DeckDesign v3 normalization requires schemaVersion 3.");
  if (design.units !== "in") throw new TypeError("DeckDesign v3 units must be inches.");
  if (design.platforms.length < 1 || design.platforms.length > 8) {
    throw new RangeError("DeckDesign v3 must contain between 1 and 8 platforms.");
  }
  const seenIds = new Set<string>();
  const platforms = Object.freeze(design.platforms.map((platform) => normalizePlatformV3(design, platform, seenIds)));
  const shared = normalizeDesign({
    ...DEFAULT_DESIGN,
    id: design.id,
    name: design.name,
    siteContext: design.siteContext,
    metadata: design.metadata,
  });
  return Object.freeze({
    schemaVersion: 3,
    id: shared.id,
    name: shared.name,
    units: "in",
    platforms,
    siteContext: shared.siteContext,
    metadata: shared.metadata,
  });
}

export function migrateDeckDesignToV3(input: unknown): DeckDesignV3 {
  if (typeof input === "object" && input !== null && (input as { schemaVersion?: unknown }).schemaVersion === 3) {
    return normalizeDeckDesignV3(input as DeckDesignV3);
  }
  return normalizeDeckDesignV3(migrateNormalizedV2(normalizeDesign(input)));
}

export function stableDeckDesignV3Json(design: DeckDesignV3): string {
  return `${JSON.stringify(normalizeDeckDesignV3(design), null, 2)}\n`;
}

export function deckDesignV3Fingerprint(design: DeckDesignV3): string {
  const text = stableDeckDesignV3Json(design);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v3-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
