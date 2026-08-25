import { describe, expect, it } from "vitest";
import { normalizedPropertyAddress, propertyReferenceLinks } from "../src/property-reference";

describe("free property reference links", () => {
  it("normalizes an address and creates official reference destinations", () => {
    expect(normalizedPropertyAddress("  606   Main St  ")).toBe("606 Main St");
    const links = propertyReferenceLinks("606 Main St");
    expect(new URL(links.acres).origin).toBe("https://maps.acres.com");
    expect(new URL(links.googleMaps).searchParams.get("query")).toBe("606 Main St");
    expect(new URL(links.kgis).origin).toBe("https://www.kgis.org");
  });

  it("rejects blank and oversized addresses", () => {
    expect(() => propertyReferenceLinks(" ")).toThrow(/property address/i);
    expect(() => propertyReferenceLinks("x".repeat(161))).toThrow(/too long/i);
  });
});
