import assert from "node:assert/strict";
import test from "node:test";

import { buildDeckTakeoffPreview, deckFieldDimensions, measurementFeet } from "../src/lib/deck-takeoff-v0.ts";

const items = [{
  itemKey: "full_deck_yard",
  observation: { measurements: {
    length: { value: "12 ft 0 in", unit: "ft + in" },
    width: { value: "14 ft 0 in", unit: "ft + in" },
  } },
}];

const basePlan = {
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

test("does not guess around unsupported splices or missing price evidence", () => {
  const preview = buildDeckTakeoffPreview({
    items,
    catalog: new Map(),
    plan: { ...basePlan, boardStockLengthFeet: "10", screwCatalogMaterialId: null },
  });
  assert.equal(preview.status, "needs_input");
  assert.ok(preview.unresolved.some((value) => value.includes("splice design")));
  assert.ok(preview.unresolved.some((value) => value.includes("Fasteners need")));
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
