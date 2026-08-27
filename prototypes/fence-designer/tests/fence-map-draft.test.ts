import { describe, expect, it } from "vitest";
import { placeFenceMapPoint } from "../src/fence-map-draft";
import { EMPTY_DESIGN, fenceLineCount } from "../src/model";

describe("Fence map draft placement", () => {
  it("starts and then continues a separate line without reconnecting to the prior endpoint", () => {
    const first = placeFenceMapPoint(EMPTY_DESIGN, { id: "a", xMm: 0, yMm: 0 }, "s1", null, "continue-line");
    const firstLine = placeFenceMapPoint(first, { id: "b", xMm: 1_000, yMm: 0 }, "s1", "a", "continue-line");
    const separate = placeFenceMapPoint(firstLine, { id: "c", xMm: 0, yMm: 2_000 }, "s2", "b", "start-line");
    const continued = placeFenceMapPoint(separate, { id: "d", xMm: 1_000, yMm: 2_000 }, "s3", "c", "continue-line");

    expect(fenceLineCount(separate)).toBe(2);
    expect(separate.segments).toHaveLength(1);
    expect(continued.segments.map(({ fromPointId, toPointId }) => ({ fromPointId, toPointId }))).toEqual([
      { fromPointId: "a", toPointId: "b" },
      { fromPointId: "c", toPointId: "d" },
    ]);
    expect(continued.segments.some(({ fromPointId, toPointId }) => fromPointId === "b" && toPointId === "c")).toBe(false);
  });
});
