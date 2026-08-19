import type { DeckLowesSuggestion } from "@/lib/deck-lowes-product-suggestions";
import type {
  DeckFinishRequest,
  DeckProductSuggestion,
} from "@/lib/deck-curated-product-suggestions";
import {
  DEFAULT_ALUMINUM_RAILING_COMPONENTS,
  DEFAULT_CABLE_RAILING_COMPONENTS,
  DEFAULT_VINYL_RAILING_COMPONENTS,
} from "@/lib/deck-railing-system";

const PRICE_CHECKED_AT = "2026-08-19T00:00:00.000Z";
const COMPOSITE_GROOVED_ESTIMATE = 79.98;
const COMPOSITE_SQUARE_EDGE_ESTIMATE = 90;

const COMPOSITE_DEFAULTS = {
  brown: {
    name: "Whiskey Barrel",
    productLine: "Select Whiskey Barrel",
    groovedUrl:
      "https://www.lowes.com/pd/Trex-Select-1-in-x-6-in-x-16-ft-Whiskey-Barrel-Grooved-Composite-Deck-board/5017400727",
    squareUrl:
      "https://www.lowes.com/pd/Trex-Select-1-in-x-6-in-x-16-ft-Whiskey-Barrel-Square-Composite-Deck-board/5017400701",
    priceBasis: "cached_retail",
  },
  gray: {
    name: "Pebble Grey",
    productLine: "Select Pebble Grey",
    groovedUrl:
      "https://www.lowes.com/pd/Trex-Select-0-82-in-x-5-5-in-5-5-in-x-16-ft-Pebble-Grey-Grooved-Composite-Deck-Board/5013822305",
    squareUrl:
      "https://www.lowes.com/pd/Trex-Select-1-in-x-6-in-x-16-ft-Pebble-Grey-Square-Composite-Deck-board/5013822299",
    priceBasis: "catalog_estimate",
  },
  cedar: {
    name: "Toasted Sand",
    productLine: "Enhance Naturals Toasted Sand",
    groovedUrl:
      "https://www.lowes.com/pd/Trex-Enhance-Naturals-16-ft-Toasted-Sand-Grooved-Composite-Deck-Board/1000763612",
    squareUrl:
      "https://www.lowes.com/pd/Trex-Enhance-Naturals-1-in-x-6-in-x-16-ft-Toasted-Sand-Composite-Deck-board/1000841786",
    priceBasis: "catalog_estimate",
  },
  redwood: {
    name: "Spiced Rum",
    productLine: "Transcend Spiced Rum",
    groovedUrl:
      "https://www.lowes.com/pd/Trex-Transcend-16-ft-Spiced-Rum-Grooved-Composite-Deck-Board/1000715238",
    squareUrl:
      "https://www.lowes.com/pd/Trex-Transcend-16-ft-Spiced-Rum-Composite-Deck-Board/1000714256",
    priceBasis: "catalog_estimate",
  },
  coastal: {
    name: "Island Mist",
    productLine: "Transcend Island Mist",
    groovedUrl:
      "https://www.lowes.com/pd/Trex-Transcend-16-ft-Island-Mist-Grooved-Composite-Deck-Board/1000712902",
    squareUrl:
      "https://www.lowes.com/pd/Trex-Transcend-16-ft-Island-Mist-Composite-Deck-Board/1000713010",
    priceBasis: "catalog_estimate",
  },
} as const;

function estimatingDefault(
  product: DeckLowesSuggestion,
  priceBasis: DeckProductSuggestion["priceBasis"] = "unpriced",
): DeckProductSuggestion {
  return {
    ...product,
    catalogMaterialId: null,
    priceBasis,
    priceCheckedAt:
      product.unitCost && priceBasis === "cached_retail"
        ? PRICE_CHECKED_AT
        : null,
  };
}

export function deckEstimatingProductDefaults(args: Readonly<{
  request: DeckFinishRequest;
  woodScrewCoverageSquareFeetPerPack: number | null;
}>) {
  const products: DeckProductSuggestion[] = [];
  if (args.request.deckingFamily === "composite" && args.request.compositeColor) {
    const selected = COMPOSITE_DEFAULTS[args.request.compositeColor];
    const cachedRetail = selected.priceBasis === "cached_retail";
    products.push(
      estimatingDefault(
        {
          kind: "deck_board_grooved",
          description:
            `Trex ${selected.productLine} 1-in x 6-in x 16-ft grooved composite deck board`,
          unitCost: COMPOSITE_GROOVED_ESTIMATE,
          sourceUrl: selected.groovedUrl,
          stockLengthFeet: 16,
          coverageSquareFeetPerPack: null,
          manufacturer: "Trex",
          productLine: selected.productLine,
          reason: cachedRetail
            ? "Saved public retail estimating price for the matching grooved field board, checked for the North Knoxville Lowe's on August 19, 2026."
            : `McKenzie 16-ft composite-board estimating baseline applied to the exact Trex ${selected.name} grooved SKU. Refresh the public price before presentation.`,
        },
        selected.priceBasis,
      ),
      estimatingDefault(
        {
          kind: "deck_board_square_edge",
          description:
            `Trex ${selected.productLine} 1-in x 6-in x 16-ft square-edge composite deck board`,
          unitCost: COMPOSITE_SQUARE_EDGE_ESTIMATE,
          sourceUrl: selected.squareUrl,
          stockLengthFeet: 16,
          coverageSquareFeetPerPack: null,
          manufacturer: "Trex",
          productLine: selected.productLine,
          reason: cachedRetail
            ? "Saved public retail estimating price for matching picture-frame, divider, and stair-edge stock, checked for the North Knoxville Lowe's on August 19, 2026."
            : `McKenzie 16-ft square-edge estimating baseline applied to the exact Trex ${selected.name} border, divider, and stair-edge SKU. Refresh the public price before presentation.`,
        },
        selected.priceBasis,
      ),
    );
  }
  if (args.request.deckingFamily === "wood") {
    products.push(
      estimatingDefault(
        {
          kind: "deck_board",
          description:
            "Severe Weather 5/4-in x 6-in x 16-ft pressure-treated Southern yellow pine deck board",
          unitCost: 18.98,
          sourceUrl:
            "https://www.lowes.com/pd/Severe-Weather-Pressure-Treated-Deck-Board/3185451",
          stockLengthFeet: 16,
          coverageSquareFeetPerPack: null,
          manufacturer: "Severe Weather",
          productLine: "Pressure Treated",
          reason:
            "McKenzie estimating baseline for the saved Clinton Highway wood-decking SKU. Refresh the public retail price before presentation.",
        },
        "catalog_estimate",
      ),
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
      : args.request.railingFamily === "vinyl"
        ? DEFAULT_VINYL_RAILING_COMPONENTS
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
