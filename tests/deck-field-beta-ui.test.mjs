import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/sales/estimates/[estimateId]/page.tsx", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const component = readFileSync("src/components/estimates/guided-deck-site-visit.tsx", "utf8");

test("Deck field beta is replaced by the query-gated guided private visit", () => {
  assert.match(page, /showDeckWorkflow=\{query\.workflow === "deck"\}/);
  assert.match(builder, /showDeckWorkflow = false/);
  assert.match(builder, /<GuidedDeckSiteVisit estimateId=\{estimateId\}/);
  assert.doesNotMatch(builder, /<DeckFieldBeta/);
  assert.doesNotMatch(component, /scopeNotes|customerNotes|internalNotes/);
});

test("guided beta repeats limitations and keeps automatic review advisory", () => {
  for (const copy of ["Field beta limitations", "Photos document visible conditions only", "No automatic engineering", "Michael must verify every field fact", "Your check is required", "only a visibility check"]) assert.match(component, new RegExp(copy, "i"));
  assert.doesNotMatch(component, /calculateDeck|materialQuantity|laborHours|AI passed|automatic pass/i);
});

test("guided beta continues to existing manual estimate work without writing customer scope", () => {
  assert.match(component, /nine required views/i);
  assert.match(component, /I confirm this capture/);
  assert.match(component, /office follow-up/i);
  assert.doesNotMatch(component, /body:\s*\{\s*(?:scopeNotes|customerNotes|internalNotes)/);
});
