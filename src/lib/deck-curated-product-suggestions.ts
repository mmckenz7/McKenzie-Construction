import type { DeckLowesSuggestion } from "@/lib/deck-lowes-product-suggestions";

export type DeckEstimatingPriceBasis =
  | "current_retail"
  | "cached_retail"
  | "catalog_estimate"
  | "live_public_retail"
  | "unpriced";

export type DeckProductSuggestion = DeckLowesSuggestion &
  Readonly<{
    catalogMaterialId: string | null;
    priceBasis: DeckEstimatingPriceBasis;
    priceCheckedAt: string | null;
  }>;

export type CuratedDeckMaterial = Readonly<{
  id: string;
  category: string | null;
  description: string;
  brand: string | null;
  product_line: string | null;
  unit_cost: number | string | null;
  metadata: Record<string, unknown> | null;
}>;

export type CuratedDeckPrice = Readonly<{
  material_catalog_id: string;
  unit_cost: number | string;
  price_type: string;
  last_checked_at: string | null;
  source_reference: string | null;
  confidence: string | null;
  suppliers: { name?: string | null } | null;
}>;

type FinishRequest = Readonly<{
  deckingFamily: "wood" | "composite";
  compositeColor: "brown" | "gray" | "cedar" | "redwood" | "coastal" | null;
  railingFamily: "wood" | "metal" | "cable" | "none";
}>;

const CURRENT_RETAIL_DAYS = 30;

function text(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function exactLowesProductUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["lowes.com", "www.lowes.com"].includes(url.hostname.toLowerCase()) ||
      !url.pathname.startsWith("/pd/")
    ) {
      return null;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function productLengthFeet(description: string) {
  const matches = [
    ...description.matchAll(/(?:^|\s|x|-)(\d+(?:\.\d+)?)\s*(?:ft|foot|feet)(?:\b|-)/gi),
  ];
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function productKind(material: CuratedDeckMaterial) {
  const explicit = text(material.metadata?.deck_product_kind);
  if (["deck_board", "deck_fastener", "railing_section", "railing_level_kit", "railing_level_post", "railing_stair_kit", "railing_stair_lower_post"].includes(explicit)) {
    return explicit as DeckLowesSuggestion["kind"];
  }
  const haystack = `${material.category ?? ""} ${material.description}`.toLowerCase();
  if (/deck.*(?:screw|fastener)|(?:screw|fastener).*deck/.test(haystack)) return "deck_fastener";
  if (/rail|baluster|cable rail/.test(haystack)) return "railing_section";
  if (/deck/.test(haystack) && /board|decking|lumber/.test(haystack)) return "deck_board";
  return null;
}

function finishMatches(material: CuratedDeckMaterial, kind: DeckLowesSuggestion["kind"], request: FinishRequest) {
  const haystack = `${material.category ?? ""} ${material.description} ${material.brand ?? ""} ${material.product_line ?? ""}`.toLowerCase();
  const explicitDecking = text(material.metadata?.decking_family);
  const explicitRailing = text(material.metadata?.railing_family);
  if (kind === "deck_board") {
    if (explicitDecking && explicitDecking !== request.deckingFamily) return false;
    if (request.deckingFamily === "composite") {
      if (!explicitDecking && !/composite|pvc/.test(haystack)) return false;
      const explicitColor = text(material.metadata?.composite_color);
      if (explicitColor && explicitColor !== request.compositeColor) return false;
      return !request.compositeColor || explicitColor === request.compositeColor || haystack.includes(request.compositeColor);
    }
    return !/composite|pvc/.test(haystack) && /pressure.?treated|yellow pine|wood|lumber/.test(haystack);
  }
  if (kind.startsWith("railing_")) {
    if (request.railingFamily === "none") return false;
    if (explicitRailing && explicitRailing !== request.railingFamily) return false;
    if (request.railingFamily === "cable") return /cable/.test(haystack);
    if (request.railingFamily === "metal") return /aluminum|metal|steel/.test(haystack);
    return /wood|pressure.?treated|yellow pine|cedar/.test(haystack) && !/cable|aluminum|metal|steel/.test(haystack);
  }
  return kind === "deck_fastener";
}

function priceRank(price: CuratedDeckPrice) {
  if (price.price_type === "retail") return 0;
  if (price.price_type === "estimated") return 1;
  return 99;
}

function priceBasis(price: CuratedDeckPrice, now: number): DeckEstimatingPriceBasis {
  if (price.price_type === "estimated") return "catalog_estimate";
  const checkedAt = price.last_checked_at ? new Date(price.last_checked_at).getTime() : Number.NaN;
  return Number.isFinite(checkedAt) && now - checkedAt <= CURRENT_RETAIL_DAYS * 86400000
    ? "current_retail"
    : "cached_retail";
}

export function selectCuratedDeckProducts(args: Readonly<{
  materials: readonly CuratedDeckMaterial[];
  prices: readonly CuratedDeckPrice[];
  request: FinishRequest;
  now?: number;
}>) {
  const now = args.now ?? Date.now();
  const pricesByMaterial = new Map<string, CuratedDeckPrice[]>();
  for (const price of args.prices) {
    if (!/lowe/i.test(price.suppliers?.name ?? "")) continue;
    if (!exactLowesProductUrl(price.source_reference)) continue;
    const amount = Number(price.unit_cost);
    if (!(Number.isFinite(amount) && amount > 0) || priceRank(price) === 99) continue;
    const existing = pricesByMaterial.get(price.material_catalog_id) ?? [];
    existing.push(price);
    pricesByMaterial.set(price.material_catalog_id, existing);
  }

  const candidates: DeckProductSuggestion[] = [];
  for (const material of args.materials) {
    const kind = productKind(material);
    if (!kind || !finishMatches(material, kind, args.request)) continue;
    const prices = [...(pricesByMaterial.get(material.id) ?? [])].sort((a, b) => {
      return priceRank(a) - priceRank(b) || new Date(b.last_checked_at ?? 0).getTime() - new Date(a.last_checked_at ?? 0).getTime();
    });
    const selected = prices[0];
    const catalogUrl = exactLowesProductUrl(
      material.metadata?.product_url ?? material.metadata?.source_url,
    );
    const catalogCost = Number(material.unit_cost);
    if (!selected && !(catalogUrl && Number.isFinite(catalogCost) && catalogCost > 0)) continue;
    const manufacturedRailing = kind.startsWith("railing_") && ["metal", "cable"].includes(args.request.railingFamily);
    if (manufacturedRailing && (!material.brand?.trim() || !material.product_line?.trim())) continue;
    candidates.push({
      kind,
      description: material.description.slice(0, 240),
      unitCost: selected ? Number(selected.unit_cost) : catalogCost,
      sourceUrl: selected ? exactLowesProductUrl(selected.source_reference)! : catalogUrl!,
      stockLengthFeet: productLengthFeet(material.description),
      coverageSquareFeetPerPack: null,
      manufacturer: material.brand?.trim() || null,
      productLine: material.product_line?.trim() || null,
      reason: "Approved estimating product from the McKenzie material catalog.",
      catalogMaterialId: material.id,
      priceBasis: selected ? priceBasis(selected, now) : "catalog_estimate",
      priceCheckedAt: selected?.last_checked_at ?? null,
    });
  }

  const limits: Record<DeckLowesSuggestion["kind"], number> = { deck_board: 3, deck_fastener: 1, railing_section: 3, railing_level_kit: 1, railing_level_post: 1, railing_stair_kit: 1, railing_stair_lower_post: 1 };
  const selected: DeckProductSuggestion[] = [];
  for (const kind of ["deck_board", "deck_fastener", "railing_section", "railing_level_kit", "railing_level_post", "railing_stair_kit", "railing_stair_lower_post"] as const) {
    selected.push(
      ...candidates
        .filter((candidate) => candidate.kind === kind)
        .sort((a, b) => Number(b.priceBasis === "current_retail") - Number(a.priceBasis === "current_retail") || (a.unitCost ?? Infinity) - (b.unitCost ?? Infinity))
        .slice(0, limits[kind]),
    );
  }
  return selected;
}

export function enrichLiveDeckProducts(products: readonly DeckLowesSuggestion[]): DeckProductSuggestion[] {
  return products.map((product) => ({
    ...product,
    catalogMaterialId: null,
    priceBasis: product.unitCost ? "live_public_retail" : "unpriced",
    priceCheckedAt: product.unitCost ? new Date().toISOString() : null,
  }));
}

export function mergeDeckProductSuggestions(
  curated: readonly DeckProductSuggestion[],
  live: readonly DeckProductSuggestion[],
) {
  const limits: Record<DeckLowesSuggestion["kind"], number> = { deck_board: 3, deck_fastener: 1, railing_section: 3, railing_level_kit: 1, railing_level_post: 1, railing_stair_kit: 1, railing_stair_lower_post: 1 };
  const merged: DeckProductSuggestion[] = [];
  for (const kind of ["deck_board", "deck_fastener", "railing_section", "railing_level_kit", "railing_level_post", "railing_stair_kit", "railing_stair_lower_post"] as const) {
    const seen = new Set<string>();
    for (const item of [...curated, ...live].filter((candidate) => candidate.kind === kind)) {
      const key = item.sourceUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.filter((candidate) => candidate.kind === kind).length >= limits[kind]) break;
    }
  }
  return merged;
}
