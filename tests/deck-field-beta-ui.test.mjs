import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/sales/estimates/[estimateId]/page.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const component = readFileSync("src/components/estimates/deck-field-beta.tsx", "utf8");
const helper = readFileSync("src/lib/deck-field-beta.ts", "utf8");

test("Deck field beta is query gated and saves only private internal notes", () => {
  assert.match(page, /showDeckWorkflow=\{query\.workflow === "deck"\}/);
  assert.match(builder, /showDeckWorkflow = false/);
  assert.match(builder, /<DeckFieldBeta/);
  assert.match(builder, /body: \{ internalNotes \}/);
  assert.doesNotMatch(`${component}\n${helper}`, /scopeNotes|customerNotes|attachment|photo|supabase|rpc\(/i);
  assert.doesNotMatch(component, /fetch\(|\/api\//);
});

test("Deck field beta requires preview and repeats its limitations", () => {
  for (const copy of [
    "Field beta limitations", "No automatic deck engineering", "Michael must verify every measurement and quantity",
    "product, store, price, package quantity, tax, and availability", "Preview private field notes",
    "Private internal-notes preview", "FIELD BETA — Review every entry", "Save unverified field notes privately",
    "manual sections and cost lines", "set the job price", "customer display", "preview the customer estimate",
  ]) assert.match(`${component}\n${helper}`, new RegExp(copy, "i"));
  assert.match(component, /preview \? <div/);
  assert.match(component, /replaceDeckFieldBlock\(internalNotes, preview\)/);
});

test("mobile field capture has no fabricated values or calculation path", () => {
  assert.match(component, /const emptyDraft:[\s\S]*projectCondition: "", length: "", width: ""/);
  for (const label of ["Overall length", "Overall width", "Height above grade", "Stairs observed", "Railing areas", "Surface and framing condition", "Access and demolition", "Utilities and obstructions", "Other field notes"]) assert.match(component, new RegExp(label, "i"));
  assert.doesNotMatch(`${component}\n${helper}`, /calculateDeck|materialQuantity|laborHours|Lowe's price:\s*\d/i);
});
