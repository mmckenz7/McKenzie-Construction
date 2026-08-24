// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { signedPolygonArea } from "../src/polygon";
import { derivePolygonMembers, triangulatePolygon } from "../src/polygonProjection";

const lShape = [
  { x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 120 },
  { x: 168, z: 120 }, { x: 168, z: 180 }, { x: 0, z: 180 },
];
const outer = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 180 }, { x: 0, z: 180 }];
const hole = [{ x: 72, z: 60 }, { x: 168, z: 60 }, { x: 168, z: 120 }, { x: 72, z: 120 }];

describe("polygon surface projection spike", () => {
  it("triangulates a concave outline with stable IDs and exact area", () => {
    const triangles = triangulatePolygon(lShape);
    expect(triangles).toHaveLength(lShape.length - 2);
    expect(triangles.map((triangle) => triangle.id)).toEqual([
      "polygon-triangle-1", "polygon-triangle-2", "polygon-triangle-3", "polygon-triangle-4",
    ]);
    expect(triangles.reduce((sum, triangle) => sum + Math.abs(signedPolygonArea(triangle.points)), 0)).toBe(38880);
    expect(Object.isFrozen(triangles)).toBe(true);
  });

  it("produces the same triangulation for rotated and reversed input", () => {
    const rotatedReversed = [...lShape].reverse().slice(2).concat([...lShape].reverse().slice(0, 2));
    expect(triangulatePolygon(rotatedReversed)).toEqual(triangulatePolygon(lShape));
  });

  it("segments boards and joists around a rectangular hole", () => {
    const projection = derivePolygonMembers(
      { outer, holes: [hole] },
      { boardWidth: 12, gap: 1, joistSpacing: 24 },
    );
    expect(projection.surfaceBoards.some((member) => member.start.z > 60 && member.start.z < 120 && member.end.x <= 72)).toBe(true);
    expect(projection.surfaceBoards.some((member) => member.start.z > 60 && member.start.z < 120 && member.start.x >= 168)).toBe(true);
    expect(projection.joists.some((member) => member.start.x > 72 && member.start.x < 168 && member.end.z <= 60)).toBe(true);
    expect(projection.joists.some((member) => member.start.x > 72 && member.start.x < 168 && member.start.z >= 120)).toBe(true);
    expect(new Set(projection.surfaceBoards.map((member) => member.id)).size).toBe(projection.surfaceBoards.length);
    expect(new Set(projection.joists.map((member) => member.id)).size).toBe(projection.joists.length);
    expect(Object.isFrozen(projection.surfaceBoards)).toBe(true);
    expect(Object.isFrozen(projection.joists)).toBe(true);
    expect(derivePolygonMembers({ outer, holes: [hole] }, { boardWidth: 12, gap: 1, joistSpacing: 24 })).toEqual(projection);
  });

  it("rotates boards and perpendicular joists deterministically", () => {
    const leftRight = derivePolygonMembers(
      { outer, holes: [hole] },
      { boardWidth: 12, gap: 1, joistSpacing: 24, boardDirection: "left_right" },
    );
    const houseYard = derivePolygonMembers(
      { outer, holes: [hole] },
      { boardWidth: 12, gap: 1, joistSpacing: 24, boardDirection: "house_yard" },
    );
    expect(leftRight.surfaceBoards.every((member) => member.start.z === member.end.z)).toBe(true);
    expect(leftRight.joists.every((member) => member.start.x === member.end.x)).toBe(true);
    expect(houseYard.surfaceBoards.every((member) => member.start.x === member.end.x)).toBe(true);
    expect(houseYard.joists.every((member) => member.start.z === member.end.z)).toBe(true);
    expect(derivePolygonMembers(
      { outer, holes: [hole] },
      { boardWidth: 12, gap: 1, joistSpacing: 24, boardDirection: "house_yard" },
    )).toEqual(houseYard);
    expect(houseYard.surfaceBoards).not.toEqual(leftRight.surfaceBoards);
  });

  it("rejects projection parameters outside recorded prototype bounds", () => {
    expect(() => derivePolygonMembers({ outer, holes: [] }, { boardWidth: 1, gap: 0.25, joistSpacing: 16 })).toThrow(/Board width/);
    expect(() => derivePolygonMembers({ outer, holes: [] }, { boardWidth: 5.5, gap: 0, joistSpacing: 16 })).toThrow(/Board gap/);
    expect(() => derivePolygonMembers({ outer, holes: [] }, { boardWidth: 5.5, gap: 0.25, joistSpacing: 30 })).toThrow(/Joist spacing/);
    expect(() => derivePolygonMembers({ outer, holes: [] }, { boardWidth: 5.5, gap: 0.25, joistSpacing: 16, boardDirection: "diagonal" as never })).toThrow(/Board direction/);
  });
});
