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
    stairs: Omit<DeckDesign["construction"]["stairs"], "edgeId"> & Readonly<{
      edgeId: string;
      landingTurn: "straight" | "left" | "right";
      landingPosition: "top" | "midway";
      upperFlightRisers: number;
      landingWidth: number;
    }>;
  }>;
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
    construction: Object.freeze({
      decking: design.construction.decking,
      framing: design.construction.framing,
      railing: Object.freeze({
        height: design.construction.railing.height,
        enabledEdgeIds: Object.freeze(design.construction.railing.enabledEdges.map((edgeId) => semanticEdges[edgeId])),
      }),
      stairs: Object.freeze({
        ...design.construction.stairs,
        edgeId: semanticEdges[design.construction.stairs.edgeId],
        landingTurn: "straight" as const,
        landingPosition: "top" as const,
        upperFlightRisers: 3,
        landingWidth: design.construction.stairs.width,
      }),
    }),
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
      stairs: { ...platform.construction.stairs, enabled: false, edgeId: "front" },
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
  if (!freeEdgeIds.has(platform.construction.stairs.edgeId)) {
    throw new RangeError("V3 stairs must reference a recorded free edge.");
  }
  const stairEdge = edges.find((edge) => edge.id === platform.construction.stairs.edgeId)!;
  const landingTurn = platform.construction.stairs.landingTurn ?? "straight";
  if (!["straight", "left", "right"].includes(landingTurn)) {
    throw new TypeError("V3 stair landingTurn must be straight, left, or right.");
  }
  const landingPosition = platform.construction.stairs.landingPosition ?? "top";
  if (!["top", "midway"].includes(landingPosition)) {
    throw new TypeError("V3 stair landingPosition must be top or midway.");
  }
  const totalRisers = Math.ceil((shared.platform.surfaceElevation - shared.siteContext.gradeElevation) / shared.construction.stairs.maxRiserHeight);
  const defaultUpperFlightRisers = Math.max(1, Math.min(3, totalRisers - 1));
  const upperFlightRisers = platform.construction.stairs.upperFlightRisers ?? defaultUpperFlightRisers;
  if (!Number.isInteger(upperFlightRisers) || upperFlightRisers < 1) {
    throw new RangeError("V3 upperFlightRisers must be a positive whole number.");
  }
  const landingWidth = platform.construction.stairs.landingWidth ?? shared.construction.stairs.width;
  if (!Number.isFinite(landingWidth) || landingWidth < 30 || landingWidth > 144) {
    throw new RangeError("V3 landingWidth must be between 30 and 144 inches.");
  }
  if (platform.construction.stairs.enabled &&
      shared.construction.stairs.offset + shared.construction.stairs.width > stairEdge.length) {
    throw new RangeError("V3 stairs must fit within their recorded free edge.");
  }
  if (platform.construction.stairs.enabled && shared.construction.stairs.landingEnabled && landingTurn !== "straight" && shared.construction.stairs.landingDepth < shared.construction.stairs.width) {
    throw new RangeError("A turning landing must be at least as deep as the stair width.");
  }
  if (platform.construction.stairs.enabled && shared.construction.stairs.landingEnabled && landingWidth < shared.construction.stairs.width) {
    throw new RangeError("A landing must be at least as wide as the stairs.");
  }
  if (platform.construction.stairs.enabled && shared.construction.stairs.landingEnabled && landingPosition === "midway" && (totalRisers < 2 || upperFlightRisers >= totalRisers)) {
    throw new RangeError(`A midway landing must leave at least one riser in each flight; this stair has ${totalRisers} total risers.`);
  }
  return Object.freeze({
    id: platform.id,
    elevation: shared.platform.surfaceElevation,
    region,
    edgeConditions,
    construction: Object.freeze({
      decking: shared.construction.decking,
      framing: shared.construction.framing,
      railing: Object.freeze({
        height: shared.construction.railing.height,
        enabledEdgeIds: Object.freeze([...platform.construction.railing.enabledEdgeIds]),
      }),
      stairs: Object.freeze({
        ...shared.construction.stairs,
        enabled: platform.construction.stairs.enabled,
        edgeId: platform.construction.stairs.edgeId,
        landingTurn,
        landingPosition,
        upperFlightRisers,
        landingWidth,
      }),
    }),
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
