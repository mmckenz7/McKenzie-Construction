export const DECK_TAKEOFF_VERSION = "deck-reviewed-takeoff-v1" as const;

export type DeckObservationItem = Readonly<{
  itemKey: string;
  observation: Record<string, unknown>;
}>;

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

export type DeckTakeoffPlan = Readonly<{
  boardRunDirection: "along_length" | "along_width";
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
  deckingLayout: "seamless" | "picture_frame_divider" | null;
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

export function measurementFeet(value: unknown, unit: unknown): number | null {
  if (typeof value !== "string" || typeof unit !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (unit === "ft + in") {
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*ft(?:\s+(\d+(?:\.\d+)?)\s*in)?$/);
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
  if (!measurements || typeof measurements !== "object" || Array.isArray(measurements)) {
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
  if (!measurements || typeof measurements !== "object" || Array.isArray(measurements)) return null;
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

export function deckRailingGeometry(items: readonly DeckObservationItem[]) {
  const { lengthFeet, widthFeet } = deckFieldDimensions(items);
  const attached = conditionalApplies(items.find((item) => item.itemKey === "house_ledger"));
  const stairs = items.find((item) => item.itemKey === "stairs_landings");
  const stairsPresent = conditionalApplies(stairs);
  const railingsPresent = conditionalApplies(items.find((item) => item.itemKey === "guards_railings"));
  const stairWidthFeet = stairsPresent ? observationMeasurementFeet(stairs, "stair_width") : 0;
  if (!lengthFeet || !widthFeet || attached === null || railingsPresent === null) {
    return { railingLengthFeet: null, attached, stairsPresent, railingsPresent, stairWidthFeet } as const;
  }
  if (!railingsPresent) {
    return { railingLengthFeet: 0, attached, stairsPresent, railingsPresent, stairWidthFeet } as const;
  }
  if (stairsPresent === null || (stairsPresent && !stairWidthFeet)) {
    return { railingLengthFeet: null, attached, stairsPresent, railingsPresent, stairWidthFeet } as const;
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

export function optimizeDeckBoardLayout(args: Readonly<{
  runLengthFeet: number;
  fieldWidthFeet: number;
  boardActualWidthInches: number;
  boardGapInches: number;
  stockLengthFeet: number;
  wastePercent: number;
}>) {
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
    const compatible = expected === actual
      || (["ea", "each"].includes(expected) && ["ea", "each"].includes(actual))
      || (["package", "pack", "box"].includes(expected) && ["package", "pack", "box"].includes(actual))
      || (expected === "bag" && (actual === "bag" || actual === "ea" && match.description.toLowerCase().includes("bag")));
    if (price === null || price <= 0 || !match.sourceReference.trim() || !compatible) return null;
    return { unitCost: match.unitCost, sourceReference: match.sourceReference, catalogMaterialId: match.materialId };
  }
  const cost = decimal(enteredCost);
  const source = typeof enteredSource === "string" ? enteredSource.trim() : "";
  if (cost === null || cost <= 0 || !source) return null;
  return { unitCost: formatted(cost), sourceReference: source, catalogMaterialId: null };
}

function bind(value: unknown) {
  return `${DECK_TAKEOFF_VERSION}:${JSON.stringify(value)}`;
}

export function buildDeckTakeoffPreview(input: Readonly<{
  items: readonly DeckObservationItem[];
  plan: DeckTakeoffPlan;
  catalog: ReadonlyMap<string, DeckCatalogPrice>;
}>): DeckTakeoffPreview {
  const { lengthFeet, widthFeet } = deckFieldDimensions(input.items);
  const unresolved: string[] = [];
  const lines: DeckTakeoffPreviewLine[] = [];
  if (!lengthFeet || !widthFeet) unresolved.push("Verified deck length and width are required.");
  const area = lengthFeet !== null && widthFeet !== null ? lengthFeet * widthFeet : null;
  const railingGeometry = deckRailingGeometry(input.items);
  let deckingLayout: DeckTakeoffPreview["deckingLayout"] = null;

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
  if (area !== null && lengthFeet !== null && widthFeet !== null) {
    if (!boardWidth || boardGap === null || boardGap < 0 || !stockLength || waste === null || waste < 0 || waste > 50) {
      unresolved.push("Deck-board size, gap, stock length, and waste must be completed.");
    } else if (!boardPrice) {
      unresolved.push("Deck boards need an exact catalog match or a verified unit cost and source.");
    } else {
      const runLengthFeet = input.plan.boardRunDirection === "along_width" ? widthFeet : lengthFeet;
      const fieldWidthFeet = input.plan.boardRunDirection === "along_width" ? lengthFeet : widthFeet;
      const optimized = optimizeDeckBoardLayout({
        runLengthFeet,
        fieldWidthFeet,
        boardActualWidthInches: boardWidth,
        boardGapInches: boardGap,
        stockLengthFeet: stockLength,
        wastePercent: waste,
      });
      if (!optimized) {
        unresolved.push("Available deck boards are too short for a seamless run or a reviewed picture-frame divider layout.");
      } else {
        deckingLayout = optimized.layout;
        lines.push({
          key: "decking",
          category: "material",
          customerDescription: "Decking boards",
          internalDescription: optimized.layout === "seamless"
            ? `${optimized.rows} board rows across ${formatted(fieldWidthFeet, 2)} ft; ${formatted(waste, 2)}% reviewed waste. Each ${formatted(stockLength, 2)} ft board spans the ${formatted(runLengthFeet, 2)} ft run with no field joint.`
            : `${optimized.rows} field rows use two pieces landing at a center divider, plus ${optimized.borderAndDividerPieces} pieces for the perimeter picture frame and divider; ${formatted(waste, 2)}% reviewed waste. No unsupported butt-joint layout is used.`,
          quantity: String(optimized.totalPieces), unit: "ea", unitCost: boardPrice.unitCost,
          catalogMaterialId: boardPrice.catalogMaterialId,
          sourceReference: boardPrice.sourceReference,
          formula: optimized.layout === "seamless"
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
  if (area !== null && (input.plan.screwCoverageSquareFeetPerPack || input.plan.screwCatalogMaterialId || input.plan.screwPackUnitCost)) {
    if (!screwCoverage) unresolved.push("Fastener package coverage must come from the manufacturer guidance you are using.");
    else if (!screwPrice) unresolved.push("Fasteners need an exact catalog match or a verified package cost and source.");
    else {
      const packs = Math.ceil(area / screwCoverage);
      lines.push({
        key: "deck_fasteners", category: "material", customerDescription: "Deck fasteners",
        internalDescription: `${formatted(area, 2)} sq ft divided by reviewed coverage of ${formatted(screwCoverage, 2)} sq ft per package.`,
        quantity: String(packs), unit: "package", unitCost: screwPrice.unitCost,
        catalogMaterialId: screwPrice.catalogMaterialId, sourceReference: screwPrice.sourceReference,
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
  if (railingGeometry.railingsPresent) {
    if (railingGeometry.railingLengthFeet === null) {
      unresolved.push("Automatic railing length needs the deck attachment and stair-opening facts from the field visit.");
    } else if (!railingSectionLength) {
      unresolved.push("The selected railing product needs its section length.");
    } else if (!railingPrice) {
      unresolved.push("Railing needs an exact Lowe's catalog match or a verified product cost and source.");
    } else {
      const sections = Math.ceil(railingGeometry.railingLengthFeet / railingSectionLength);
      lines.push({
        key: "railing", category: "material", customerDescription: "Railing sections",
        internalDescription: `Calculated from the rectangular deck perimeter (${railingGeometry.attached ? "house-attached" : "freestanding"})${railingGeometry.stairsPresent ? ` less the ${formatted(railingGeometry.stairWidthFeet ?? 0, 2)} ft stair opening` : ""}.`,
        quantity: String(sections), unit: "ea", unitCost: railingPrice.unitCost,
        catalogMaterialId: railingPrice.catalogMaterialId, sourceReference: railingPrice.sourceReference,
        formula: `ceil(${formatted(railingGeometry.railingLengthFeet, 2)} railing ft ÷ ${formatted(railingSectionLength, 2)} ft/section) = ${sections} sections`,
      });
    }
  }

  for (const line of input.plan.additionalLines) {
    if (line.key === "railing") continue;
    const quantity = decimal(line.quantity);
    if (quantity === null || quantity === 0) continue;
    const cost = resolveCost(line.catalogMaterialId, line.unitCost, line.sourceReference, input.catalog, line.unit);
    if (!line.description.trim() || !line.unit.trim()) {
      unresolved.push(`${line.key} needs a description and unit.`);
    } else if (!cost) {
      unresolved.push(`${line.description.trim()} needs an exact catalog match or a verified unit cost and source.`);
    } else {
      lines.push({
        key: line.key, category: line.category, customerDescription: line.description.trim(),
        internalDescription: "Human-entered planned quantity; not inferred from photos and not an engineering decision.",
        quantity: formatted(quantity), unit: line.unit.trim(), unitCost: cost.unitCost,
        catalogMaterialId: cost.catalogMaterialId, sourceReference: cost.sourceReference,
        formula: `Reviewed planned quantity: ${formatted(quantity)} ${line.unit.trim()}`,
      });
    }
  }
  if (!lines.length) unresolved.push("At least one priced true-cost line is required.");

  const bindingValue = {
    visit: { lengthFeet: lengthFeet === null ? null : formatted(lengthFeet), widthFeet: widthFeet === null ? null : formatted(widthFeet) },
    plan: input.plan,
    lines,
  };
  return Object.freeze({
    version: DECK_TAKEOFF_VERSION,
    status: unresolved.length ? "needs_input" : "ready",
    deckLengthFeet: lengthFeet === null ? null : formatted(lengthFeet),
    deckWidthFeet: widthFeet === null ? null : formatted(widthFeet),
    deckAreaSquareFeet: area === null ? null : formatted(area),
    railingLengthFeet: railingGeometry.railingLengthFeet === null ? null : formatted(railingGeometry.railingLengthFeet),
    deckingLayout,
    lines: Object.freeze(lines), unresolved: Object.freeze(unresolved),
    disclosures: Object.freeze([
      "Photos document visible conditions; they do not create dimensions, quantities, structural design, or prices.",
      "Decking quantity uses verified length and width plus the reviewed board width, gap, stock length, and waste; it prefers full-length boards and otherwise requires a picture-frame divider layout.",
      "Railing length uses the verified rectangular deck perimeter, house attachment, and stair opening; product section count remains reviewable.",
      "Framing, footings, stairs, labor, equipment, and disposal remain human-entered build-plan quantities.",
      "Every price is bound to an exact catalog record or a human-entered source reference.",
    ]),
    previewBinding: bind(bindingValue),
  });
}
