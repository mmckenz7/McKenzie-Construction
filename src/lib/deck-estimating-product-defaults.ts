import type { DeckLowesSuggestion } from "@/lib/deck-lowes-product-suggestions";
import type {
  DeckFinishRequest,
  DeckProductSuggestion,
} from "@/lib/deck-curated-product-suggestions";
import {
  DEFAULT_ALUMINUM_RAILING_COMPONENTS,
  DEFAULT_CABLE_RAILING_COMPONENTS,
} from "@/lib/deck-railing-system";

const PRICE_CHECKED_AT = "2026-08-18T00:00:00.000Z";

function estimatingDefault(
  product: DeckLowesSuggestion,
  priceBasis: DeckProductSuggestion["priceBasis"] = "unpriced",
): DeckProductSuggestion {
  return {
    ...product,
    catalogMaterialId: null,
    priceBasis,
    priceCheckedAt: product.unitCost ? PRICE_CHECKED_AT : null,
  };
}

export function deckEstimatingProductDefaults(args: Readonly<{
  request: DeckFinishRequest;
  woodScrewCoverageSquareFeetPerPack: number | null;
}>) {
  const products: DeckProductSuggestion[] = [];
  if (args.request.deckingFamily === "wood") {
    products.push(
      estimatingDefault({
        kind: "deck_board",
        description:
          "Severe Weather 5/4-in x 6-in x 16-ft pressure-treated Southern yellow pine deck board",
        unitCost: null,
        sourceUrl:
          "https://www.lowes.com/pd/Severe-Weather-Pressure-Treated-Deck-Board/3185451",
        stockLengthFeet: 16,
        coverageSquareFeetPerPack: null,
        manufacturer: "Severe Weather",
        productLine: "Pressure Treated",
        reason:
          "Saved McKenzie wood-decking default. Confirm the Clinton Highway retail price before presenting the estimate.",
      }),
      estimatingDefault(
        {
          kind: "deck_fastener",
          description:
            "Deck Plus #8 x 2-in exterior wood-to-wood deck screws, 625-count box",
          unitCost: 25.8,
          sourceUrl:
            "https://www.lowes.com/pd/Deck-Plus-8-x-2-in-Wood-to-wood-Deck-Screws-625-Per-Box/5014070805",
          stockLengthFeet: null,
          coverageSquareFeetPerPack:
            args.woodScrewCoverageSquareFeetPerPack,
          manufacturer: "Deck Plus",
          productLine: "Exterior Wood Deck Screws",
          reason:
            "Saved McKenzie wood-deck fastener default with a public retail estimating price.",
        },
        "cached_retail",
      ),
    );
  }
  const manufactured =
    args.request.railingFamily === "metal"
      ? DEFAULT_ALUMINUM_RAILING_COMPONENTS
      : args.request.railingFamily === "cable"
        ? DEFAULT_CABLE_RAILING_COMPONENTS
        : [];
  for (const product of manufactured) {
    const knownPrice =
      args.request.railingFamily === "metal"
        ? product.kind === "railing_level_kit"
          ? 374.65
          : product.kind === "railing_level_post"
            ? 99.04
            : product.kind === "railing_stair_lower_post"
              ? 114.13
              : null
        : null;
    products.push(
      estimatingDefault(
        {
          ...product,
          kind: product.kind as DeckLowesSuggestion["kind"],
          unitCost: knownPrice,
          coverageSquareFeetPerPack: null,
          reason: `Saved McKenzie ${product.manufacturer} ${product.productLine} system component.`,
        },
        knownPrice ? "cached_retail" : "unpriced",
      ),
    );
  }
  return products;
}
