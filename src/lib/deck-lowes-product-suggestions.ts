import "server-only";

export const DECK_LOWES_SUGGESTION_MODEL = "gpt-5.6";
export const DECK_LOWES_SUGGESTION_VERSION = "deck-lowes-defaults-v1";

export type DeckLowesSuggestion = Readonly<{
  kind: "deck_board" | "deck_fastener" | "railing_section";
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
  railingFamily: "wood" | "metal" | "cable" | "none",
) {
  const text = description.toLowerCase();
  if (kind === "deck_board")
    return deckingFamily === "composite"
      ? /composite|trex|timbertech|deckorators/.test(text)
      : /wood|lumber|pressure.?treated|yellow pine|cedar/.test(text) &&
          !/composite|pvc/.test(text);
  if (kind === "railing_section") {
    if (railingFamily === "none") return false;
    if (railingFamily === "cable") return /cable/.test(text);
    if (railingFamily === "metal") return /aluminum|metal|steel/.test(text);
    return /wood|lumber|pressure.?treated|yellow pine|cedar/.test(text) &&
      !/cable|aluminum|metal|steel/.test(text);
  }
  return true;
}

export async function findDeckLowesDefaults(args: Readonly<{
  deckLengthFeet: number;
  deckWidthFeet: number;
  railingLengthFeet: number | null;
  deckingFamily: "wood" | "composite";
  compositeColor: "brown" | "gray" | "cedar" | "redwood" | "coastal" | null;
  railingFamily: "wood" | "metal" | "cable" | "none";
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
      `Decking family is ${args.deckingFamily}${args.deckingFamily === "composite" ? ` with a ${args.compositeColor} color family` : ""}. Return only matching deck-board products and a compatible manufacturer-approved fastening product.`,
      args.railingFamily === "none"
        ? "No railing product is required."
        : `Railing family is ${args.railingFamily}. Return only matching ${args.railingFamily} railing-system products and do not substitute another railing family.`,
      args.railingFamily === "metal" || args.railingFamily === "cable"
        ? "Every manufactured railing choice must be one coherent system from one manufacturer and one named product line. Do not mix rails, posts, brackets, panels, cable, gates, caps, or fasteners across manufacturers or product lines. Return manufacturer and productLine only when the Lowe's product page clearly establishes both; otherwise omit that railing choice."
        : "Do not claim manufactured railing-system compatibility unless the public product page supports it.",
      "Return up to three current matching Lowe's deck-board choices, one compatible deck-fastener choice, and—when required—up to three compatible railing-system choices so a customer can compare combinations.",
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
            maxItems: 7,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", enum: ["deck_board", "deck_fastener", "railing_section"] },
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
    if (!sourceUrl || !["deck_board", "deck_fastener", "railing_section"].includes(String(kind))) continue;
    const limit = kind === "deck_fastener" ? 1 : 3;
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
    const manufacturedRailing = kind === "railing_section" &&
      (args.railingFamily === "metal" || args.railingFamily === "cable");
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
  if (!products.length) throw new DeckLowesSuggestionError("invalid_result");
  return { version: DECK_LOWES_SUGGESTION_VERSION, products } as const;
}
