import { describe, expect, it } from "vitest";
import { kgisAddressMapUrl } from "../src/kgis";

describe("KGIS property reference", () => {
  it("builds an official aerial address lookup without sending data through McKenzie OS", () => {
    const url = new URL(kgisAddressMapUrl("  606   Main St Ste 150 "));
    expect(url.origin).toBe("https://www.kgis.org");
    expect(url.pathname).toBe("/kgismaps/Map.htm");
    expect(url.searchParams.get("map")).toBe("aerial2026");
    expect(url.searchParams.get("address")).toBe("606 Main St Ste 150");
  });

  it("rejects an empty address", () => {
    expect(() => kgisAddressMapUrl("   ")).toThrow(/street address/i);
  });
});
