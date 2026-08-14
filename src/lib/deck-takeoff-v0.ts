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

function resolveCost(
  catalogId: string | null,
  enteredCost: string,
  enteredSource: string,
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
  const source = enteredSource.trim();
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
    } else if (stockLength < lengthFeet) {
      unresolved.push("Board stock length must span the verified deck length; splice design is not automated.");
    } else if (!boardPrice) {
      unresolved.push("Deck boards need an exact catalog match or a verified unit cost and source.");
    } else {
      const rows = Math.ceil((widthFeet * 12) / (boardWidth + boardGap));
      const pieces = Math.ceil(rows * (1 + waste / 100));
      lines.push({
        key: "decking",
        category: "material",
        customerDescription: "Decking boards",
        internalDescription: `${rows} board rows across ${formatted(widthFeet, 2)} ft; ${formatted(waste, 2)}% reviewed waste. Stock length spans the ${formatted(lengthFeet, 2)} ft run.`,
        quantity: String(pieces), unit: "ea", unitCost: boardPrice.unitCost,
        catalogMaterialId: boardPrice.catalogMaterialId,
        sourceReference: boardPrice.sourceReference,
        formula: `ceil(ceil(${formatted(widthFeet, 2)} ft × 12 ÷ (${formatted(boardWidth, 3)} in + ${formatted(boardGap, 3)} in)) × (1 + ${formatted(waste, 2)}%)) = ${pieces} boards`,
      });
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

  for (const line of input.plan.additionalLines) {
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
    lines: Object.freeze(lines), unresolved: Object.freeze(unresolved),
    disclosures: Object.freeze([
      "Photos document visible conditions; they do not create dimensions, quantities, structural design, or prices.",
      "Decking quantity uses verified length and width plus the reviewed board width, gap, stock length, and waste.",
      "Framing, footings, stairs, railing, labor, equipment, and disposal remain human-entered build-plan quantities.",
      "Every price is bound to an exact catalog record or a human-entered source reference.",
    ]),
    previewBinding: bind(bindingValue),
  });
}
