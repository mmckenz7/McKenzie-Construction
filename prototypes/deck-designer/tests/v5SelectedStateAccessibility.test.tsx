// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV5 } from "../src/modelV5";
import { V5App } from "../src/V5App";

describe("active v5 selected-state accessibility", () => {
  it("announces exactly one current stage, board direction, board pattern, beam, and camera preset", () => {
    const html = renderToStaticMarkup(<V5App initialDesign={migrateDeckDesignToV5(DEFAULT_DESIGN)} />);
    const stage = html.match(/<nav class="designer-stage-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const boardDirection = html.match(/<strong>Deck board direction<\/strong>[\s\S]*?<\/section>/)?.[0] ?? "";
    const boardPattern = html.match(/<strong>Deck board pattern<\/strong>[\s\S]*?<\/section>/)?.[0] ?? "";
    const beams = html.match(/<strong>Conceptual beams<\/strong>[\s\S]*?<\/section>/)?.[0] ?? "";
    const camera = html.match(/<div class="camera-buttons">[\s\S]*?<\/div>/)?.[0] ?? "";

    for (const group of [stage, boardDirection, boardPattern, beams, camera]) {
      expect(group.match(/aria-pressed="true"/g)).toHaveLength(1);
    }
    expect(stage).toMatch(/disabled=""/);
    expect(stage.match(/aria-pressed=/g)).toHaveLength(2);
    expect(camera.match(/aria-pressed=/g)).toHaveLength(3);
  });

  it("binds landing and turn pressed state to the recorded selections without marking commands", () => {
    const source = readFileSync(new URL("../src/V5App.tsx", import.meta.url), "utf8");
    expect(source).toContain("aria-pressed={landing.id === activeLanding?.id}");
    expect(source).toContain("aria-pressed={activeLanding.turn === turn}");
    expect(source).toContain("aria-pressed={line.id === selectedBeamLineId}");
    expect(source).not.toMatch(/<button[^>]*aria-pressed[^>]*>Add beam/);
    expect(source).not.toMatch(/<button[^>]*aria-pressed[^>]*>Undo/);
  });
});
