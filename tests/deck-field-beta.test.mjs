import assert from "node:assert/strict";
import test from "node:test";

import { buildDeckFieldBlock, DECK_FIELD_BLOCK_END, DECK_FIELD_BLOCK_START, replaceDeckFieldBlock } from "../src/lib/deck-field-beta.ts";

const draft = (overrides = {}) => ({ projectCondition: "", length: "", width: "", heightAboveGrade: "", supportType: "", stairs: "", stairWidth: "", railingNotes: "", surfaceAndFramingNotes: "", accessAndDemolitionNotes: "", utilitiesAndObstructions: "", fieldNotes: "", ...overrides });

test("builds only entered observations with persistent beta limitations", () => {
  const block = buildDeckFieldBlock(draft({ length: "12 ft", fieldNotes: "Verify ledger condition" }));
  assert.match(block, /DECK FIELD VISIT — UNVERIFIED/);
  assert.match(block, /No automatic deck engineering, code, load, bill-of-materials, or labor calculation/);
  assert.match(block, /Michael must verify every measurement and quantity/);
  assert.match(block, /product, store, price, package quantity, tax, and availability/);
  assert.match(block, /Field length: 12 ft/);
  assert.doesNotMatch(block, /Field width:/);
});

test("preserves other internal notes and replaces the one bounded Deck block", () => {
  const first = buildDeckFieldBlock(draft({ length: "12 ft" }));
  const second = buildDeckFieldBlock(draft({ length: "14 ft" }));
  const notes = replaceDeckFieldBlock("Keep this before", first) + "\nKeep this after";
  const replaced = replaceDeckFieldBlock(notes, second);
  assert.match(replaced, /^Keep this before/);
  assert.match(replaced, /Keep this after$/);
  assert.match(replaced, /Field length: 14 ft/);
  assert.doesNotMatch(replaced, /Field length: 12 ft/);
  assert.equal(replaced.split(DECK_FIELD_BLOCK_START).length - 1, 1);
  assert.equal(replaced.split(DECK_FIELD_BLOCK_END).length - 1, 1);
});

test("fails closed for blank drafts or malformed and duplicate existing blocks", () => {
  assert.throws(() => buildDeckFieldBlock(draft()), /at least one field observation/i);
  assert.throws(() => buildDeckFieldBlock(draft({ fieldNotes: DECK_FIELD_BLOCK_START })), /reserved Deck field marker/i);
  assert.throws(() => replaceDeckFieldBlock(`private\n${DECK_FIELD_BLOCK_START}`, "replacement"), /incomplete/i);
  assert.throws(() => replaceDeckFieldBlock(`${DECK_FIELD_BLOCK_START}${DECK_FIELD_BLOCK_END}${DECK_FIELD_BLOCK_START}${DECK_FIELD_BLOCK_END}`, "replacement"), /multiple/i);
});
