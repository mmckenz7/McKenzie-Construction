export const DECK_TAKEOFF_VERSION = "deck-reviewed-takeoff-v1" as const;

export type DeckObservationItem = Readonly<{
  itemKey: string;
  observation: Record<string, unknown>;
}>;

export type DeckBlueprintVisitSeed = Readonly<{
  source: "completed_human_site_visit";
  observedMeasurements: readonly Readonly<{
    itemKey: string;
    key: string;
    value: string;
    unit: string;
  }>[];
  supportedJoistSpacingInches: "12" | "16" | "24" | null;
  heightFromGradeFeet: number | null;
  estimatingAssumptions: Readonly<{
    joistSize: "2x6" | "2x8" | "2x10" | "2x12" | null;
    beamSize: "2x6" | "2x8" | "2x10" | "2x12" | null;
    postSize: "4x4" | "6x6" | null;
    postCount: number | null;
  }>;
}>;

export function deckBlueprintVisitSeed(
  items: readonly DeckObservationItem[],
): DeckBlueprintVisitSeed {
  const keys = new Set([
    "height_from_grade",
    "ledger_length",
    "joist_spacing",
    "joist_depth",
    "beam_depth",
    "post_dimensions",
    "support_spacing",
    "exposed_footing_dimensions",
    "stair_width",
    "total_rise",
    "tread_depth",
    "representative_riser",
    "landing_dimensions",
    "guard_height",
    "opening",
    "rail_lengths_by_area",
    "handrail_height",
  ]);
  const observedMeasurements: {
    itemKey: string;
    key: string;
    value: string;
    unit: string;
  }[] = [];
  for (const item of items) {
    const measurements = item.observation.measurements;
    if (
      !measurements ||
      typeof measurements !== "object" ||
      Array.isArray(measurements)
    )
      continue;
    for (const [key, raw] of Object.entries(
      measurements as Record<string, unknown>,
    )) {
      if (
        !keys.has(key) ||
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      )
        continue;
      const measurement = raw as Record<string, unknown>;
      if (
        typeof measurement.value === "string" &&
        measurement.value.trim() &&
        typeof measurement.unit === "string" &&
        measurement.unit.trim()
      )
        observedMeasurements.push({
          itemKey: item.itemKey,
          key,
          value: measurement.value.trim(),
          unit: measurement.unit.trim(),
        });
    }
  }
  const spacing = observedMeasurements.find(
    (item) => item.key === "joist_spacing",
  );
  const spacingInches = spacing
    ? measurementFeet(spacing.value, spacing.unit)
    : null;
  const rounded =
    spacingInches === null ? null : String(Math.round(spacingInches * 12));
  const inches = (key: string) => {
    const item = observedMeasurements.find((entry) => entry.key === key);
    const feet = item ? measurementFeet(item.value, item.unit) : null;
    return feet === null ? null : Math.round(feet * 12);
  };
  const member = (key: string) => {
    const depth = inches(key);
    return depth === 6 || depth === 8 || depth === 10 || depth === 12
      ? (`2x${depth}` as const)
      : null;
  };
  const post = observedMeasurements.find(
    (entry) => entry.key === "post_dimensions",
  );
  const postNumbers = post?.value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const postSize =
    postNumbers[0] === 4 && postNumbers[1] === 4
      ? "4x4"
      : postNumbers[0] === 6 && postNumbers[1] === 6
        ? "6x6"
        : null;
  const support = observedMeasurements.find(
    (entry) => entry.key === "support_spacing",
  );
  const supportFeet = support
    ? measurementFeet(support.value, support.unit)
    : null;
  const dimensions = deckFieldDimensions(items);
  const postCount =
    supportFeet && dimensions.lengthFeet
      ? Math.ceil(dimensions.lengthFeet / supportFeet) + 1
      : null;
  const height = observedMeasurements.find(
    (entry) => entry.key === "height_from_grade",
  );
  const heightFromGradeFeet = height
    ? measurementFeet(height.value, height.unit)
    : null;
  return {
    source: "completed_human_site_visit",
    observedMeasurements,
    supportedJoistSpacingInches:
      rounded === "12" || rounded === "16" || rounded === "24" ? rounded : null,
    heightFromGradeFeet,
    estimatingAssumptions: {
      joistSize: member("joist_depth"),
      beamSize: member("beam_depth"),
      postSize,
      postCount,
    },
  };
}

export type DeckCatalogPrice = Readonly<{
  materialId: string;
  description: string;
  unit: string;
  unitCost: string;
  sourceReference: string;
}>;

export type DeckTakeoffPlanLine = Readonly<{
  key: string;
  category: "material" | "labor" | "equipment" | "other";
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
  catalogMaterialId: string | null;
  sourceReference: string;
}>;

export type DeckHardwareSelection = Readonly<{
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
  catalogMaterialId: string | null;
  sourceReference: string;
  verificationReference: string;
}>;

export const COMPLETE_REBUILD_LINE_KEYS = [
  "ledger_attachment",
  "joists",
  "beams",
  "posts",
  "footings",
  "blocking",
  "structural_connectors",
  "stairs",
  "demolition_disposal",
  "delivery",
  "equipment",
  "labor",
] as const;

export type CompleteRebuildLineKey =
  (typeof COMPLETE_REBUILD_LINE_KEYS)[number];
export type CompleteRebuildScopeDecision = "" | "include" | "not_in_scope";
export type CompleteRebuildScopeRequirement =
  "required" | "optional" | "applicability_unknown";

const ALWAYS_REQUIRED_REBUILD_KEYS = new Set<CompleteRebuildLineKey>([
  "joists",
  "beams",
  "posts",
  "footings",
  "blocking",
  "structural_connectors",
  "demolition_disposal",
  "labor",
]);

export function completeRebuildScopeRequirement(
  key: CompleteRebuildLineKey,
  items: readonly DeckObservationItem[],
): CompleteRebuildScopeRequirement {
  if (ALWAYS_REQUIRED_REBUILD_KEYS.has(key)) return "required";
  if (key === "delivery" || key === "equipment") return "optional";
  const geometry = deckRailingGeometry(items);
  if (key === "ledger_attachment") {
    return geometry.attached === null
      ? "applicability_unknown"
      : geometry.attached
        ? "required"
        : "optional";
  }
  return geometry.stairsPresent === null
    ? "applicability_unknown"
    : geometry.stairsPresent
      ? "required"
      : "optional";
}

export type DeckTakeoffPlan = Readonly<{
  customStructuralPlanRevisionId?: string | null;
  shapeBinding?: Readonly<{
    id: string;
    shapeRevision: number;
    outline: readonly import("@/lib/deck-prescriptive-plan").DeckOutlinePoint[];
    stairsPresent: boolean;
    stairPlacement: import("@/lib/deck-prescriptive-plan").DeckStairPlacement | null;
  }> | null;
  takeoffScope: "complete_rebuild" | "legacy_partial";
  completeRebuildConfirmed: boolean;
  buildPlanReference: string;
  buildPlanConfirmed: boolean;
  framingPlanEvidence?:
    import("@/lib/deck-prescriptive-plan").DeckPrescriptivePlan | null;
  hardwareSelections?: readonly DeckHardwareSelection[];
  scopeDecisions: Readonly<
    Record<CompleteRebuildLineKey, CompleteRebuildScopeDecision>
  >;
  boardRunDirection: "along_length" | "along_width";
  stairEdge: "left" | "right" | "yard" | "top";
  stairPosition: "start" | "center" | "end";
  stairOffsetFeet: string;
  stairPlacementConfirmed: boolean;
  boardActualWidthInches: string;
  boardGapInches: string;
  boardStockLengthFeet: string;
  boardWastePercent: string;
  boardCatalogMaterialId: string | null;
  boardUnitCost: string;
  boardSourceReference: string;
  screwCoverageSquareFeetPerPack: string;
  screwCatalogMaterialId: string | null;
  screwPackUnitCost: string;
  screwSourceReference: string;
  railingSectionLengthFeet: string;
  railingCatalogMaterialId: string | null;
  railingUnitCost: string;
  railingSourceReference: string;
  additionalLines: readonly DeckTakeoffPlanLine[];
}>;

export function deckStructuralLineIsComplete(
  line: Readonly<{ description: string; quantity: string; unit: string }>,
) {
  const quantity = line.quantity.trim();
  if (!/^(?:\d+|\d*\.\d+)$/.test(quantity)) return false;
  const numericQuantity = Number(quantity);
  return (
    line.description.trim().length > 0 &&
    line.unit.trim().length > 0 &&
    Number.isFinite(numericQuantity) &&
    numericQuantity > 0
  );
}

export function deckShapeBindingMatches(
  left: DeckTakeoffPlan["shapeBinding"],
  right: DeckTakeoffPlan["shapeBinding"],
) {
  if (!left || !right) return !left && !right;
  const samePlacement =
    left.stairPlacement === null && right.stairPlacement === null
      ? true
      : left.stairPlacement !== null && right.stairPlacement !== null
        ? left.stairPlacement.edgeIndex === right.stairPlacement.edgeIndex &&
          left.stairPlacement.offsetFeet === right.stairPlacement.offsetFeet &&
          left.stairPlacement.widthFeet === right.stairPlacement.widthFeet &&
          left.stairPlacement.projectionFeet ===
            right.stairPlacement.projectionFeet
        : false;
  return (
    left.id === right.id &&
    left.shapeRevision === right.shapeRevision &&
    left.stairsPresent === right.stairsPresent &&
    samePlacement &&
    left.outline.length === right.outline.length &&
    left.outline.every(
      (point, index) =>
        point.x === right.outline[index]?.x && point.y === right.outline[index]?.y,
    )
  );
}

export type DeckTakeoffPreviewLine = Readonly<{
  key: string;
  category: DeckTakeoffPlanLine["category"];
  customerDescription: string;
  internalDescription: string;
  quantity: string;
  unit: string;
  unitCost: string;
  catalogMaterialId: string | null;
  sourceReference: string;
  formula: string;
}>;

export type DeckTakeoffPreview = Readonly<{
  version: typeof DECK_TAKEOFF_VERSION;
  status: "ready" | "needs_input";
  deckLengthFeet: string | null;
  deckWidthFeet: string | null;
  deckAreaSquareFeet: string | null;
  railingLengthFeet: string | null;
  deckingLayout:
    | "seamless"
    | "picture_frame_divider"
    | "reviewed_custom_plan"
    | null;
  lines: readonly DeckTakeoffPreviewLine[];
  unresolved: readonly string[];
  disclosures: readonly string[];
  previewBinding: string;
}>;

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimal(value: unknown) {
  if (typeof value !== "string" || !DECIMAL.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatted(value: number, places = 4) {
  return value.toFixed(places).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "");
}

export function customDeckFinishGeometry(args: Readonly<{
  outline: readonly Readonly<{ x: number; y: number }>[];
  attached: boolean | null;
  stairsPresent: boolean | null;
  stairPlacement: Readonly<{ widthFeet: number }> | null;
}>) {
  if (args.outline.length < 3) return null;
  const edgeLengths = args.outline.map((point, index, outline) => {
    const next = outline[(index + 1) % outline.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const areaSquareFeet = Math.abs(
    args.outline.reduce((sum, point, index, outline) => {
      const next = outline[(index + 1) % outline.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
  if (!Number.isFinite(areaSquareFeet) || areaSquareFeet <= 0) return null;
  const perimeterFeet = edgeLengths.reduce((sum, length) => sum + length, 0);
  const houseEdgeFeet =
    args.attached === true
      ? args.outline.reduce((sum, point, index, outline) => {
          const next = outline[(index + 1) % outline.length];
          const isHouseEdge = Math.abs(point.y) < 0.0001 && Math.abs(next.y) < 0.0001;
          return isHouseEdge ? sum + edgeLengths[index] : sum;
        }, 0)
      : 0;
  const stairOpeningFeet =
    args.stairsPresent === true && args.stairPlacement
      ? args.stairPlacement.widthFeet
      : 0;
  return Object.freeze({
    areaSquareFeet,
    perimeterFeet,
    houseEdgeFeet,
    stairOpeningFeet,
    levelRailingFeet:
      args.attached === null
        ? null
        : Math.max(0, perimeterFeet - houseEdgeFeet - stairOpeningFeet),
  });
}

export function estimateCustomDeckBoardPieces(args: Readonly<{
  areaSquareFeet: number;
  boardActualWidthInches: number;
  boardGapInches: number;
  stockLengthFeet: number;
  wastePercent: number;
}>) {
  if (
    !Number.isFinite(args.areaSquareFeet) ||
    args.areaSquareFeet <= 0 ||
    !Number.isFinite(args.boardActualWidthInches) ||
    args.boardActualWidthInches <= 0 ||
    !Number.isFinite(args.boardGapInches) ||
    args.boardGapInches < 0 ||
    !Number.isFinite(args.stockLengthFeet) ||
    args.stockLengthFeet <= 0 ||
    !Number.isFinite(args.wastePercent) ||
    args.wastePercent < 0 ||
    args.wastePercent > 50
  )
    return null;
  const coverageSquareFeetPerBoard =
    args.stockLengthFeet *
    ((args.boardActualWidthInches + args.boardGapInches) / 12);
  return Object.freeze({
    coverageSquareFeetPerBoard,
    pieces: Math.ceil(
      (args.areaSquareFeet / coverageSquareFeetPerBoard) *
        (1 + args.wastePercent / 100),
    ),
  });
}

export function estimateCustomSquareEdgePieces(args: Readonly<{
  perimeterFeet: number;
  boardRunFeet: number;
  dividerSpanFeet: number;
  stockLengthFeet: number;
  wastePercent: number;
}>) {
  if (
    !Number.isFinite(args.perimeterFeet) ||
    args.perimeterFeet <= 0 ||
    !Number.isFinite(args.boardRunFeet) ||
    args.boardRunFeet <= 0 ||
    !Number.isFinite(args.dividerSpanFeet) ||
    args.dividerSpanFeet <= 0 ||
    !Number.isFinite(args.stockLengthFeet) ||
    args.stockLengthFeet <= 0 ||
    !Number.isFinite(args.wastePercent) ||
    args.wastePercent < 0 ||
    args.wastePercent > 50
  )
    return null;
  const dividerCount = Math.max(
    0,
    Math.ceil(args.boardRunFeet / args.stockLengthFeet) - 1,
  );
  const requiredLinearFeet =
    args.perimeterFeet + dividerCount * args.dividerSpanFeet;
  return Object.freeze({
    dividerCount,
    requiredLinearFeet,
    pieces: Math.ceil(
      (requiredLinearFeet / args.stockLengthFeet) *
        (1 + args.wastePercent / 100),
    ),
  });
}

export function measurementFeet(value: unknown, unit: unknown): number | null {
  if (typeof value !== "string" || typeof unit !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (unit === "ft + in") {
    const match = normalized.match(
      /^(\d+(?:\.\d+)?)\s*ft(?:\s+(\d+(?:\.\d+)?)\s*in)?$/,
    );
    if (!match) return null;
    return Number(match[1]) + Number(match[2] ?? 0) / 12;
  }
  const parsed = decimal(normalized);
  if (parsed === null) return null;
  if (unit === "ft") return parsed;
  if (unit === "in") return parsed / 12;
  return null;
}

export function deckFieldDimensions(items: readonly DeckObservationItem[]) {
  const fullDeck = items.find((item) => item.itemKey === "full_deck_yard");
  const measurements = fullDeck?.observation.measurements;
  if (
    !measurements ||
    typeof measurements !== "object" ||
    Array.isArray(measurements)
  ) {
    return { lengthFeet: null, widthFeet: null } as const;
  }
  const record = measurements as Record<string, unknown>;
  const read = (key: string) => {
    const raw = record[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const measurement = raw as Record<string, unknown>;
    return measurementFeet(measurement.value, measurement.unit);
  };
  return { lengthFeet: read("length"), widthFeet: read("width") } as const;
}

function observationMeasurementFeet(
  item: DeckObservationItem | undefined,
  key: string,
) {
  const measurements = item?.observation.measurements;
  if (
    !measurements ||
    typeof measurements !== "object" ||
    Array.isArray(measurements)
  )
    return null;
  const raw = (measurements as Record<string, unknown>)[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const measurement = raw as Record<string, unknown>;
  return measurementFeet(measurement.value, measurement.unit);
}

function conditionalApplies(item: DeckObservationItem | undefined) {
  if (item?.observation.conditionStatus === "applies") return true;
  if (item?.observation.conditionStatus === "not_applicable") return false;
  return null;
}

export function deckRailingGeometry(
  items: readonly DeckObservationItem[],
  proposedDimensions?: Readonly<{
    lengthFeet: number;
    widthFeet: number;
  }> | null,
) {
  const fieldDimensions = deckFieldDimensions(items);
  const lengthFeet =
    proposedDimensions?.lengthFeet ?? fieldDimensions.lengthFeet;
  const widthFeet = proposedDimensions?.widthFeet ?? fieldDimensions.widthFeet;
  const attached = conditionalApplies(
    items.find((item) => item.itemKey === "house_ledger"),
  );
  const stairs = items.find((item) => item.itemKey === "stairs_landings");
  const stairsPresent = conditionalApplies(stairs);
  const railingsPresent = conditionalApplies(
    items.find((item) => item.itemKey === "guards_railings"),
  );
  const stairWidthFeet = stairsPresent
    ? observationMeasurementFeet(stairs, "stair_width")
    : 0;
  if (
    !lengthFeet ||
    !widthFeet ||
    attached === null ||
    railingsPresent === null
  ) {
    return {
      railingLengthFeet: null,
      attached,
      stairsPresent,
      railingsPresent,
      stairWidthFeet,
    } as const;
  }
  if (!railingsPresent) {
    return {
      railingLengthFeet: 0,
      attached,
      stairsPresent,
      railingsPresent,
      stairWidthFeet,
    } as const;
  }
  if (stairsPresent === null || (stairsPresent && !stairWidthFeet)) {
    return {
      railingLengthFeet: null,
      attached,
      stairsPresent,
      railingsPresent,
      stairWidthFeet,
    } as const;
  }
  const exposedPerimeter = attached
    ? lengthFeet + 2 * widthFeet
    : 2 * (lengthFeet + widthFeet);
  return {
    railingLengthFeet: Math.max(0, exposedPerimeter - (stairWidthFeet ?? 0)),
    attached,
    stairsPresent,
    railingsPresent,
    stairWidthFeet,
  } as const;
}

export function deckStairPlacementIssue(
  args: Readonly<{
    lengthFeet: number | null;
    widthFeet: number | null;
    attached: boolean | null;
    stairsPresent: boolean | null;
    stairWidthFeet: number | null;
    stairEdge: DeckTakeoffPlan["stairEdge"];
    stairOffsetFeet?: string;
    stairPlacementConfirmed: boolean;
  }>,
) {
  if (!args.stairsPresent) return null;
  if (!args.stairPlacementConfirmed)
    return "Confirm where the stairs belong on the blueprint.";
  if (args.attached && args.stairEdge === "top")
    return "A house-attached deck cannot place the stairs on the house edge.";
  const edgeLength =
    args.stairEdge === "left" || args.stairEdge === "right"
      ? args.widthFeet
      : args.lengthFeet;
  if (!edgeLength || !args.stairWidthFeet)
    return "The stair opening needs a verified width and deck edge.";
  const offset = Number(args.stairOffsetFeet);
  if (
    args.stairOffsetFeet !== undefined &&
    args.stairOffsetFeet !== "" &&
    (!Number.isFinite(offset) ||
      offset < args.stairWidthFeet / 2 ||
      offset > edgeLength - args.stairWidthFeet / 2)
  ) {
    return "Move the entire stair opening onto the selected deck edge.";
  }
  if (args.stairWidthFeet > edgeLength) {
    return `The ${formatted(args.stairWidthFeet, 2)} ft stair opening is wider than the selected ${formatted(edgeLength, 2)} ft deck edge.`;
  }
  return null;
}

export function optimizeDeckBoardLayout(
  args: Readonly<{
    runLengthFeet: number;
    fieldWidthFeet: number;
    boardActualWidthInches: number;
    boardGapInches: number;
    stockLengthFeet: number;
    wastePercent: number;
  }>,
) {
  const rows = Math.ceil(
    (args.fieldWidthFeet * 12) /
      (args.boardActualWidthInches + args.boardGapInches),
  );
  if (args.stockLengthFeet >= args.runLengthFeet) {
    return {
      layout: "seamless" as const,
      rows,
      fieldPieces: rows,
      borderAndDividerPieces: 0,
      totalPieces: Math.ceil(rows * (1 + args.wastePercent / 100)),
    };
  }
  if (args.stockLengthFeet * 2 < args.runLengthFeet) return null;
  const pictureFrameLinearFeet = 2 * (args.runLengthFeet + args.fieldWidthFeet);
  const centerDividerLinearFeet = args.fieldWidthFeet;
  const borderAndDividerPieces = Math.ceil(
    (pictureFrameLinearFeet + centerDividerLinearFeet) / args.stockLengthFeet,
  );
  const fieldPieces = rows * 2;
  return {
    layout: "picture_frame_divider" as const,
    rows,
    fieldPieces,
    borderAndDividerPieces,
    totalPieces: Math.ceil(
      (fieldPieces + borderAndDividerPieces) * (1 + args.wastePercent / 100),
    ),
  };
}

function resolveCost(
  catalogId: string | null | undefined,
  enteredCost: string | undefined,
  enteredSource: string | undefined,
  catalog: ReadonlyMap<string, DeckCatalogPrice>,
  expectedUnit: string,
) {
  if (catalogId) {
    const match = catalog.get(catalogId);
    if (!match) return null;
    const price = decimal(match.unitCost);
    const expected = expectedUnit.trim().toLowerCase();
    const actual = match.unit.trim().toLowerCase();
    const compatible =
      expected === actual ||
      (["ea", "each"].includes(expected) && ["ea", "each"].includes(actual)) ||
      (["package", "pack", "box"].includes(expected) &&
        ["package", "pack", "box"].includes(actual)) ||
      (expected === "bag" &&
        (actual === "bag" ||
          (actual === "ea" &&
            match.description.toLowerCase().includes("bag"))));
    if (
      price === null ||
      price <= 0 ||
      !match.sourceReference.trim() ||
      !compatible
    )
      return null;
    return {
      unitCost: match.unitCost,
      sourceReference: match.sourceReference,
      catalogMaterialId: match.materialId,
    };
  }
  const cost = decimal(enteredCost);
  const source = typeof enteredSource === "string" ? enteredSource.trim() : "";
  if (cost === null || cost <= 0 || !source) return null;
  return {
    unitCost: formatted(cost),
    sourceReference: source,
    catalogMaterialId: null,
  };
}

function bind(value: unknown) {
  return `${DECK_TAKEOFF_VERSION}:${JSON.stringify(value)}`;
}

function completeRebuildLineMap(lines: readonly DeckTakeoffPlanLine[]) {
  return new Map(lines.map((line) => [line.key, line]));
}

export function buildDeckTakeoffPreview(
  input: Readonly<{
    items: readonly DeckObservationItem[];
    plan: DeckTakeoffPlan;
    catalog: ReadonlyMap<string, DeckCatalogPrice>;
  }>,
): DeckTakeoffPreview {
  const fieldDimensions = deckFieldDimensions(input.items);
  const proposedDimensions = input.plan.framingPlanEvidence?.inputs ?? null;
  const lengthFeet =
    proposedDimensions?.lengthFeet ?? fieldDimensions.lengthFeet;
  const widthFeet = proposedDimensions?.widthFeet ?? fieldDimensions.widthFeet;
  const unresolved: string[] = [];
  const lines: DeckTakeoffPreviewLine[] = [];
  if (!lengthFeet || !widthFeet)
    unresolved.push("Verified deck length and width are required.");
  const boundOutline = input.plan.shapeBinding?.outline ?? null;
  const boundOutlineIsRectangle = Boolean(
    boundOutline &&
      boundOutline.length === 4 &&
      boundOutline.every((point, index) => {
        const next = boundOutline[(index + 1) % boundOutline.length];
        return point.x === next.x || point.y === next.y;
      }),
  );
  const customFootprint = Boolean(boundOutline && !boundOutlineIsRectangle);
  const polygonArea = input.plan.shapeBinding
    ? Math.abs(
        input.plan.shapeBinding.outline.reduce((sum, point, index, outline) => {
          const next = outline[(index + 1) % outline.length];
          return sum + point.x * next.y - next.x * point.y;
        }, 0) / 2,
      )
    : null;
  const area = customFootprint
    ? polygonArea
    : lengthFeet !== null && widthFeet !== null
      ? lengthFeet * widthFeet
      : null;
  const railingGeometry = deckRailingGeometry(
    input.items,
    lengthFeet && widthFeet ? { lengthFeet, widthFeet } : null,
  );
  const customFinishGeometry =
    customFootprint && input.plan.shapeBinding
      ? customDeckFinishGeometry({
          outline: input.plan.shapeBinding.outline,
          attached: railingGeometry.attached,
          stairsPresent: input.plan.shapeBinding.stairsPresent,
          stairPlacement: input.plan.shapeBinding.stairPlacement,
        })
      : null;
  const stairPlacementIssue = deckStairPlacementIssue({
    lengthFeet,
    widthFeet,
    attached: railingGeometry.attached,
    stairsPresent: railingGeometry.stairsPresent,
    stairWidthFeet: railingGeometry.stairWidthFeet,
    stairEdge: input.plan.stairEdge,
    stairOffsetFeet: input.plan.stairOffsetFeet,
    stairPlacementConfirmed: input.plan.stairPlacementConfirmed,
  });
  if (stairPlacementIssue) unresolved.push(stairPlacementIssue);
  let deckingLayout: DeckTakeoffPreview["deckingLayout"] = null;
  const rebuildLines = completeRebuildLineMap(input.plan.additionalLines);
  if (input.plan.takeoffScope === "complete_rebuild") {
    if (!input.plan.completeRebuildConfirmed) {
      unresolved.push(
        "Confirm that this estimate replaces the entire deck, including framing, supports, and footings.",
      );
    }
    if (!input.plan.buildPlanReference.trim()) {
      unresolved.push(
        "Name the reviewed framing/build plan, engineer detail, or manufacturer installation detail used for this complete rebuild.",
      );
    }
    if (!input.plan.buildPlanConfirmed) {
      unresolved.push(
        "Confirm that the framing and support quantities came from the named build-plan source and were not sized by this app.",
      );
    }
    for (const key of COMPLETE_REBUILD_LINE_KEYS) {
      const decision = input.plan.scopeDecisions[key];
      const line = rebuildLines.get(key);
      const requirement = completeRebuildScopeRequirement(key, input.items);
      if (!line) {
        unresolved.push(
          `The complete-rebuild scope is missing ${key.replaceAll("_", " ")}.`,
        );
      } else if (requirement === "applicability_unknown") {
        unresolved.push(
          `Confirm whether ${line.description.trim() || key.replaceAll("_", " ")} applies in the approved deck plan.`,
        );
      } else if (requirement === "required" && decision !== "include") {
        unresolved.push(
          `${line.description.trim() || key.replaceAll("_", " ")} is required for this complete-rebuild estimate and must be included.`,
        );
      } else if (!decision) {
        unresolved.push(
          `Decide whether ${line.description.trim() || key.replaceAll("_", " ")} is included or not in this estimate.`,
        );
      }
    }
  }

  const boardWidth = decimal(input.plan.boardActualWidthInches);
  const boardGap = decimal(input.plan.boardGapInches);
  const stockLength = decimal(input.plan.boardStockLengthFeet);
  const waste = decimal(input.plan.boardWastePercent);
  const boardPrice = resolveCost(
    input.plan.boardCatalogMaterialId,
    input.plan.boardUnitCost,
    input.plan.boardSourceReference,
    input.catalog,
    "ea",
  );
  if (customFootprint) {
    const reviewedDecking = rebuildLines.get("custom_decking");
    const customBoardEstimate =
      customFinishGeometry &&
      boardWidth &&
      boardGap !== null &&
      stockLength &&
      waste !== null
        ? estimateCustomDeckBoardPieces({
            areaSquareFeet: customFinishGeometry.areaSquareFeet,
            boardActualWidthInches: boardWidth,
            boardGapInches: boardGap,
            stockLengthFeet: stockLength,
            wastePercent: waste,
          })
        : null;
    const customDeckingPrice = reviewedDecking
      ? resolveCost(
          reviewedDecking.catalogMaterialId,
          reviewedDecking.unitCost,
          reviewedDecking.sourceReference,
          input.catalog,
          "ea",
        )
      : null;
    if (!reviewedDecking?.description.trim()) {
      unresolved.push(
        "Choose the deck-board product for the approved custom footprint.",
      );
    } else if (!customBoardEstimate) {
      unresolved.push(
        "Deck-board width, gap, stock length, and waste are required to calculate the custom-footprint purchase count.",
      );
    } else if (!customDeckingPrice) {
      unresolved.push(
        "Deck boards need an estimating unit cost and a traceable product source.",
      );
    } else {
      deckingLayout = "reviewed_custom_plan";
      lines.push({
        key: "custom_decking",
        category: "material",
        customerDescription: reviewedDecking.description.trim(),
        internalDescription: `${formatted(customFinishGeometry?.areaSquareFeet ?? 0, 2)} sq ft approved polygon divided by ${formatted(customBoardEstimate.coverageSquareFeetPerBoard, 3)} sq ft coverage per board, plus ${formatted(waste ?? 0, 2)}% estimating waste. This is a finish-material estimate, not a board-by-board cut plan.`,
        quantity: String(customBoardEstimate.pieces),
        unit: "ea",
        unitCost: customDeckingPrice.unitCost,
        catalogMaterialId: customDeckingPrice.catalogMaterialId,
        sourceReference: customDeckingPrice.sourceReference,
        formula: `ceil((${formatted(customFinishGeometry?.areaSquareFeet ?? 0, 2)} sq ft ÷ ${formatted(customBoardEstimate.coverageSquareFeetPerBoard, 3)} sq ft/board) × (1 + ${formatted(waste ?? 0, 2)}%)) = ${customBoardEstimate.pieces} boards`,
      });
    }
  } else if (area !== null && lengthFeet !== null && widthFeet !== null) {
    if (
      !boardWidth ||
      boardGap === null ||
      boardGap < 0 ||
      !stockLength ||
      waste === null ||
      waste < 0 ||
      waste > 50
    ) {
      unresolved.push(
        "Deck-board size, gap, stock length, and waste must be completed.",
      );
    } else if (!boardPrice) {
      unresolved.push(
        "Deck boards need an exact catalog match or a verified unit cost and source.",
      );
    } else {
      const runLengthFeet =
        input.plan.boardRunDirection === "along_width" ? widthFeet : lengthFeet;
      const fieldWidthFeet =
        input.plan.boardRunDirection === "along_width" ? lengthFeet : widthFeet;
      const optimized = optimizeDeckBoardLayout({
        runLengthFeet,
        fieldWidthFeet,
        boardActualWidthInches: boardWidth,
        boardGapInches: boardGap,
        stockLengthFeet: stockLength,
        wastePercent: waste,
      });
      if (!optimized) {
        unresolved.push(
          "Available deck boards are too short for a seamless run or a reviewed picture-frame divider layout.",
        );
      } else {
        deckingLayout = optimized.layout;
        lines.push({
          key: "decking",
          category: "material",
          customerDescription: "Decking boards",
          internalDescription:
            optimized.layout === "seamless"
              ? `${optimized.rows} board rows across ${formatted(fieldWidthFeet, 2)} ft; ${formatted(waste, 2)}% reviewed waste. Each ${formatted(stockLength, 2)} ft board spans the ${formatted(runLengthFeet, 2)} ft run with no field joint.`
              : `${optimized.rows} field rows use two pieces landing at a center divider, plus ${optimized.borderAndDividerPieces} pieces for the perimeter picture frame and divider; ${formatted(waste, 2)}% reviewed waste. No unsupported butt-joint layout is used.`,
          quantity: String(optimized.totalPieces),
          unit: "ea",
          unitCost: boardPrice.unitCost,
          catalogMaterialId: boardPrice.catalogMaterialId,
          sourceReference: boardPrice.sourceReference,
          formula:
            optimized.layout === "seamless"
              ? `ceil(${optimized.rows} rows × (1 + ${formatted(waste, 2)}%)) = ${optimized.totalPieces} boards`
              : `ceil((${optimized.fieldPieces} field pieces + ${optimized.borderAndDividerPieces} picture-frame/divider pieces) × (1 + ${formatted(waste, 2)}%)) = ${optimized.totalPieces} boards`,
        });
      }
    }
  }

  const screwCoverage = decimal(input.plan.screwCoverageSquareFeetPerPack);
  const screwPrice = resolveCost(
    input.plan.screwCatalogMaterialId,
    input.plan.screwPackUnitCost,
    input.plan.screwSourceReference,
    input.catalog,
    "package",
  );
  if (area !== null) {
    if (!deckingLayout)
      unresolved.push(
        "Deck fasteners cannot be calculated until the board product and supported board layout are reviewed.",
      );
    else if (!screwCoverage || !input.plan.screwSourceReference.trim())
      unresolved.push(
        "Deck fasteners are required. Enter package coverage and a traceable compatibility/installation source for the selected board layout and fastener product.",
      );
    else if (!screwPrice)
      unresolved.push(
        "Fasteners need an exact catalog match or a verified package cost and source.",
      );
    else {
      const packs = Math.ceil(area / screwCoverage);
      lines.push({
        key: "deck_fasteners",
        category: "material",
        customerDescription: "Deck fasteners",
        internalDescription: `${formatted(area, 2)} sq ft divided by reviewed coverage of ${formatted(screwCoverage, 2)} sq ft per package.`,
        quantity: String(packs),
        unit: "package",
        unitCost: screwPrice.unitCost,
        catalogMaterialId: screwPrice.catalogMaterialId,
        sourceReference: screwPrice.sourceReference,
        formula: `ceil(${formatted(area, 2)} sq ft ÷ ${formatted(screwCoverage, 2)} sq ft/package) = ${packs} packages`,
      });
    }
  }

  const railingSectionLength = decimal(input.plan.railingSectionLengthFeet);
  const railingPrice = resolveCost(
    input.plan.railingCatalogMaterialId,
    input.plan.railingUnitCost,
    input.plan.railingSourceReference,
    input.catalog,
    "ea",
  );
  if (customFootprint && railingGeometry.railingsPresent) {
    const reviewedRailing = rebuildLines.get("custom_railing");
    if (!customFinishGeometry || customFinishGeometry.levelRailingFeet === null)
      unresolved.push(
        "Automatic custom-footprint railing needs the saved house-attachment fact.",
      );
    else if (!reviewedRailing || !deckStructuralLineIsComplete(reviewedRailing))
      unresolved.push(
        "Choose a railing system so its package can be calculated from the approved custom perimeter.",
      );
  } else if (railingGeometry.railingsPresent) {
    if (stairPlacementIssue) {
      // The exact edge geometry must be valid before railing sections can be priced.
    } else if (railingGeometry.railingLengthFeet === null) {
      unresolved.push(
        "Automatic railing length needs the deck attachment and stair-opening facts from the field visit.",
      );
    } else if (!railingSectionLength) {
      unresolved.push("The selected railing product needs its section length.");
    } else if (!railingPrice) {
      unresolved.push(
        "Railing needs an exact Lowe's catalog match or a verified product cost and source.",
      );
    } else {
      const sections = Math.ceil(
        railingGeometry.railingLengthFeet / railingSectionLength,
      );
      lines.push({
        key: "railing",
        category: "material",
        customerDescription: "Railing sections",
        internalDescription: `Calculated from the rectangular deck perimeter (${railingGeometry.attached ? "house-attached" : "freestanding"})${railingGeometry.stairsPresent ? ` less the ${formatted(railingGeometry.stairWidthFeet ?? 0, 2)} ft stair opening` : ""}.`,
        quantity: String(sections),
        unit: "ea",
        unitCost: railingPrice.unitCost,
        catalogMaterialId: railingPrice.catalogMaterialId,
        sourceReference: railingPrice.sourceReference,
        formula: `ceil(${formatted(railingGeometry.railingLengthFeet, 2)} railing ft ÷ ${formatted(railingSectionLength, 2)} ft/section) = ${sections} sections`,
      });
    }
  }

  if (input.plan.framingPlanEvidence) {
    const selections = new Map(
      (input.plan.hardwareSelections ?? []).map((item) => [item.key, item]),
    );
    for (const requirement of input.plan.framingPlanEvidence.hardwareSchedule) {
      if (
        requirement.key === "picture_frame_blocking_connectors" &&
        deckingLayout !== "picture_frame_divider"
      )
        continue;
      const selection = selections.get(requirement.key);
      const quantity = selection ? decimal(selection.quantity) : null;
      const cost = selection
        ? resolveCost(
            selection.catalogMaterialId,
            selection.unitCost,
            selection.sourceReference,
            input.catalog,
            selection.unit,
          )
        : null;
      const underRequiredQuantity =
        requirement.quantity > 0 &&
        (quantity === null || quantity < requirement.quantity);
      if (
        !selection ||
        selection.description !== requirement.specification ||
        !quantity ||
        underRequiredQuantity ||
        selection.unit !== requirement.unit ||
        !cost ||
        !selection.verificationReference.trim()
      ) {
        unresolved.push(
          `${requirement.key.replaceAll("_", " ")} needs a compatible reviewed product, purchase quantity${requirement.quantity > 0 ? ` of at least ${requirement.quantity} ${requirement.unit}` : " from the reviewed detail"}, price, traceable source, and documented compatibility/detail verification. Deck screws do not satisfy structural connector fastener requirements.`,
        );
        continue;
      }
      lines.push({
        key: `hardware:${requirement.key}`,
        category: "material",
        customerDescription: requirement.specification,
        internalDescription: `Code-grounded hardware requirement from ${requirement.sourceId}; compatibility/detail verification: ${selection.verificationReference.trim()}. Product compatibility was human verified and was not inferred by the app.`,
        quantity: formatted(quantity),
        unit: selection.unit,
        unitCost: cost.unitCost,
        catalogMaterialId: cost.catalogMaterialId,
        sourceReference: cost.sourceReference,
        formula: `Reviewed compatible hardware selection: ${formatted(quantity)} ${selection.unit}`,
      });
    }
  }

  for (const line of input.plan.additionalLines) {
    if (line.key === "railing") continue;
    if (customFootprint && line.key === "custom_decking") continue;
    if (
      customFootprint &&
      line.key === "custom_railing" &&
      railingGeometry.railingsPresent === false
    )
      continue;
    if (line.key === "structural_connectors" && input.plan.framingPlanEvidence)
      continue;
    const scopeDecision =
      input.plan.takeoffScope === "complete_rebuild" &&
      COMPLETE_REBUILD_LINE_KEYS.includes(line.key as CompleteRebuildLineKey)
        ? input.plan.scopeDecisions[line.key as CompleteRebuildLineKey]
        : null;
    if (scopeDecision === "not_in_scope") continue;
    const quantity = decimal(line.quantity);
    if (quantity === null || quantity === 0) {
      if (scopeDecision === "include")
        unresolved.push(
          `${line.description.trim() || line.key} needs a reviewed planned quantity.`,
        );
      continue;
    }
    const cost = resolveCost(
      line.catalogMaterialId,
      line.unitCost,
      line.sourceReference,
      input.catalog,
      line.unit,
    );
    if (!line.description.trim() || !line.unit.trim()) {
      unresolved.push(`${line.key} needs a description and unit.`);
    } else if (!cost) {
      unresolved.push(
        `${line.description.trim()} needs an exact catalog match or a verified unit cost and source.`,
      );
    } else {
      lines.push({
        key: line.key,
        category: line.category,
        customerDescription: line.description.trim(),
        internalDescription:
          input.plan.takeoffScope === "complete_rebuild"
            ? input.plan.framingPlanEvidence
              ? `Bounded prescriptive profile generated and checked this main-deck framing quantity; human approved the main-deck draft: ${input.plan.buildPlanReference.trim()}. Named unresolved work packages remain separate. Not inferred from photos.`
              : `Human-entered complete-rebuild quantity from: ${input.plan.buildPlanReference.trim()}. Not inferred from photos or sized by this app.`
            : "Human-entered planned quantity; not inferred from photos and not an engineering decision.",
        quantity: formatted(quantity),
        unit: line.unit.trim(),
        unitCost: cost.unitCost,
        catalogMaterialId: cost.catalogMaterialId,
        sourceReference: cost.sourceReference,
        formula: `Reviewed planned quantity: ${formatted(quantity)} ${line.unit.trim()}`,
      });
    }
  }
  if (!lines.length)
    unresolved.push("At least one priced true-cost line is required.");

  const bindingValue = {
    visit: {
      lengthFeet: lengthFeet === null ? null : formatted(lengthFeet),
      widthFeet: widthFeet === null ? null : formatted(widthFeet),
    },
    plan: input.plan,
    lines,
  };
  return Object.freeze({
    version: DECK_TAKEOFF_VERSION,
    status: unresolved.length ? "needs_input" : "ready",
    deckLengthFeet: lengthFeet === null ? null : formatted(lengthFeet),
    deckWidthFeet: widthFeet === null ? null : formatted(widthFeet),
    deckAreaSquareFeet: area === null ? null : formatted(area),
    railingLengthFeet:
      stairPlacementIssue ||
      (customFootprint
        ? customFinishGeometry?.levelRailingFeet === null ||
          customFinishGeometry?.levelRailingFeet === undefined
        : railingGeometry.railingLengthFeet === null)
        ? null
        : formatted(
            customFootprint
              ? customFinishGeometry?.levelRailingFeet ?? 0
              : railingGeometry.railingLengthFeet ?? 0,
          ),
    deckingLayout,
    lines: Object.freeze(lines),
    unresolved: Object.freeze(unresolved),
    disclosures: Object.freeze([
      "Photos document visible conditions; they do not create dimensions, quantities, structural design, or prices.",
      customFootprint
        ? "Custom-footprint decking uses the approved polygon area, selected board coverage, and estimating waste. It is a purchase estimate rather than a board-by-board cut plan."
        : "Decking quantity uses verified length and width plus the reviewed board width, gap, stock length, and waste; it prefers full-length boards and otherwise requires a picture-frame divider layout.",
      customFootprint
        ? "Custom-footprint railing uses the exact approved polygon perimeter, less the saved house edge and stair opening; stair-side rails remain part of the selected railing package."
        : "Railing length uses the verified rectangular deck perimeter, house attachment, and stair opening; product section count remains reviewable.",
      input.plan.framingPlanEvidence
        ? `The bounded prescriptive profile generated and checked the main-deck structural draft from explicit inputs; ${input.plan.framingPlanEvidence.unresolvedPackages.join(" and ").replaceAll("_", " ")} remain unresolved. Human approval and building-department review remain required.`
        : "The approved rectangle can establish deck area, decking layout, and reviewed railing perimeter only. It does not size or count structural members.",
      "Ledger and attachment, joists, beams, posts, footings, blocking, structural connectors, stairs, demolition, delivery, equipment, and labor remain human-entered scope and build-plan quantities.",
      "Every price is bound to an exact catalog record or a human-entered source reference.",
    ]),
    previewBinding: bind(bindingValue),
  });
}
