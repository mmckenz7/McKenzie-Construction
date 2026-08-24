import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redo, undo } from "../src/history";

describe("undo and redo", () => {
  it("restores deterministic whole-document states and clears redo after a new edit", () => {
    const first = { revision: 0, value: "empty" };
    const second = { revision: 1, value: "one point" };
    const third = { revision: 2, value: "one span" };
    const history = pushHistory(pushHistory(createHistory(first), second), third);
    const undone = undo(history);
    expect(undone.present).toBe(second);
    expect(redo(undone).present).toBe(third);
    const branched = pushHistory(undone, { revision: 3, value: "different span" });
    expect(branched.future).toEqual([]);
    expect(redo(branched)).toBe(branched);
  });
});
