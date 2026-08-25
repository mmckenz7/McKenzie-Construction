// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoOutlineTracer, rectangleTrace } from "../src/PhotoOutlineTracer";

const noop = () => {};

describe("temporary photo trace render safety", () => {
  it("fails closed with a visible diagnostic for a stale stair edge", () => {
    const html = renderToStaticMarkup(<PhotoOutlineTracer
      width={144}
      projection={144}
      photos={[]}
      outer={rectangleTrace(144, 144)}
      stairEdgeId="stale-photo-edge"
      stairOffset={24}
      stairWidth={48}
      surfaceElevation={48}
      gradeElevation={0}
      onChange={noop}
      onStairPlacementChange={noop}
      onStairWidthChange={noop}
      onError={noop}
    />);
    expect(html).toContain("Temporary stairs no longer fit this outline");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("trace-stair-preview");
  });
});
