import { describe, expect, it } from "vitest";
import { GoogleAddressSearchAdapter, type GoogleGeocodingLoader } from "../src/google-address-search";

const location = (latitude: number, longitude: number) => ({ lat: () => latitude, lng: () => longitude });

function loader(results: readonly Readonly<{ place_id: string; formatted_address: string; geometry: Readonly<{ location: ReturnType<typeof location> }> }>[]): GoogleGeocodingLoader {
  return async () => ({
    importLibrary: async () => ({ Geocoder: class { async geocode(request: unknown) { expect(request).toEqual({ address: "6849 Reddege Road, Knoxville, TN", componentRestrictions: { country: "US" }, region: "us" }); return { results }; } } }),
  });
}

describe("Google address-search candidate adapter", () => {
  it("returns deterministic provider-neutral candidates without retaining the query", async () => {
    const adapter = new GoogleAddressSearchAdapter("restricted-test-key", loader([
      { place_id: "place-1", formatted_address: "6849 Reddege Rd, Knoxville, TN 37918", geometry: { location: location(36.0583431, -83.9537915) } },
      { place_id: "place-1", formatted_address: "duplicate", geometry: { location: location(0, 0) } },
    ]), () => "2026-08-27T17:00:00.000Z");
    const results = await adapter.search("  6849 Reddege Road, Knoxville, TN  ");
    expect(results).toEqual([{ resultId: "place-1", displayLabel: "6849 Reddege Rd, Knoxville, TN 37918", coordinate: { longitude: "-83.9537915", latitude: "36.0583431" }, provider: { providerId: "google-maps-geocoder", termsVersion: "https://cloud.google.com/maps-platform/terms", attribution: "Google Maps", storagePolicy: "provider_specific", retrievedAt: "2026-08-27T17:00:00.000Z" } }]);
    expect(Object.isFrozen(results)).toBe(true);
  });

  it("fails closed for invalid queries and provider failures", async () => {
    let providerLoaded = false;
    const adapter = new GoogleAddressSearchAdapter("restricted-test-key", async (apiKey) => {
      providerLoaded = true;
      return loader([])(apiKey);
    });
    await expect(adapter.search("   ")).rejects.toThrow("Enter an address");
    expect(providerLoaded).toBe(false);
    await expect(new GoogleAddressSearchAdapter("restricted-test-key", async () => { throw new Error("provider offline"); }).search("Knoxville")).rejects.toThrow("provider offline");
  });

  it("limits results to five and preserves unique provider result ids", async () => {
    const results = Array.from({ length: 7 }, (_, index) => ({ place_id: `place-${index}`, formatted_address: `Address ${index}`, geometry: { location: location(36 + index / 100, -84) } }));
    const candidates = await new GoogleAddressSearchAdapter("restricted-test-key", loader(results)).search("6849 Reddege Road, Knoxville, TN");
    expect(candidates).toHaveLength(5);
    expect(candidates.map(({ resultId }) => resultId)).toEqual(["place-0", "place-1", "place-2", "place-3", "place-4"]);
  });
});
