import { describe, expect, it } from "vitest";
import { derivePictureFrameBoards } from "../src/pictureFrameProjection";

const rectangle = Object.freeze({
  outer: Object.freeze([
    Object.freeze({ x: 0, z: 0 }),
    Object.freeze({ x: 192, z: 0 }),
    Object.freeze({ x: 192, z: 144 }),
    Object.freeze({ x: 0, z: 144 }),
  ]),
  holes: Object.freeze([]),
});

const lShape = Object.freeze({
  outer: Object.freeze([
    Object.freeze({ x: 0, z: 0 }),
    Object.freeze({ x: 240, z: 0 }),
    Object.freeze({ x: 240, z: 120 }),
    Object.freeze({ x: 168, z: 120 }),
    Object.freeze({ x: 168, z: 180 }),
    Object.freeze({ x: 0, z: 180 }),
  ]),
  holes: Object.freeze([]),
});

const options = Object.freeze({ boardWidth: 5.5, gap: 0.25, joistSpacing: 16, boardDirection: "left_right" as const });

describe("picture-frame board projection groundwork", () => {
  it("separates a mitered border course from clipped rectangle field boards", () => {
    const projection = derivePictureFrameBoards(rectangle, options);
    expect(projection.borderBoards).toHaveLength(4);
    expect(projection.fieldBoards).toHaveLength(24);
    expect(projection.borderBoardLength).toBe(650);
    expect(projection.fieldBoards.every((board) => board.start.x >= 5.75 && board.end.x <= 186.25)).toBe(true);
    expect(projection.surfaceBoardLength).toBe(projection.borderBoardLength + projection.fieldBoardLength);
    expect(Object.isFrozen(projection.surfaceBoards)).toBe(true);
  });

  it("preserves deterministic concave border and field segmentation", () => {
    const first = derivePictureFrameBoards(lShape, options);
    const replay = derivePictureFrameBoards({ ...lShape, outer: [...lShape.outer].reverse() }, options);
    expect(first).toEqual(replay);
    expect(first.borderBoards).toHaveLength(6);
    expect(first.fieldBoards.length).toBeGreaterThan(0);
    expect(new Set(first.surfaceBoards.map((board) => board.id)).size).toBe(first.surfaceBoards.length);
  });

  it("rotates only the clipped field rows while preserving the border", () => {
    const horizontal = derivePictureFrameBoards(rectangle, options);
    const vertical = derivePictureFrameBoards(rectangle, { ...options, boardDirection: "house_yard" });
    expect(vertical.borderBoards).toEqual(horizontal.borderBoards);
    expect(horizontal.fieldBoards.every((board) => board.start.z === board.end.z)).toBe(true);
    expect(vertical.fieldBoards.every((board) => board.start.x === board.end.x)).toBe(true);
    expect(vertical.fieldBoards).not.toEqual(horizontal.fieldBoards);
  });

  it("adds cutout borders and clips field rows around their expanded clearance", () => {
    const projection = derivePictureFrameBoards({
      ...rectangle,
      holes: [[{ x: 48, z: 48 }, { x: 96, z: 48 }, { x: 96, z: 96 }, { x: 48, z: 96 }]],
    }, options);
    expect(projection.borderBoards).toHaveLength(8);
    expect(projection.borderBoards.filter((board) => board.id.includes("hole-1"))).toHaveLength(4);
    expect(projection.fieldBoards.filter((board) => board.start.z >= 42.25 && board.start.z <= 101.75)
      .every((board) => board.end.x <= 42.25 || board.start.x >= 101.75)).toBe(true);
  });

  it("keeps multiple opening courses deterministic when region winding reverses", () => {
    const region = {
      ...rectangle,
      holes: [
        [{ x: 24, z: 48 }, { x: 60, z: 48 }, { x: 60, z: 84 }, { x: 24, z: 84 }],
        [{ x: 120, z: 48 }, { x: 156, z: 48 }, { x: 156, z: 84 }, { x: 120, z: 84 }],
      ],
    };
    const projection = derivePictureFrameBoards(region, options);
    const replay = derivePictureFrameBoards({ outer: [...region.outer].reverse(), holes: region.holes.map((item) => [...item].reverse()) }, options);
    expect(projection).toEqual(replay);
    expect(projection.borderBoards).toHaveLength(12);
  });

  it("fails closed for colliding cutout borders and collapsed field regions", () => {
    expect(() => derivePictureFrameBoards({
      ...rectangle,
      holes: [[{ x: 3, z: 48 }, { x: 51, z: 48 }, { x: 51, z: 96 }, { x: 3, z: 96 }]],
    }, options)).toThrow(/inside|contain|intersect/i);
    expect(() => derivePictureFrameBoards({
      outer: [{ x: 0, z: 0 }, { x: 48, z: 0 }, { x: 48, z: 24 }, { x: 0, z: 24 }],
      holes: [],
    }, { ...options, boardWidth: 12, gap: 1 })).toThrow(/collapse|inside/i);
  });
});
