import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN } from "../src/model";
import { deriveDeckDesignProjectionV4 } from "../src/designProjectionV4";
import { deriveDeckDesignProjectionV5 } from "../src/designProjectionV5";
import { setEdgeFinishIntentV5 } from "../src/finishEditorV5";
import { createHistoryV5, designHistoryReducerV5 } from "../src/historyV5";
import { deckDesignV5ToV4Compatibility, migrateDeckDesignToV5, stableDeckDesignV5Json } from "../src/modelV5";
import { loadDeckDesignV5, saveDeckDesignV5, V5_STORAGE_KEY } from "../src/storageV5";
import { V4_STORAGE_KEY } from "../src/storageV4";
import rectangle from "./fixtures/rectangle-foundation.json";
import lShape from "./fixtures/l-shape-landing.json";

describe("v5 browser activation gates", () => {
  it.each([rectangle, lShape])("preserves v4 quantities when no finishes are selected", (fixture) => {
    const v5 = migrateDeckDesignToV5(fixture.design);
    const v4Projection = deriveDeckDesignProjectionV4(deckDesignV5ToV4Compatibility(v5));
    const v5Projection = deriveDeckDesignProjectionV5(v5);
    const amounts = (projection: typeof v4Projection | typeof v5Projection) => Object.fromEntries(projection.aggregateQuantities.map((line) => [line.key, { amount: line.amount, unit: line.unit, quantityClass: line.quantityClass }]));
    expect(amounts(v5Projection)).toEqual(amounts(v4Projection));
  });

  it("keeps finish changes monotonic through undo and redo", () => {
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    const free = base.platforms[0].edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const changed = setEdgeFinishIntentV5(base, "platform-1", free, { fasciaEnabled: true, skirtingEnabled: true });
    const applied = designHistoryReducerV5(createHistoryV5(base), { type: "apply", design: changed });
    const undone = designHistoryReducerV5(applied, { type: "undo" });
    const redone = designHistoryReducerV5(undone, { type: "redo" });
    expect([applied.present.metadata.revision, undone.present.metadata.revision, redone.present.metadata.revision]).toEqual([2, 3, 4]);
    expect(redone.present.platforms[0].construction.edgeFinishes).toHaveLength(1);
  });

  it("writes only v5 while preserving v4 fallback and fails closed on stale v5", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const base = migrateDeckDesignToV5(DEFAULT_DESIGN);
    values.set(V4_STORAGE_KEY, JSON.stringify(deckDesignV5ToV4Compatibility(base)));
    const loaded = loadDeckDesignV5(storage);
    expect(loaded.source).toBe("v4");
    expect(values.get(V4_STORAGE_KEY)).toBeTruthy();
    expect(values.get(V5_STORAGE_KEY)).toBe(stableDeckDesignV5Json(loaded.design!));
    const free = base.platforms[0].edgeConditions.find((condition) => condition.condition === "free")!.edgeId;
    const finished = setEdgeFinishIntentV5(base, "platform-1", free, { fasciaEnabled: true, skirtingEnabled: true });
    saveDeckDesignV5(storage, finished);
    expect(loadDeckDesignV5(storage).design?.platforms[0].construction.edgeFinishes).toEqual(finished.platforms[0].construction.edgeFinishes);
    values.set(V5_STORAGE_KEY, "{stale");
    const stale = loadDeckDesignV5(storage);
    expect(stale.source).toBe("invalid");
    expect(values.get(V4_STORAGE_KEY)).toBeTruthy();
  });
});
