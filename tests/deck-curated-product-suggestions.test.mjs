import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const source = readFileSync("src/lib/deck-curated-product-suggestions.ts", "utf8");
const transformed = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
  },
}).outputText;
const testModule = { exports: {} };
runInNewContext(transformed, {
  module: testModule,
  exports: testModule.exports,
  require,
  URL,
  Date,
  Map,
  Set,
});
const { selectCuratedDeckProducts, mergeDeckProductSuggestions } = testModule.exports;

const material = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  category: "decking",
  description: "Severe Weather 5/4-in x 6-in x 16-ft pressure-treated deck board",
  brand: "Severe Weather",
  product_line: "Pressure Treated",
  unit_cost: 0,
  metadata: { deck_product_kind: "deck_board", decking_family: "wood" },
  ...overrides,
});
const price = (overrides = {}) => ({
  material_catalog_id: "11111111-1111-4111-8111-111111111111",
  unit_cost: 18.98,
  price_type: "retail",
  last_checked_at: "2026-01-01T00:00:00.000Z",
  source_reference: "https://www.lowes.com/pd/example/5012345678?store=123",
  confidence: "verified",
  suppliers: { name: "Lowe's" },
  ...overrides,
});
const request = { deckingFamily: "wood", compositeColor: null, railingFamily: "none" };

test("uses a positive old retail price as a cached estimating baseline", () => {
  const products = selectCuratedDeckProducts({
    materials: [material()],
    prices: [price()],
    request,
    now: new Date("2026-08-18T00:00:00.000Z").getTime(),
  });
  assert.equal(products.length, 1);
  assert.equal(products[0].unitCost, 18.98);
  assert.equal(products[0].priceBasis, "cached_retail");
  assert.equal(products[0].sourceUrl, "https://www.lowes.com/pd/example/5012345678");
});

test("does not use contractor, quoted, or promotional discounts as the estimate baseline", () => {
  const products = selectCuratedDeckProducts({
    materials: [material()],
    prices: [
      price({ price_type: "contract", unit_cost: 12 }),
      price({ price_type: "quoted", unit_cost: 10 }),
      price({ price_type: "promotional", unit_cost: 8 }),
    ],
    request,
  });
  assert.equal(products.length, 0);
});

test("requires one named manufacturer and product line for metal railing choices", () => {
  const railingMaterial = material({
    id: "22222222-2222-4222-8222-222222222222",
    category: "railing",
    description: "Black aluminum deck rail section",
    brand: "Deckorators",
    product_line: "Contemporary",
    metadata: { deck_product_kind: "railing_section", railing_family: "metal" },
  });
  const railingPrice = price({
    material_catalog_id: railingMaterial.id,
    last_checked_at: "2026-08-17T00:00:00.000Z",
  });
  const products = selectCuratedDeckProducts({
    materials: [railingMaterial, { ...railingMaterial, id: "33333333-3333-4333-8333-333333333333", product_line: null }],
    prices: [railingPrice, { ...railingPrice, material_catalog_id: "33333333-3333-4333-8333-333333333333" }],
    request: { deckingFamily: "wood", compositeColor: null, railingFamily: "metal" },
    now: new Date("2026-08-18T00:00:00.000Z").getTime(),
  });
  assert.equal(products.length, 1);
  assert.equal(products[0].manufacturer, "Deckorators");
  assert.equal(products[0].productLine, "Contemporary");
});

test("keeps curated matches ahead of live lookup results", () => {
  const curated = [{ kind: "deck_board", sourceUrl: "https://www.lowes.com/pd/curated/1" }];
  const live = [{ kind: "deck_board", sourceUrl: "https://www.lowes.com/pd/live/2" }];
  const merged = mergeDeckProductSuggestions(curated, live);
  assert.equal(merged[0].sourceUrl, curated[0].sourceUrl);
});
