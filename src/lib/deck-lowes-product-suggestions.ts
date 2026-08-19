import "server-only";

import type { DeckRailingProductRole } from "@/lib/deck-railing-system";

export const DECK_LOWES_SUGGESTION_MODEL = "gpt-5.6";
export const DECK_LOWES_SUGGESTION_VERSION = "deck-lowes-defaults-v1";

export type DeckBoardProductRole =
  | "deck_board"
  | "deck_board_grooved"
  | "deck_board_square_edge";

export type DeckLowesSuggestion = Readonly<{
  kind: DeckBoardProductRole | "deck_fastener" | DeckRailingProductRole;
  description: string;
  unitCost: number | null;
  sourceUrl: string;
  stockLengthFeet: number | null;
  coverageSquareFeetPerPack: number | null;
  manufacturer: string | null;
  productLine: string | null;
  reason: string;
}>;

export class DeckLowesSuggestionError extends Error {
  constructor(public readonly code: "missing_config" | "provider" | "invalid_result") {
    super("Lowe's product suggestions are unavailable.");
  }
}

function outputText(value: Record<string, unknown>) {
  if (typeof value.output_text === "string") return value.output_text;
  for (const item of Array.isArray(value.output) ? value.output : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[] : []) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      if (typeof (part as Record<string, unknown>).text === "string") {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  throw new DeckLowesSuggestionError("invalid_result");
}

function exactLowesProductUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["lowes.com", "www.lowes.com"].includes(url.hostname.toLowerCase()) || !url.pathname.startsWith("/pd/")) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function matchesRequestedFinish(
  kind: DeckLowesSuggestion["kind"],
  description: string,
  deckingFamily: "wood" | "composite",
  railingFamily: "wood" | "metal" | "vinyl" | "cable" | "none",
) {
  const text = description.toLowerCase();
  if (kind === "deck_board" || kind === "deck_board_grooved" || kind === "deck_board_square_edge")
    return deckingFamily === "composite"
      ? /composite|trex|timbertech|deckorators/.test(text)
      : /wood|lumber|pressure.?treated|yellow pine|cedar/.test(text) &&
          !/composite|pvc/.test(text);
  if (kind.startsWith("railing_")) {
    if (railingFamily === "none") return false;
    if (railingFamily === "cable") return /cable/.test(text);
    if (railingFamily === "metal") return /aluminum|metal|steel/.test(text);
    if (railingFamily === "vinyl") return /vinyl|pvc/.test(text) && !/cable/.test(text);
    return /wood|lumber|pressure.?treated|yellow pine|cedar/.test(text) &&
      !/cable|aluminum|metal|steel/.test(text);
  }
  return true;
}

export async function findDeckLowesDefaults(args: Readonly<{
  deckLengthFeet: number;
  deckWidthFeet: number;
  railingLengthFeet: number | null;
  stairsPresent: boolean | null;
  deckingFamily: "wood" | "composite";
  compositeColor: "brown" | "gray" | "cedar" | "redwood" | "coastal" | null;
  railingFamily: "wood" | "metal" | "vinyl" | "cable" | "none";
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
}>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new DeckLowesSuggestionError("missing_config");
  const body = {
    model: DECK_LOWES_SUGGESTION_MODEL,
    reasoning: { effort: "low" },
    tools: [{
      type: "web_search",
      filters: { allowed_domains: ["lowes.com"] },
      user_location: { type: "approximate", country: "US", region: "Tennessee", city: "Knoxville" },
      search_context_size: "medium",
    }],
    tool_choice: "auto",
    store: false,
    input: [
      `Find practical Lowe's finish products for a ${args.deckingFamily === "wood" ? "pressure-treated wood" : `${args.compositeColor ?? "brown"} composite`} replacement deck in Knoxville, Tennessee.`,
      `Verified rectangular deck: ${args.deckLengthFeet} ft board run by ${args.deckWidthFeet} ft wide.`,
      args.railingLengthFeet === null ? "Railing footage is not yet resolved." : `Calculated railing footage: ${args.railingLengthFeet} linear ft.`,
      args.stairsPresent === true
        ? "The approved shape includes stairs, so include the compatible stair rail kit and lower stair post kit."
        : args.stairsPresent === false
          ? "The approved shape has no stairs; do not return stair railing components."
          : "Stair applicability is unresolved; do not claim the railing package is complete.",
      `Decking family is ${args.deckingFamily}${args.deckingFamily === "composite" ? ` with a ${args.compositeColor} color family` : ""}. Return only matching deck-board products and compatible manufacturer-approved fastening products.`,
      args.deckingFamily === "composite"
        ? "Return one grooved field board as deck_board_grooved and the matching square-edge border/stair/divider board as deck_board_square_edge. They must have the same manufacturer, product line, color, width, thickness, and stock length. Do not substitute a generic deck_board for either role."
        : "Return the pressure-treated wood board as deck_board. Wood boards do not need separate grooved and square-edge roles.",
      args.railingFamily === "none"
        ? "No railing product is required."
        : `Railing family is ${args.railingFamily}. Return only matching ${args.railingFamily} railing-system products and do not substitute another railing family.`,
      args.railingFamily === "metal"
        ? "Use Deckorators Contemporary 36-in matte-black aluminum as the single default system. Return its level rail kit as railing_level_kit, compatible 39-in post kit as railing_level_post, and—when stairs exist—its 6-ft stair rail kit as railing_stair_kit and compatible 48-in lower stair post kit as railing_stair_lower_post. Treat included brackets, bracket hardware, rail supports, post caps, and post skirts as included components rather than separate products. Do not mix another manufacturer or product line."
        : args.railingFamily === "vinyl"
          ? "Return one complete compatible vinyl railing system from a single manufacturer and product line: level rail kit, compatible post/cap/trim kit, and—when stairs exist—compatible stair rail and stair post kits. Do not mix manufacturers or product lines."
        : args.railingFamily === "cable"
          ? "Use Deckorators Contemporary Cable 36-in textured-black as the single default system. Return its 8-ft level top rail kit as railing_level_kit, 39-in line post as railing_level_post, 39-in end post as railing_cable_end_post, 10-ft cable-with-hardware pack as railing_cable_pack, and—when stairs exist—its 8-ft stair top rail kit as railing_stair_kit and compatible lower stair post as railing_stair_lower_post. Do not mix another manufacturer, product line, finish, or height."
        : "Do not claim manufactured railing-system compatibility unless the public product page supports it.",
      "Return the required matching Lowe's deck-board profile roles, one compatible field fastening product, and all required default railing-system component roles. Wood railing is priced locally per linear foot and does not require a railing product.",
      "Every manufactured railing package must remain one coherent system from one manufacturer and one named product line.",
      "Do not mix rails, posts, brackets, panels, cable, gates, caps, or fasteners across product lines.",
      "For deck boards, prefer the shortest sold stock length that spans the full board run without a joint. If no sold length spans it, prefer a length that reaches at least half the run for a perimeter picture-frame plus center-divider layout.",
      "Use only exact lowes.com /pd/ product pages. Copy a public price only when the page clearly supports it; otherwise return null. Never invent availability, price, dimensions, package coverage, compatibility, or manufacturer guidance.",
      "Return JSON only with the requested schema.",
    ].join("\n"),
    text: { format: {
      type: "json_schema",
      name: "deck_lowes_default_products",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          products: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", enum: ["deck_board", "deck_board_grooved", "deck_board_square_edge", "deck_fastener", "railing_section", "railing_level_kit", "railing_level_post", "railing_stair_kit", "railing_stair_lower_post", "railing_cable_pack", "railing_cable_end_post"] },
                description: { type: "string", minLength: 1, maxLength: 240 },
                unitCost: { type: ["number", "null"], minimum: 0 },
                sourceUrl: { type: "string", minLength: 1, maxLength: 1000 },
                stockLengthFeet: { type: ["number", "null"], minimum: 0 },
                coverageSquareFeetPerPack: { type: ["number", "null"], minimum: 0 },
                manufacturer: { type: ["string", "null"], minLength: 1, maxLength: 120 },
                productLine: { type: ["string", "null"], minLength: 1, maxLength: 120 },
                reason: { type: "string", minLength: 1, maxLength: 500 },
              },
              required: ["kind", "description", "unitCost", "sourceUrl", "stockLengthFeet", "coverageSquareFeetPerPack", "manufacturer", "productLine", "reason"],
            },
          },
        },
        required: ["products"],
      },
    } },
  };
  let response: Response;
  try {
    response = await (args.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new DeckLowesSuggestionError("provider");
  }
  if (!response.ok) throw new DeckLowesSuggestionError("provider");
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText(await response.json() as Record<string, unknown>));
  } catch (error) {
    if (error instanceof DeckLowesSuggestionError) throw error;
    throw new DeckLowesSuggestionError("invalid_result");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as Record<string, unknown>).products)) {
    throw new DeckLowesSuggestionError("invalid_result");
  }
  const counts = new Map<string, number>();
  const products: DeckLowesSuggestion[] = [];
  for (const raw of (parsed as { products: unknown[] }).products) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const kind = item.kind;
    const sourceUrl = exactLowesProductUrl(item.sourceUrl);
    if (!sourceUrl || !["deck_board", "deck_board_grooved", "deck_board_square_edge", "deck_fastener", "railing_section", "railing_level_kit", "railing_level_post", "railing_stair_kit", "railing_stair_lower_post", "railing_cable_pack", "railing_cable_end_post"].includes(String(kind))) continue;
    const limit = kind === "deck_board" || kind === "railing_section" ? 3 : 1;
    if ((counts.get(String(kind)) ?? 0) >= limit) continue;
    if (typeof item.description !== "string" || typeof item.reason !== "string") continue;
    if (!matchesRequestedFinish(
      kind as DeckLowesSuggestion["kind"],
      item.description,
      args.deckingFamily,
      args.railingFamily,
    )) continue;
    const manufacturer = typeof item.manufacturer === "string"
      ? item.manufacturer.trim().slice(0, 120)
      : null;
    const productLine = typeof item.productLine === "string"
      ? item.productLine.trim().slice(0, 120)
      : null;
    const manufacturedRailing = String(kind).startsWith("railing_") &&
      (args.railingFamily === "metal" || args.railingFamily === "vinyl" || args.railingFamily === "cable");
    if (manufacturedRailing && (!manufacturer || !productLine)) continue;
    const unitCost = item.unitCost === null ? null : Number(item.unitCost);
    const stockLengthFeet = item.stockLengthFeet === null ? null : Number(item.stockLengthFeet);
    const coverageSquareFeetPerPack = item.coverageSquareFeetPerPack === null ? null : Number(item.coverageSquareFeetPerPack);
    if ((unitCost !== null && (!Number.isFinite(unitCost) || unitCost <= 0))
      || (stockLengthFeet !== null && (!Number.isFinite(stockLengthFeet) || stockLengthFeet <= 0))
      || (coverageSquareFeetPerPack !== null && (!Number.isFinite(coverageSquareFeetPerPack) || coverageSquareFeetPerPack <= 0))) continue;
    counts.set(String(kind), (counts.get(String(kind)) ?? 0) + 1);
    products.push({
      kind: kind as DeckLowesSuggestion["kind"],
      description: item.description.slice(0, 240),
      unitCost,
      sourceUrl,
      stockLengthFeet,
      coverageSquareFeetPerPack,
      manufacturer,
      productLine,
      reason: item.reason.slice(0, 500),
    });
  }
  if (args.deckingFamily === "composite") {
    const grooved = products.find(
      (product) => product.kind === "deck_board_grooved",
    );
    const squareEdge = products.find(
      (product) => product.kind === "deck_board_square_edge",
    );
    const sameSystem =
      grooved &&
      squareEdge &&
      grooved.manufacturer?.toLowerCase() ===
        squareEdge.manufacturer?.toLowerCase() &&
      grooved.productLine?.toLowerCase() ===
        squareEdge.productLine?.toLowerCase() &&
      grooved.stockLengthFeet === squareEdge.stockLengthFeet;
    if (!sameSystem) {
      for (let index = products.length - 1; index >= 0; index -= 1) {
        if (
          products[index].kind === "deck_board_grooved" ||
          products[index].kind === "deck_board_square_edge"
        )
          products.splice(index, 1);
      }
    }
  }
  if (!products.length) throw new DeckLowesSuggestionError("invalid_result");
  return { version: DECK_LOWES_SUGGESTION_VERSION, products } as const;
}
