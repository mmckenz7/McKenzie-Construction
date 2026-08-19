export const DECK_FINISH_DRAFT_VERSION = "custom-deck-finish-draft-v2" as const;

export const DECK_FINISH_LINE_KEYS = [
  "custom_decking",
  "custom_decking_square_edge",
  "custom_railing",
] as const;

export type DeckFinishLineKey = (typeof DECK_FINISH_LINE_KEYS)[number];

export type DeckFinishDraftLine = Readonly<{
  key: DeckFinishLineKey;
  description: string;
  quantity: number | null;
  unit: string;
  unitCost: number | null;
  sourceReference: string;
  catalogMaterialId: string | null;
}>;

export type DeckFinishDraftSnapshot = Readonly<{
  version: typeof DECK_FINISH_DRAFT_VERSION;
  deckingFamily: "wood" | "composite";
  compositeColor: "brown" | "gray" | "cedar" | "redwood" | "coastal" | null;
  railingFamily: "wood" | "metal" | "vinyl" | "cable" | "none";
  stairRailSides: 1 | 2;
  woodRailingRate: number | null;
  board: Readonly<{
    actualWidthInches: number;
    gapInches: number;
    stockLengthFeet: number | null;
    wastePercent: number;
  }>;
  lines: readonly DeckFinishDraftLine[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactKeys(record: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(record).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError("The saved finish selection contains invalid text.");
  return value.trim();
}

function optionalNumber(value: unknown, maximum: number) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum)
    throw new TypeError("The saved finish selection contains an invalid number.");
  return value;
}

function requiredPositive(value: unknown, maximum: number) {
  const parsed = optionalNumber(value, maximum);
  if (parsed === null || parsed <= 0) throw new TypeError("The saved finish selection contains an invalid measurement.");
  return parsed;
}

export function parseDeckFinishDraftSnapshot(value: unknown): DeckFinishDraftSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("The saved finish selection is invalid.");
  const source = value as Record<string, unknown>;
  if (!exactKeys(source, ["version", "deckingFamily", "compositeColor", "railingFamily", "stairRailSides", "woodRailingRate", "board", "lines"]))
    throw new TypeError("The saved finish selection contains unsupported fields.");
  const legacyV1 = source.version === "custom-deck-finish-draft-v1";
  if (!legacyV1 && source.version !== DECK_FINISH_DRAFT_VERSION)
    throw new TypeError("The saved finish selection version is unsupported.");
  if (source.deckingFamily !== "wood" && source.deckingFamily !== "composite")
    throw new TypeError("The saved decking family is invalid.");
  const compositeColor = source.compositeColor;
  if (compositeColor !== null && !["brown", "gray", "cedar", "redwood", "coastal"].includes(String(compositeColor)))
    throw new TypeError("The saved composite color is invalid.");
  if (!["wood", "metal", "vinyl", "cable", "none"].includes(String(source.railingFamily)))
    throw new TypeError("The saved railing family is invalid.");
  if (source.stairRailSides !== 1 && source.stairRailSides !== 2)
    throw new TypeError("The saved stair railing selection is invalid.");
  if (!source.board || typeof source.board !== "object" || Array.isArray(source.board))
    throw new TypeError("The saved board settings are invalid.");
  const board = source.board as Record<string, unknown>;
  if (!exactKeys(board, ["actualWidthInches", "gapInches", "stockLengthFeet", "wastePercent"]))
    throw new TypeError("The saved board settings contain unsupported fields.");
  if (
    !Array.isArray(source.lines) ||
    (legacyV1
      ? source.lines.length !== 2
      : source.lines.length !== DECK_FINISH_LINE_KEYS.length)
  )
    throw new TypeError("The saved finish lines are invalid.");
  const lines = source.lines.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("The saved finish line is invalid.");
    const line = value as Record<string, unknown>;
    if (!exactKeys(line, ["key", "description", "quantity", "unit", "unitCost", "sourceReference", "catalogMaterialId"]))
      throw new TypeError("The saved finish line contains unsupported fields.");
    if (!DECK_FINISH_LINE_KEYS.includes(line.key as DeckFinishLineKey))
      throw new TypeError("The saved finish line key is invalid.");
    const catalogMaterialId = line.catalogMaterialId;
    if (catalogMaterialId !== null && (typeof catalogMaterialId !== "string" || !UUID.test(catalogMaterialId)))
      throw new TypeError("The saved catalog material is invalid.");
    return Object.freeze({
      key: line.key as DeckFinishLineKey,
      description: boundedText(line.description, 2000),
      quantity: optionalNumber(line.quantity, 1_000_000),
      unit: boundedText(line.unit, 40),
      unitCost: optionalNumber(line.unitCost, 1_000_000),
      sourceReference: boundedText(line.sourceReference, 1000),
      catalogMaterialId,
    });
  });
  const expectedKeys = legacyV1
    ? ["custom_decking", "custom_railing"]
    : [...DECK_FINISH_LINE_KEYS];
  if (
    new Set(lines.map((line) => line.key)).size !== expectedKeys.length ||
    expectedKeys.some((key) => !lines.some((line) => line.key === key))
  )
    throw new TypeError("The saved finish lines are incomplete.");
  const normalizedLines = legacyV1
    ? [
        lines.find((line) => line.key === "custom_decking")!,
        Object.freeze({
          key: "custom_decking_square_edge" as const,
          description: "Square-edge picture-frame and divider boards",
          quantity: null,
          unit: "ea",
          unitCost: null,
          sourceReference: "",
          catalogMaterialId: null,
        }),
        lines.find((line) => line.key === "custom_railing")!,
      ]
    : lines;
  return Object.freeze({
    version: DECK_FINISH_DRAFT_VERSION,
    deckingFamily: source.deckingFamily,
    compositeColor: compositeColor as DeckFinishDraftSnapshot["compositeColor"],
    railingFamily: source.railingFamily as DeckFinishDraftSnapshot["railingFamily"],
    stairRailSides: source.stairRailSides,
    woodRailingRate: optionalNumber(source.woodRailingRate, 100_000),
    board: Object.freeze({
      actualWidthInches: requiredPositive(board.actualWidthInches, 100),
      gapInches: optionalNumber(board.gapInches, 12) ?? 0,
      stockLengthFeet: optionalNumber(board.stockLengthFeet, 1000),
      wastePercent: optionalNumber(board.wastePercent, 100) ?? 0,
    }),
    lines: Object.freeze(normalizedLines),
  });
}
