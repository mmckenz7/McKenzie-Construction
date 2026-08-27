// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LevelCutoutControls } from "../src/LevelCutoutControls";
import { DEFAULT_DESIGN } from "../src/model";
import { migrateDeckDesignToV3 } from "../src/modelV3";

describe("saved level recovery", () => {
  it("offers an explicit selected-level recovery without changing the saved facts", () => {
    const design = migrateDeckDesignToV3(DEFAULT_DESIGN);
    const selected = design.platforms[0];
    const saved = { ...selected, id: "platform-saved", elevation: selected.elevation + 120 };
    const onKeepSelectedLevel = vi.fn();
    const markup = renderToStaticMarkup(<LevelCutoutControls platforms={[selected, saved]} platform={selected} selectedHoleIndex={null} onKeepSelectedLevel={onKeepSelectedLevel} onSetElevation={vi.fn()} onAddCutout={vi.fn()} onSelectCutout={vi.fn()} onUpdateCutout={vi.fn()} onRemoveCutout={vi.fn()} />);

    expect(markup).toContain("Saved levels paused");
    expect(markup).toContain("Keep selected level only");
    expect(markup).toContain("remove other levels and links");
    expect(onKeepSelectedLevel).not.toHaveBeenCalled();
    expect(design.platforms).toHaveLength(1);
  });
});
