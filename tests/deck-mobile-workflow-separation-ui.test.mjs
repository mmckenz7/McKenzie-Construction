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
  assert.match(shape, /Simple perimeter walk/);
  assert.match(shape, /Draw perimeter from the house/);
  assert.match(shape, /Use this starting outline/);
  assert.match(shape, /tap the green starting point to close the deck/i);
  assert.match(shape, /Save and measure next wall/);
  assert.match(shape, /Save final wall/);
  assert.match(shape, /Add a corner/);
  assert.match(shape, /Edit an exact wall measurement/);
  assert.match(shape, /Smart snap/);
  assert.match(shape, /Snap off/);
  assert.match(shape, /becomes magnetic only near a grid line/);
  assert.match(shape, /six-inch grid/);
  assert.match(shape, /Does this deck have stairs\?/);
  assert.match(shape, /Framing, code, materials and pricing come later/);
  assert.doesNotMatch(shape, /joist|beam|footing|Lowe's|unit cost|OH&amp;P/i);
});

test("shape grid stays visible while corner dots stay small without shrinking touch targets", () => {
  assert.match(shape, /fillOpacity="0\.58"/);
  assert.match(shape, /stroke=\{major \? "#64748b" : "#94a3b8"\}/);
  assert.match(shape, /r=\{perimeterPoints && index === 0 \? 8 : 6\}/);
  assert.match(shape, /fill=\{perimeterPoints && index === 0 \? "#16a34a" : "#f97316"\}/);
  assert.match(shape, /x1="16" y1=\{y\} x2="304"/);
  assert.match(shape, /y1="24" x2=\{x\} y2="198"/);
});

test("stairs and four grade heights are editable in the shape drawing", () => {
  assert.match(shape, /Moving stairs\. Drag them to any outside deck wall/);
  assert.match(shape, /Stair wall/);
  assert.match(shape, /Stair width \(ft\)/);
  assert.match(shape, /House · left/);
  assert.match(shape, /Off house · right/);
  assert.match(shape, /one steady grade plane/);
  assert.match(shape, /Estimated stair height/);
  assert.match(shape, /stairPlacement: stairsPresent \? stairPlacement : null/);
  assert.match(shape, /gradeHeights/);
});

test("wall labels open their exact measurement instead of exposing numbered edges only", () => {
  assert.match(shape, /House wall/);
  assert.match(shape, /Right side/);
  assert.match(shape, /Yard side/);
  assert.match(shape, /Left side/);
  assert.match(shape, /Edit \$\{edgeName\(index\)\}, currently/);
  assert.match(shape, /Enter its exact length below the drawing/);
});

test("advanced wall sliders remain optional and retain mobile-sized invisible targets", () => {
  assert.match(shape, /function moveWholeEdge\(edgeIndex: number, requestedDelta: number\)/);
  assert.match(shape, /moveDeckOutlineEdge\(current, edgeIndex, requestedDelta/);
  assert.match(shape, /edgeDragRef\.current = \{ edgeIndex: index, startPointer, startOutline:/);
  assert.match(shape, /role="slider"/);
  assert.match(shape, /Move wall \$\{index \+ 1\}; both corners move together/);
  assert.match(shape, /r="24"\s+fill="transparent"/);
  assert.match(shape, /Optional fine adjustments/);
  assert.match(shape, /advancedEditing \? <circle/);
  assert.match(shape, /ArrowUp/);
  assert.match(shape, /Wall \$\{index \+ 1\} moved 6 inches/);
});

test("simple perimeter walk begins at the house and validates before exact measurements", () => {
  assert.match(shape, /setPerimeterPoints\(\[\{ x: 0, y: 0 \}\]\)/);
  assert.match(shape, /isValidDeckOutline\(perimeterPoints\)/);
  assert.match(shape, /setMeasurementStep\(0\)/);
  assert.match(shape, /Wall \{measurementStep \+ 1\} of \{outline\.length\}/);
  assert.match(shape, /Exact length \(ft\)/);
  assert.match(shape, /!perimeterPoints && measurementStep === null/);
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
