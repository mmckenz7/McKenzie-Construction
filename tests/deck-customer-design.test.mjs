import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deckStairOpeningGeometry, parseDeckProposalDesign } from "../src/lib/deck-proposal-design.ts";

const proposalRoute = readFileSync("src/app/api/estimates/[estimateId]/proposal/route.ts", "utf8");
const presentationRoute = readFileSync("src/app/api/estimates/[estimateId]/presentation/route.ts", "utf8");
const publicPayload = readFileSync("src/lib/public-token-api.ts", "utf8");
const publicPage = readFileSync("src/app/estimate/[token]/page.tsx", "utf8");
const internalPreview = readFileSync("src/components/estimates/estimate-customer-preview.tsx", "utf8");
const visual = readFileSync("src/components/estimates/deck-plan-visual.tsx", "utf8");
const planner = readFileSync("src/components/estimates/deck-takeoff-planner.tsx", "utf8");

test("parses only bounded, explicit Deck proposal designs", () => {
  assert.deepEqual(parseDeckProposalDesign({
    lengthFeet: "18", widthFeet: "12", boardRunDirection: "along_length",
    deckingLayout: "picture_frame_divider", railingLengthFeet: "39",
    attached: true, stairsPresent: true, stairWidthFeet: "3",
    stairEdge: "right", stairPosition: "end",
  }), {
    lengthFeet: 18, widthFeet: 12, boardRunDirection: "along_length",
    deckingLayout: "picture_frame_divider", railingLengthFeet: 39,
    attached: true, stairsPresent: true, stairWidthFeet: 3,
    stairEdge: "right", stairPosition: "end",
  });
  assert.equal(parseDeckProposalDesign({ lengthFeet: 0 }), null);
  assert.equal(parseDeckProposalDesign({
    lengthFeet: 18, widthFeet: 12, boardRunDirection: "diagonal",
    deckingLayout: "seamless", railingLengthFeet: 10, attached: true, stairsPresent: false,
  }), null);
});

test("keeps older frozen designs readable with the former yard-center stair default", () => {
  const design = parseDeckProposalDesign({
    lengthFeet: 16, widthFeet: 10, boardRunDirection: "along_width",
    deckingLayout: "seamless", railingLengthFeet: 29, attached: true, stairsPresent: true,
  });
  assert.equal(design?.stairEdge, "yard");
  assert.equal(design?.stairPosition, "center");
  assert.equal(design?.stairWidthFeet, null);
});

test("normalizes a valid no-stairs width of zero without dropping the blueprint", () => {
  const design = parseDeckProposalDesign({
    lengthFeet: 16, widthFeet: 10, boardRunDirection: "along_length",
    deckingLayout: "seamless", railingLengthFeet: 0, attached: true,
    stairsPresent: false, stairWidthFeet: 0, stairEdge: "right", stairPosition: "end",
  });
  assert.equal(design?.stairWidthFeet, null);
  assert.equal(design?.stairsPresent, false);
  for (const stairWidthFeet of ["0", "", "   ", false]) {
    assert.equal(parseDeckProposalDesign({
      lengthFeet: 16, widthFeet: 10, boardRunDirection: "along_length",
      deckingLayout: "seamless", railingLengthFeet: 0, attached: true,
      stairsPresent: false, stairWidthFeet, stairEdge: "right", stairPosition: "end",
    }), null);
  }
  assert.equal(parseDeckProposalDesign({
    lengthFeet: 16, widthFeet: 10, boardRunDirection: "along_length",
    deckingLayout: "seamless", railingLengthFeet: 25, attached: true,
    stairsPresent: true, stairWidthFeet: 0, stairEdge: "right", stairPosition: "end",
  }), null);
});

test("places measured stair openings proportionally on every editable edge", () => {
  const drawing = { x: 10, y: 20, width: 180, height: 100 };
  const base = {
    lengthFeet: 18, widthFeet: 10, boardRunDirection: "along_length",
    deckingLayout: "seamless", railingLengthFeet: 43, attached: false,
    stairsPresent: true, stairWidthFeet: 3,
  };
  assert.deepEqual(deckStairOpeningGeometry({ ...base, stairEdge: "right", stairPosition: "end" }, drawing), {
    edge: "right", start: 90, end: 120, center: 105,
  });
  assert.deepEqual(deckStairOpeningGeometry({ ...base, stairEdge: "yard", stairPosition: "start" }, drawing), {
    edge: "yard", start: 10, end: 40, center: 25,
  });
  assert.deepEqual(deckStairOpeningGeometry({ ...base, stairEdge: "top", stairPosition: "center" }, drawing), {
    edge: "top", start: 85, end: 115, center: 100,
  });
  assert.equal(deckStairOpeningGeometry({ ...base, stairWidthFeet: 19, stairEdge: "top", stairPosition: "center" }, drawing), null);
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
  assert.match(visual, /useId\(\)/);
  assert.match(visual, /railingLengthFeet === null \|\| railingLengthFeet > 0/);
  assert.match(visual, /if \(opening\)/);
  assert.match(visual, /RAILING TBD/);
  assert.match(planner, /Nearest the top of the drawing/);
  assert.match(planner, /Farthest from the top of the drawing/);
});
