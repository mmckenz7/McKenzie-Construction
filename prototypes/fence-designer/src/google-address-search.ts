import { loadGoogleMapsRuntime } from "./google-map-renderer";
import type { AddressSearchAdapter, AddressSearchCandidate } from "./map-contract";
import { normalizedMapCoordinate } from "./map-presentation";

type GoogleGeocoderResult = Readonly<{
  place_id: string;
  formatted_address: string;
  geometry: Readonly<{ location: Readonly<{ lat(): number; lng(): number }> }>;
}>;

type GoogleGeocoder = Readonly<{
  geocode(request: Readonly<{ address: string; componentRestrictions: Readonly<{ country: "US" }>; region: "us" }>): Promise<Readonly<{ results: readonly GoogleGeocoderResult[] }>>;
}>;

type GoogleGeocodingLibrary = Readonly<{ Geocoder: new () => GoogleGeocoder }>;
type GoogleGeocodingRuntime = Readonly<{ importLibrary(name: "geocoding"): Promise<GoogleGeocodingLibrary> }>;
export type GoogleGeocodingLoader = (apiKey: string) => Promise<GoogleGeocodingRuntime>;

const GOOGLE_TERMS_VERSION = "https://cloud.google.com/maps-platform/terms";

async function browserGoogleGeocodingRuntime(apiKey: string): Promise<GoogleGeocodingRuntime> {
  await loadGoogleMapsRuntime(apiKey);
  const maps = (window as unknown as { google?: { maps?: Partial<GoogleGeocodingRuntime> } }).google?.maps;
  if (!maps?.importLibrary) throw new TypeError("Google address search is unavailable. The map remains usable without it.");
  return maps as GoogleGeocodingRuntime;
}

function addressQuery(value: string) {
  const query = value.trim();
  if (!query || query.length > 200) throw new TypeError("Enter an address of 200 characters or fewer.");
  return query;
}

export class GoogleAddressSearchAdapter implements AddressSearchAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly loader: GoogleGeocodingLoader = browserGoogleGeocodingRuntime,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async search(value: string): Promise<readonly AddressSearchCandidate[]> {
    const query = addressQuery(value);
    const runtime = await this.loader(this.apiKey);
    const { Geocoder } = await runtime.importLibrary("geocoding");
    const response = await new Geocoder().geocode({ address: query, componentRestrictions: { country: "US" }, region: "us" });
    const seen = new Set<string>();
    return Object.freeze(response.results.flatMap((result) => {
      if (!result.place_id || seen.has(result.place_id)) return [];
      seen.add(result.place_id);
      return [Object.freeze({
        resultId: result.place_id,
        displayLabel: result.formatted_address,
        coordinate: normalizedMapCoordinate(result.geometry.location.lng().toFixed(7), result.geometry.location.lat().toFixed(7)),
        provider: Object.freeze({
          providerId: "google-maps-geocoder",
          termsVersion: GOOGLE_TERMS_VERSION,
          attribution: "Google Maps",
          storagePolicy: "provider_specific" as const,
          retrievedAt: this.now(),
        }),
      })];
    }).slice(0, 5));
  }
}
