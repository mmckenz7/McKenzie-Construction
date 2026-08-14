import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeckTakeoffPreview,
  deckFieldDimensions,
  deckRailingGeometry,
  deckStairPlacementIssue,
  measurementFeet,
  optimizeDeckBoardLayout,
} from "../src/lib/deck-takeoff-v0.ts";

const items = [{
  itemKey: "full_deck_yard",
  observation: { measurements: {
    length: { value: "12 ft 0 in", unit: "ft + in" },
    width: { value: "14 ft 0 in", unit: "ft + in" },
  } },
}];

const basePlan = {
  boardRunDirection: "along_length",
  stairEdge: "right",
  stairPosition: "end",
  stairPlacementConfirmed: true,
  boardActualWidthInches: "5.5",
  boardGapInches: "0.125",
  boardStockLengthFeet: "12",
  boardWastePercent: "10",
  boardCatalogMaterialId: null,
  boardUnitCost: "9.50",
  boardSourceReference: "https://www.lowes.com/example-deck-board",
  screwCoverageSquareFeetPerPack: "100",
  screwCatalogMaterialId: "71000000-0000-4000-8000-000000000001",
  screwPackUnitCost: "",
  screwSourceReference: "",
  railingSectionLengthFeet: "",
  railingCatalogMaterialId: null,
  railingUnitCost: "",
  railingSourceReference: "",
  additionalLines: [{
    key: "labor", category: "labor", description: "Deck installation labor",
    quantity: "40", unit: "hr", unitCost: "32.50", catalogMaterialId: null,
    sourceReference: "McKenzie reviewed labor burden 2026-08-14",
  }],
};

const catalog = new Map([["71000000-0000-4000-8000-000000000001", {
  materialId: "71000000-0000-4000-8000-000000000001",
  description: "Deck screws",
  unit: "PACK",
  unitCost: "29.98",
  sourceReference: "catalog:71000000-0000-4000-8000-000000000001",
}]]);

test("normalizes field measurements without reading dimensions from photos", () => {
  assert.equal(measurementFeet("12 ft 6 in", "ft + in"), 12.5);
  assert.equal(measurementFeet("18", "in"), 1.5);
  assert.deepEqual(deckFieldDimensions(items), { lengthFeet: 12, widthFeet: 14 });
});

test("creates deterministic decking, fastener, and human planned-cost lines", () => {
  const preview = buildDeckTakeoffPreview({ items, plan: basePlan, catalog });
  assert.equal(preview.status, "ready");
  assert.equal(preview.deckAreaSquareFeet, "168");
  assert.equal(preview.lines[0].key, "decking");
  assert.equal(preview.lines[0].quantity, "33");
  assert.equal(preview.lines[1].quantity, "2");
  assert.equal(preview.lines[1].unitCost, "29.98");
  assert.equal(preview.lines[2].category, "labor");
  assert.match(preview.lines[0].formula, /ceil/);
  assert.match(preview.previewBinding, /^deck-reviewed-takeoff-v1:/);
});

test("does not guess when stock is too short or price evidence is missing", () => {
  const preview = buildDeckTakeoffPreview({
    items,
    catalog: new Map(),
    plan: { ...basePlan, boardStockLengthFeet: "5", screwCatalogMaterialId: null },
  });
  assert.equal(preview.status, "needs_input");
  assert.ok(preview.unresolved.some((value) => value.includes("too short")));
  assert.ok(preview.unresolved.some((value) => value.includes("Fasteners need")));
});

test("optimizes board lengths to seamless runs before a picture-frame divider", () => {
  assert.equal(optimizeDeckBoardLayout({
    runLengthFeet: 12, fieldWidthFeet: 14, boardActualWidthInches: 5.5,
    boardGapInches: 0.125, stockLengthFeet: 12, wastePercent: 10,
  })?.layout, "seamless");
  assert.equal(optimizeDeckBoardLayout({
    runLengthFeet: 18, fieldWidthFeet: 14, boardActualWidthInches: 5.5,
    boardGapInches: 0.125, stockLengthFeet: 12, wastePercent: 10,
  })?.layout, "picture_frame_divider");
  assert.equal(optimizeDeckBoardLayout({
    runLengthFeet: 30, fieldWidthFeet: 14, boardActualWidthInches: 5.5,
    boardGapInches: 0.125, stockLengthFeet: 12, wastePercent: 10,
  }), null);
});

test("calculates railing from verified deck edges and the stair opening", () => {
  const railingItems = [
    ...items,
    { itemKey: "house_ledger", observation: { conditionStatus: "applies" } },
    { itemKey: "guards_railings", observation: { conditionStatus: "applies" } },
    { itemKey: "stairs_landings", observation: {
      conditionStatus: "applies",
      measurements: { stair_width: { value: "36", unit: "in" } },
    } },
  ];
  assert.equal(deckRailingGeometry(railingItems).railingLengthFeet, 37);
  const preview = buildDeckTakeoffPreview({
    items: railingItems,
    catalog,
    plan: {
      ...basePlan,
      railingSectionLengthFeet: "6",
      railingUnitCost: "149",
      railingSourceReference: "https://www.lowes.com/pd/example-railing",
    },
  });
  assert.equal(preview.railingLengthFeet, "37");
  assert.equal(preview.lines.find((line) => line.key === "railing")?.quantity, "7");
});

test("requires explicit stair placement and blocks an opening wider than its selected edge", () => {
  const stairItems = [
    ...items,
    { itemKey: "house_ledger", observation: { conditionStatus: "applies" } },
    { itemKey: "guards_railings", observation: { conditionStatus: "applies" } },
    { itemKey: "stairs_landings", observation: {
      conditionStatus: "applies",
      measurements: { stair_width: { value: "36", unit: "in" } },
    } },
  ];
  const unconfirmed = buildDeckTakeoffPreview({
    items: stairItems, catalog,
    plan: { ...basePlan, stairPlacementConfirmed: false },
  });
  assert.equal(unconfirmed.status, "needs_input");
  assert.ok(unconfirmed.unresolved.some((value) => value.includes("Confirm where the stairs")));
  assert.notEqual(
    unconfirmed.previewBinding,
    buildDeckTakeoffPreview({ items: stairItems, catalog, plan: basePlan }).previewBinding,
  );
  const confirmed = buildDeckTakeoffPreview({ items: stairItems, catalog, plan: basePlan });
  assert.notEqual(
    confirmed.previewBinding,
    buildDeckTakeoffPreview({ items: stairItems, catalog, plan: { ...basePlan, stairEdge: "yard" } }).previewBinding,
  );
  assert.notEqual(
    confirmed.previewBinding,
    buildDeckTakeoffPreview({ items: stairItems, catalog, plan: { ...basePlan, stairPosition: "center" } }).previewBinding,
  );
  assert.match(deckStairPlacementIssue({
    lengthFeet: 12, widthFeet: 2, attached: true, stairsPresent: true,
    stairWidthFeet: 3, stairEdge: "right", stairPlacementConfirmed: true,
  }) ?? "", /wider than/);
  assert.match(deckStairPlacementIssue({
    lengthFeet: 12, widthFeet: 14, attached: true, stairsPresent: true,
    stairWidthFeet: 3, stairEdge: "top", stairPlacementConfirmed: true,
  }) ?? "", /house edge/);
});

test("manual plan lines require a traceable cost source and skip zero quantities", () => {
  const preview = buildDeckTakeoffPreview({
    items,
    catalog,
    plan: {
      ...basePlan,
      additionalLines: [
        { ...basePlan.additionalLines[0], unitCost: "", sourceReference: "" },
        { key: "posts", category: "material", description: "Posts", quantity: "0", unit: "ea", unitCost: "20", catalogMaterialId: null, sourceReference: "quote" },
      ],
    },
  });
  assert.equal(preview.status, "needs_input");
  assert.ok(preview.unresolved.some((value) => value.includes("Deck installation labor")));
  assert.equal(preview.lines.some((line) => line.key === "posts"), false);
});

test("an exact catalog price cannot be applied with an incompatible purchase unit", () => {
  const badCatalog = new Map([["71000000-0000-4000-8000-000000000001", {
    ...catalog.get("71000000-0000-4000-8000-000000000001"),
    unit: "LN_FT",
  }]]);
  const preview = buildDeckTakeoffPreview({ items, plan: basePlan, catalog: badCatalog });
  assert.equal(preview.status, "needs_input");
  assert.ok(preview.unresolved.some((value) => value.includes("Fasteners need")));
});
