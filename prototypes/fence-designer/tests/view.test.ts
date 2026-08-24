import { describe, expect, it } from "vitest";
import { MAX_VIEW_WIDTH, MIN_VIEW_WIDTH, panView, zoomViewAt, type ViewBox } from "../src/view";

const view: ViewBox = { x: 0, y: 0, width: 10_000, height: 5_000 };

describe("plan view navigation", () => {
  it("zooms around a deterministic focal point", () => {
    expect(zoomViewAt(view, 0.5, 0.25, 0.75)).toEqual({ x: 1_250, y: 1_875, width: 5_000, height: 2_500 });
  });

  it("clamps zoom without changing aspect ratio", () => {
    const close = zoomViewAt(view, 0.001);
    const far = zoomViewAt(view, 1_000);
    expect(close.width).toBe(MIN_VIEW_WIDTH);
    expect(close.height).toBe(1_000);
    expect(far.width).toBe(MAX_VIEW_WIDTH);
    expect(far.height).toBe(52_000);
  });

  it("pans by viewport pixels in plan coordinates", () => {
    expect(panView(view, 100, -50, 1_000, 500)).toEqual({ x: -1_000, y: 500, width: 10_000, height: 5_000 });
  });
});
