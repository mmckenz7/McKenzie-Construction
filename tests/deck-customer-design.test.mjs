import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseDeckProposalDesign } from "../src/lib/deck-proposal-design.ts";

const proposalRoute = readFileSync("src/app/api/estimates/[estimateId]/proposal/route.ts", "utf8");
const presentationRoute = readFileSync("src/app/api/estimates/[estimateId]/presentation/route.ts", "utf8");
const publicPayload = readFileSync("src/lib/public-token-api.ts", "utf8");
const publicPage = readFileSync("src/app/estimate/[token]/page.tsx", "utf8");
const internalPreview = readFileSync("src/components/estimates/estimate-customer-preview.tsx", "utf8");

test("parses only bounded, explicit Deck proposal designs", () => {
  assert.deepEqual(parseDeckProposalDesign({
    lengthFeet: "18", widthFeet: "12", boardRunDirection: "along_length",
    deckingLayout: "picture_frame_divider", railingLengthFeet: "39",
    attached: true, stairsPresent: true,
  }), {
    lengthFeet: 18, widthFeet: 12, boardRunDirection: "along_length",
    deckingLayout: "picture_frame_divider", railingLengthFeet: 39,
    attached: true, stairsPresent: true,
  });
  assert.equal(parseDeckProposalDesign({ lengthFeet: 0 }), null);
  assert.equal(parseDeckProposalDesign({
    lengthFeet: 18, widthFeet: 12, boardRunDirection: "diagonal",
    deckingLayout: "seamless", railingLengthFeet: 10, attached: true, stairsPresent: false,
  }), null);
});

test("the frozen proposal and internal preview use the same immutable Deck design", () => {
  assert.match(proposalRoute, /loadDeckProposalDesign/);
  assert.match(proposalRoute, /snapshot = \{[\s\S]*deckDesign/);
  assert.match(presentationRoute, /loadDeckProposalDesign/);
  assert.match(publicPayload, /parseDeckProposalDesign\(snapshot\.deckDesign\)/);
  assert.match(publicPage, /Proposed deck layout/);
  assert.match(publicPage, /DeckPlanVisual/);
  assert.match(internalPreview, /How the estimated deck is laid out/);
  assert.match(internalPreview, /DeckPlanVisual/);
});
