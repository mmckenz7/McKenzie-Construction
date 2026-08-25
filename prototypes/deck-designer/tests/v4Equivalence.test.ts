import { describe, expect, it } from "vitest";
import { deriveDeckDesignProjectionV3 } from "../src/designProjectionV3";
import { deriveDeckDesignProjectionV4 } from "../src/designProjectionV4";
import { migrateDeckDesignToV3 } from "../src/modelV3";
import { migrateDeckDesignToV4 } from "../src/modelV4";
import rectangle from "./fixtures/rectangle-foundation.json";
import lShape from "./fixtures/l-shape-landing.json";

describe("v3 to v4 single-beam equivalence gate", () => {
  it.each([rectangle, lShape])("preserves $design.name deterministic quantity amounts", (fixture) => {
    const v3 = deriveDeckDesignProjectionV3(migrateDeckDesignToV3(fixture.design));
    const v4 = deriveDeckDesignProjectionV4(migrateDeckDesignToV4(fixture.design));
    const amounts = (projection: typeof v3 | typeof v4) => Object.fromEntries(projection.aggregateQuantities.map((line) => [line.key, { amount: line.amount, unit: line.unit, quantityClass: line.quantityClass }]));
    expect(amounts(v4)).toEqual(amounts(v3));
  });
});
