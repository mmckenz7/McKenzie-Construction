// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { dragRectangularHoleFromPointer, moveRectangularHole, resizeRectangularHole } from "../src/holeEditorV3";

const hole = [{ x: 24, z: 24 }, { x: 60, z: 24 }, { x: 60, z: 60 }, { x: 24, z: 60 }];

describe("direct rectangular cutout editing", () => {
  it("moves every corner by the same exact delta", () => {
    expect(moveRectangularHole(hole, { x: 12, z: -6 })).toEqual([{ x: 36, z: 18 }, { x: 72, z: 18 }, { x: 72, z: 54 }, { x: 36, z: 54 }]);
  });

  it("resizes from one corner while preserving the opposite corner and rectangle", () => {
    expect(resizeRectangularHole(hole, 0, { x: 12, z: 18 })).toEqual([{ x: 12, z: 18 }, { x: 60, z: 18 }, { x: 60, z: 60 }, { x: 12, z: 60 }]);
  });

  it("rejects non-rectangular direct-handle input", () => {
    expect(() => moveRectangularHole(hole.slice(0, 3), { x: 1, z: 1 })).toThrow(/four-corner rectangle/i);
  });

  it("uses pointer delta rather than the absolute off-center touch point", () => {
    expect(dragRectangularHoleFromPointer(hole, "move", { x: 41, z: 37 }, { x: 53, z: 31 }, 6)).toEqual([{ x: 36, z: 18 }, { x: 72, z: 18 }, { x: 72, z: 54 }, { x: 36, z: 54 }]);
    expect(dragRectangularHoleFromPointer(hole, 0, { x: 31, z: 29 }, { x: 19, z: 23 }, 6)).toEqual([{ x: 12, z: 18 }, { x: 60, z: 18 }, { x: 60, z: 60 }, { x: 12, z: 60 }]);
  });

  it("keeps tap, sub-snap movement, and return-to-origin as exact no-ops", () => {
    expect(dragRectangularHoleFromPointer(hole, "move", { x: 41, z: 37 }, { x: 41, z: 37 }, 6)).toEqual(hole);
    expect(dragRectangularHoleFromPointer(hole, 0, { x: 31, z: 29 }, { x: 33, z: 27 }, 6)).toEqual(hole);
    expect(dragRectangularHoleFromPointer(hole, 0, { x: 31, z: 29 }, { x: 31, z: 29 }, 6)).toEqual(hole);
  });
});
