import assert from "node:assert/strict";
import test from "node:test";

import { deckOutlineOutwardNormal } from "../src/lib/deck-prescriptive-plan.ts";

test("stairs project outside a clockwise inset perimeter", () => {
  const outline = [
    { x: 0, y: 0 },
    { x: 0, y: 5 },
    { x: 7, y: 5 },
    { x: 7, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 15 },
    { x: 19, y: 15 },
    { x: 19, y: 0 },
  ];
  const bottom = deckOutlineOutwardNormal(outline, 5);
  assert.ok(bottom);
  assert.ok(Math.abs(bottom.x) < 0.0001);
  assert.equal(bottom.y, 1);
});

test("outward direction remains correct when polygon order is reversed", () => {
  const counterClockwise = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  const clockwise = [...counterClockwise].reverse();
  const ccwBottom = deckOutlineOutwardNormal(counterClockwise, 2);
  const cwBottom = deckOutlineOutwardNormal(clockwise, 0);
  assert.ok(ccwBottom && Math.abs(ccwBottom.x) < 0.0001 && ccwBottom.y === 1);
  assert.ok(cwBottom && Math.abs(cwBottom.x) < 0.0001 && cwBottom.y === 1);
});

test("invalid edges do not produce a stair projection", () => {
  assert.equal(deckOutlineOutwardNormal([{ x: 0, y: 0 }], 2), null);
  assert.equal(deckOutlineOutwardNormal([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ], 0), null);
});
