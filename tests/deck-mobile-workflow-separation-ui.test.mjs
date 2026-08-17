import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const shape = readFileSync("src/components/estimates/deck-shape-review.tsx", "utf8");
const planner = readFileSync("src/components/estimates/deck-takeoff-planner.tsx", "utf8");
const structural = readFileSync("src/components/estimates/deck-prescriptive-plan-generator.tsx", "utf8");

test("deck work advances through five explicit gated mobile stages", () => {
  assert.match(builder, /"site_visit" \| "shape" \| "structure" \| "takeoff" \| "proposal"/);
  assert.match(builder, /stage === "structure" && !finalizedDeckShape/);
  assert.match(builder, /stage === "takeoff" && !deckStructureReady/);
  assert.match(builder, /setDeckWorkspaceStage\("shape"\)/);
  assert.match(builder, /setDeckWorkspaceStage\("structure"\)/);
  assert.match(builder, /setDeckWorkspaceStage\("takeoff"\)/);
});

test("shape review contains footprint decisions but no structural or pricing work", () => {
  assert.match(shape, /Does this look like the deck\?/);
  assert.match(shape, /Replacement/);
  assert.match(shape, /New deck/);
  assert.match(shape, /Add a corner/);
  assert.match(shape, /Enter an exact edge measurement/);
  assert.match(shape, /Does this deck have stairs\?/);
  assert.match(shape, /Framing, code, materials and pricing come later/);
  assert.doesNotMatch(shape, /joist|beam|footing|Lowe's|unit cost|OH&amp;P/i);
});

test("approved shape feeds structure while pricing controls remain in takeoff", () => {
  assert.match(builder, /approvedShape=\{finalizedDeckShape\}/);
  assert.match(planner, /approvedOutline=\{approvedShape\?\.outline\}/);
  assert.match(structural, /approvedOutline\?: readonly DeckOutlinePoint\[\]/);
  assert.match(planner, /workflowPhase === "structure"/);
  assert.match(planner, /Structural design only/);
  assert.match(planner, /Material shopping, quantities, Lowe&apos;s products and prices begin only after this plan is approved/);
  assert.match(planner, /if \(approvedPlan\.unresolvedPackages\.length\)/);
  assert.match(planner, /the structural step is not finished/i);
  assert.match(planner, /The complete structural plan is approved/);
  assert.match(builder, /workflowPhase === "takeoff"/);
});
