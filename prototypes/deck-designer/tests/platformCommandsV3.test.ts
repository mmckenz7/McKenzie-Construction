// @ts-ignore The production root intentionally does not install this isolated prototype package's test runner.
import { describe, expect, it } from "vitest";
import { deriveDeckDesignProjectionV3 } from "../src/designProjectionV3";
import { createHistoryV3, designHistoryReducerV3 } from "../src/historyV3";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { duplicatePlatformV3, removePlatformV3 } from "../src/platformCommandsV3";
import rectangleFoundationFixture from "./fixtures/rectangle-foundation.json";

describe("DeckDesign v3 platform commands", () => {
  it("duplicates a normalized platform at an exact recorded elevation", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const original = JSON.stringify(design);
    const result = duplicatePlatformV3(design, "platform-1", "upper-platform", 84.25);
    expect(result.command).toBe("duplicate_platform");
    expect(result.design.metadata.revision).toBe(design.metadata.revision + 1);
    expect(result.design.platforms).toHaveLength(2);
    expect(result.design.platforms[1]).toEqual({ ...result.design.platforms[0], id: "upper-platform", elevation: 84.25 });
    expect(result.notices.join(" ")).toMatch(/not inferred/i);
    expect(JSON.stringify(design)).toBe(original);
  });

  it("removes one platform without allowing an empty design", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const duplicated = duplicatePlatformV3(design, "platform-1", "upper-platform", 84).design;
    const removed = removePlatformV3(duplicated, "platform-1");
    expect(removed.command).toBe("remove_platform");
    expect(removed.design.platforms.map((platform) => platform.id)).toEqual(["upper-platform"]);
    expect(removed.design.metadata.revision).toBe(duplicated.metadata.revision + 1);
    expect(() => removePlatformV3(removed.design, "upper-platform")).toThrow(/at least one platform/);
  });

  it("round-trips duplicate and removal through immutable history", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    const duplicated = duplicatePlatformV3(design, "platform-1", "upper-platform", 96).design;
    const applied = designHistoryReducerV3(createHistoryV3(design), { type: "apply", design: duplicated });
    const removed = removePlatformV3(applied.present, "upper-platform").design;
    const afterRemoval = designHistoryReducerV3(applied, { type: "apply", design: removed });
    const undone = designHistoryReducerV3(afterRemoval, { type: "undo" });
    expect(afterRemoval.present.platforms).toHaveLength(1);
    expect(undone.present.platforms).toHaveLength(2);
    expect([applied.present, afterRemoval.present, undone.present].map((item) => item.metadata.revision)).toEqual([2, 3, 4]);
    expect(deriveDeckDesignProjectionV3(undone.present).platforms).toHaveLength(2);
  });

  it("rejects missing, duplicate, malformed, and excess platform identities", () => {
    const design = migrateDeckDesignToV3(rectangleFoundationFixture.design);
    expect(() => duplicatePlatformV3(design, "missing", "upper-platform", 84)).toThrow(/does not exist/);
    expect(() => duplicatePlatformV3(design, "platform-1", "platform-1", 84)).toThrow(/already exists/);
    expect(() => duplicatePlatformV3(design, "platform-1", "Upper Platform", 84)).toThrow(/stable lowercase/);
    let full = design;
    for (let index = 2; index <= 8; index += 1) {
      full = duplicatePlatformV3(full, "platform-1", `platform-${index}`, 36 + index * 12).design;
    }
    expect(() => duplicatePlatformV3(full, "platform-1", "platform-9", 144)).toThrow(/at most 8/);
    expect(() => removePlatformV3(full, "missing")).toThrow(/does not exist/);
  });
});
