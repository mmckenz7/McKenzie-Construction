import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const source = readFileSync("src/lib/deck-estimating-product-defaults.ts", "utf8");
const transformed = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const aluminum = [
  { kind: "railing_level_kit", description: "level", unitCost: null, sourceUrl: "https://www.lowes.com/pd/level/1", stockLengthFeet: 8, manufacturer: "Deckorators", productLine: "Contemporary" },
  { kind: "railing_level_post", description: "post", unitCost: null, sourceUrl: "https://www.lowes.com/pd/post/1", stockLengthFeet: null, manufacturer: "Deckorators", productLine: "Contemporary" },
  { kind: "railing_stair_kit", description: "stair", unitCost: null, sourceUrl: "https://www.lowes.com/pd/stair/1", stockLengthFeet: 6, manufacturer: "Deckorators", productLine: "Contemporary" },
  { kind: "railing_stair_lower_post", description: "lower", unitCost: null, sourceUrl: "https://www.lowes.com/pd/lower/1", stockLengthFeet: null, manufacturer: "Deckorators", productLine: "Contemporary" },
];
const testModule = { exports: {} };
runInNewContext(transformed, {
  module: testModule,
  exports: testModule.exports,
  require: (id) => id === "@/lib/deck-railing-system"
    ? { DEFAULT_ALUMINUM_RAILING_COMPONENTS: aluminum, DEFAULT_CABLE_RAILING_COMPONENTS: [] }
    : require(id),
});
const { deckEstimatingProductDefaults } = testModule.exports;

test("wood defaults include a traceable board and cached screw price with calculated coverage", () => {
  const products = deckEstimatingProductDefaults({
    request: { deckingFamily: "wood", compositeColor: null, railingFamily: "none" },
    woodScrewCoverageSquareFeetPerPack: 190,
  });
  const board = products.find((item) => item.kind === "deck_board");
  const screws = products.find((item) => item.kind === "deck_fastener");
  assert.equal(board.unitCost, null);
  assert.equal(board.stockLengthFeet, 16);
  assert.equal(screws.unitCost, 25.8);
  assert.equal(screws.coverageSquareFeetPerPack, 190);
  assert.equal(screws.priceBasis, "cached_retail");
});

test("brown composite defaults keep matching grooved and square-edge boards with estimating prices", () => {
  const products = deckEstimatingProductDefaults({
    request: { deckingFamily: "composite", compositeColor: "brown", railingFamily: "none" },
    woodScrewCoverageSquareFeetPerPack: null,
  });
  const grooved = products.find((item) => item.kind === "deck_board_grooved");
  const square = products.find((item) => item.kind === "deck_board_square_edge");
  assert.equal(grooved.unitCost, 79.98);
  assert.equal(square.unitCost, 90);
  assert.equal(grooved.manufacturer, square.manufacturer);
  assert.equal(grooved.productLine, square.productLine);
  assert.match(grooved.sourceUrl, /5017400727$/);
  assert.match(square.sourceUrl, /5017400701$/);
  assert.equal(grooved.priceBasis, "cached_retail");
  assert.equal(square.priceBasis, "cached_retail");
});

test("aluminum defaults preserve one compatible product line and only claim observed prices", () => {
  const products = deckEstimatingProductDefaults({
    request: { deckingFamily: "composite", compositeColor: "gray", railingFamily: "metal" },
    woodScrewCoverageSquareFeetPerPack: null,
  });
  assert.equal(products.length, 4);
  assert.ok(products.every((item) => item.manufacturer === "Deckorators"));
  assert.ok(products.every((item) => item.productLine === "Contemporary"));
  assert.equal(products.find((item) => item.kind === "railing_level_kit").unitCost, 374.65);
  assert.equal(products.find((item) => item.kind === "railing_stair_kit").unitCost, null);
});
