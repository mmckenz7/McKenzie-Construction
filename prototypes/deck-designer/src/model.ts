export const DESIGN_SCHEMA_VERSION = 1 as const;
export type DeckEdgeId = "front" | "left" | "right" | "notch-horizontal" | "notch-vertical";

export type DeckDesignV1 = Readonly<{
  schemaVersion: typeof DESIGN_SCHEMA_VERSION;
  id: string;
  name: string;
  units: "in";
  platform: Readonly<{
    kind: "rectangle" | "l-shape";
    width: number;
    projection: number;
    surfaceElevation: number;
    cutoutWidth: number;
    cutoutDepth: number;
  }>;
  construction: Readonly<{
    decking: Readonly<{ boardWidth: number; gap: number }>;
    framing: Readonly<{
      joistSpacing: number;
      beamInset: number;
      maxPostSpacing: number;
    }>;
    railing: Readonly<{
      height: number;
      enabledEdges: readonly DeckEdgeId[];
    }>;
    stairs: Readonly<{
      enabled: boolean;
      edgeId: DeckEdgeId;
      offset: number;
      width: number;
      treadDepth: number;
      maxRiserHeight: number;
      landingEnabled: boolean;
      landingDepth: number;
    }>;
  }>;
  metadata: Readonly<{
    status: "conceptual";
    revision: number;
  }>;
}>;

const EDGE_ORDER: readonly DeckEdgeId[] = ["front", "left", "right", "notch-horizontal", "notch-vertical"];

export function availableEdgeIds(kind: DeckDesignV1["platform"]["kind"]): readonly DeckEdgeId[] {
  return kind === "l-shape"
    ? EDGE_ORDER
    : EDGE_ORDER.filter((edge) => edge !== "notch-horizontal" && edge !== "notch-vertical");
}

export const DEFAULT_DESIGN: DeckDesignV1 = Object.freeze({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  id: "local-deck-001",
  name: "Back deck concept",
  units: "in",
  platform: Object.freeze({
    kind: "rectangle",
    width: 192,
    projection: 144,
    surfaceElevation: 48,
    cutoutWidth: 48,
    cutoutDepth: 48,
  }),
  construction: Object.freeze({
    decking: Object.freeze({ boardWidth: 5.5, gap: 0.25 }),
    framing: Object.freeze({ joistSpacing: 16, beamInset: 24, maxPostSpacing: 72 }),
    railing: Object.freeze({
      height: 36,
      enabledEdges: Object.freeze(["front", "left", "right"] as DeckEdgeId[]),
    }),
    stairs: Object.freeze({
      enabled: false,
      edgeId: "front",
      offset: 48,
      width: 48,
      treadDepth: 10,
      maxRiserHeight: 7.75,
      landingEnabled: false,
      landingDepth: 48,
    }),
  }),
  metadata: Object.freeze({ status: "conceptual", revision: 1 }),
});

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(`${label} must be non-empty text up to ${max} characters.`);
  }
  return value.trim();
}

function numberInRange(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be between ${min} and ${max} inches.`);
  }
  return Math.round(value * 100) / 100;
}

function integerInRange(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new RangeError(`${label} must be an integer from ${min} through ${max}.`);
  }
  return value as number;
}

function normalizeEdges(value: unknown, kind: DeckDesignV1["platform"]["kind"]): readonly DeckEdgeId[] {
  if (!Array.isArray(value) || value.some((edge) => !EDGE_ORDER.includes(edge as DeckEdgeId))) {
    throw new TypeError("construction.railing.enabledEdges contains an unsupported edge.");
  }
  const available = availableEdgeIds(kind);
  return Object.freeze(EDGE_ORDER.filter((edge) => available.includes(edge) && value.includes(edge)));
}

function edgeLength(
  platform: DeckDesignV1["platform"],
  edgeId: DeckEdgeId,
): number {
  if (edgeId === "front") return platform.kind === "l-shape" ? platform.width - platform.cutoutWidth : platform.width;
  if (edgeId === "left") return platform.projection;
  if (edgeId === "right") return platform.kind === "l-shape" ? platform.projection - platform.cutoutDepth : platform.projection;
  if (edgeId === "notch-horizontal") return platform.cutoutWidth;
  return platform.cutoutDepth;
}

export function normalizeDesign(input: unknown): DeckDesignV1 {
  const root = record(input, "design");
  if (root.schemaVersion !== DESIGN_SCHEMA_VERSION) {
    throw new RangeError(`Only design schema version ${DESIGN_SCHEMA_VERSION} is supported.`);
  }
  if (root.units !== "in") throw new TypeError("Design units must be inches (in).");

  const platform = record(root.platform, "platform");
  if (platform.kind !== "rectangle" && platform.kind !== "l-shape") {
    throw new TypeError("Platform kind must be rectangle or l-shape.");
  }
  const construction = record(root.construction, "construction");
  const decking = record(construction.decking, "construction.decking");
  const framing = record(construction.framing, "construction.framing");
  const railing = record(construction.railing, "construction.railing");
  const stairs = record(construction.stairs ?? DEFAULT_DESIGN.construction.stairs, "construction.stairs");
  const metadata = record(root.metadata, "metadata");
  if (metadata.status !== "conceptual") throw new TypeError("Prototype status must be conceptual.");

  const normalizedPlatform = {
    kind: platform.kind as "rectangle" | "l-shape",
    width: numberInRange(platform.width, "platform.width", 48, 1200),
    projection: numberInRange(platform.projection, "platform.projection", 48, 600),
    surfaceElevation: numberInRange(platform.surfaceElevation, "platform.surfaceElevation", 6, 144),
    cutoutWidth: numberInRange(platform.cutoutWidth ?? 48, "platform.cutoutWidth", 12, 480),
    cutoutDepth: numberInRange(platform.cutoutDepth ?? 48, "platform.cutoutDepth", 12, 480),
  };
  if (
    normalizedPlatform.kind === "l-shape" &&
    (normalizedPlatform.cutoutWidth >= normalizedPlatform.width - 24 ||
      normalizedPlatform.cutoutDepth >= normalizedPlatform.projection - 24)
  ) {
    throw new RangeError("L-shape cutout must leave at least 24 inches in both deck legs.");
  }
  const beamInset = numberInRange(framing.beamInset, "construction.framing.beamInset", 6, 120);
  if (beamInset >= normalizedPlatform.projection) {
    throw new RangeError("Beam inset must be smaller than the deck projection.");
  }
  const stairEnabled = stairs.enabled === true;
  if (typeof stairs.enabled !== "boolean") throw new TypeError("construction.stairs.enabled must be boolean.");
  const legacyEdge = stairs.edge === "front-outer" ? "front" : stairs.edge;
  const stairEdgeId = (stairs.edgeId ?? legacyEdge ?? "front") as DeckEdgeId;
  if (!availableEdgeIds(normalizedPlatform.kind).includes(stairEdgeId)) {
    throw new TypeError("construction.stairs.edgeId is not available on this platform shape.");
  }
  const normalizedStairs = {
    enabled: stairEnabled,
    edgeId: stairEdgeId,
    offset: numberInRange(stairs.offset, "construction.stairs.offset", 0, 1176),
    width: numberInRange(stairs.width, "construction.stairs.width", 30, 96),
    treadDepth: numberInRange(stairs.treadDepth, "construction.stairs.treadDepth", 9, 14),
    maxRiserHeight: numberInRange(stairs.maxRiserHeight, "construction.stairs.maxRiserHeight", 4, 8),
    landingEnabled: stairs.landingEnabled === true,
    landingDepth: numberInRange(stairs.landingDepth ?? 48, "construction.stairs.landingDepth", 24, 120),
  };
  if (typeof (stairs.landingEnabled ?? false) !== "boolean") {
    throw new TypeError("construction.stairs.landingEnabled must be boolean.");
  }
  const stairEdgeLength = edgeLength(normalizedPlatform, normalizedStairs.edgeId);
  if (stairEnabled && normalizedStairs.offset + normalizedStairs.width > stairEdgeLength) {
    throw new RangeError(`Stair opening must fit on the ${normalizedStairs.edgeId} edge.`);
  }

  return Object.freeze({
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: text(root.id, "id", 80),
    name: text(root.name, "name"),
    units: "in",
    platform: Object.freeze(normalizedPlatform),
    construction: Object.freeze({
      decking: Object.freeze({
        boardWidth: numberInRange(decking.boardWidth, "construction.decking.boardWidth", 2, 12),
        gap: numberInRange(decking.gap, "construction.decking.gap", 0.05, 1),
      }),
      framing: Object.freeze({
        joistSpacing: numberInRange(framing.joistSpacing, "construction.framing.joistSpacing", 8, 24),
        beamInset,
        maxPostSpacing: numberInRange(framing.maxPostSpacing, "construction.framing.maxPostSpacing", 24, 120),
      }),
      railing: Object.freeze({
        height: numberInRange(railing.height, "construction.railing.height", 30, 48),
        enabledEdges: normalizeEdges(railing.enabledEdges, normalizedPlatform.kind),
      }),
      stairs: Object.freeze(normalizedStairs),
    }),
    metadata: Object.freeze({
      status: "conceptual",
      revision: integerInRange(metadata.revision, "metadata.revision", 1, 1_000_000_000),
    }),
  });
}

export function updateDesign(
  design: DeckDesignV1,
  update: {
    name?: string;
    width?: number;
    projection?: number;
    surfaceElevation?: number;
    kind?: "rectangle" | "l-shape";
    cutoutWidth?: number;
    cutoutDepth?: number;
    joistSpacing?: number;
    railingEdges?: readonly DeckEdgeId[];
    stairEnabled?: boolean;
    stairOffset?: number;
    stairWidth?: number;
    treadDepth?: number;
    stairEdgeId?: DeckEdgeId;
    landingEnabled?: boolean;
    landingDepth?: number;
  },
): DeckDesignV1 {
  const nextKind = update.kind ?? design.platform.kind;
  const inheritedRailingEdges = update.kind === "l-shape" && design.platform.kind === "rectangle"
    ? [
        ...design.construction.railing.enabledEdges,
        ...(design.construction.railing.enabledEdges.includes("front") ? ["notch-horizontal" as const] : []),
        ...(design.construction.railing.enabledEdges.includes("right") ? ["notch-vertical" as const] : []),
      ]
    : design.construction.railing.enabledEdges;
  return normalizeDesign({
    ...design,
    name: update.name ?? design.name,
    platform: {
      ...design.platform,
      kind: nextKind,
      width: update.width ?? design.platform.width,
      projection: update.projection ?? design.platform.projection,
      surfaceElevation: update.surfaceElevation ?? design.platform.surfaceElevation,
      cutoutWidth: update.cutoutWidth ?? design.platform.cutoutWidth,
      cutoutDepth: update.cutoutDepth ?? design.platform.cutoutDepth,
    },
    construction: {
      ...design.construction,
      framing: {
        ...design.construction.framing,
        joistSpacing: update.joistSpacing ?? design.construction.framing.joistSpacing,
      },
      railing: {
        ...design.construction.railing,
        enabledEdges: update.railingEdges ?? inheritedRailingEdges,
      },
      stairs: {
        ...design.construction.stairs,
        edgeId: update.stairEdgeId ?? (
          update.kind && !availableEdgeIds(update.kind).includes(design.construction.stairs.edgeId)
            ? "front"
            : design.construction.stairs.edgeId
        ),
        enabled: update.stairEnabled ?? design.construction.stairs.enabled,
        offset: update.stairOffset ?? design.construction.stairs.offset,
        width: update.stairWidth ?? design.construction.stairs.width,
        treadDepth: update.treadDepth ?? design.construction.stairs.treadDepth,
        landingEnabled: update.landingEnabled ?? design.construction.stairs.landingEnabled,
        landingDepth: update.landingDepth ?? design.construction.stairs.landingDepth,
      },
    },
    metadata: { ...design.metadata, revision: design.metadata.revision + 1 },
  });
}

export function stableDesignJson(design: DeckDesignV1): string {
  return JSON.stringify(normalizeDesign(design), null, 2);
}

export function designFingerprint(design: DeckDesignV1): string {
  const value = stableDesignJson(design);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
