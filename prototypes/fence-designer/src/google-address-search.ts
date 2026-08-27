import { loadGoogleMapsRuntime } from "./google-map-renderer";
import type { AddressSearchAdapter, AddressSearchCandidate } from "./map-contract";
import { normalizedMapCoordinate } from "./map-presentation";

type GooglePlaceResult = Readonly<{
  id: string;
  formattedAddress?: string | null;
  location?: Readonly<{ lat(): number; lng(): number }> | null;
}>;

type GooglePlaceClass = Readonly<{
  searchByText(request: Readonly<{
    textQuery: string;
    fields: readonly ["id", "formattedAddress", "location"];
    maxResultCount: 5;
    region: "us";
    language: "en-US";
  }>): Promise<Readonly<{ places: readonly GooglePlaceResult[] }>>;
}>;

type GooglePlacesLibrary = Readonly<{ Place: GooglePlaceClass }>;
type GooglePlacesRuntime = Readonly<{ importLibrary(name: "places"): Promise<GooglePlacesLibrary> }>;
export type GooglePlacesLoader = (apiKey: string) => Promise<GooglePlacesRuntime>;

const GOOGLE_TERMS_VERSION = "https://cloud.google.com/maps-platform/terms";

async function browserGooglePlacesRuntime(apiKey: string): Promise<GooglePlacesRuntime> {
  await loadGoogleMapsRuntime(apiKey);
  const maps = (window as unknown as { google?: { maps?: Partial<GooglePlacesRuntime> } }).google?.maps;
  if (!maps?.importLibrary) throw new TypeError("Google Places address search is unavailable. The map remains usable without it.");
  return maps as GooglePlacesRuntime;
}

function addressQuery(value: string) {
  const query = value.trim();
  if (!query || query.length > 200) throw new TypeError("Enter an address of 200 characters or fewer.");
  return query;
}

export class GoogleAddressSearchAdapter implements AddressSearchAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly loader: GooglePlacesLoader = browserGooglePlacesRuntime,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async search(value: string): Promise<readonly AddressSearchCandidate[]> {
    const query = addressQuery(value);
    const runtime = await this.loader(this.apiKey);
    const { Place } = await runtime.importLibrary("places");
    const response = await Place.searchByText({ textQuery: query, fields: ["id", "formattedAddress", "location"], maxResultCount: 5, region: "us", language: "en-US" });
    const seen = new Set<string>();
    return Object.freeze(response.places.flatMap((result) => {
      if (!result.id || !result.formattedAddress || !result.location || seen.has(result.id)) return [];
      seen.add(result.id);
      return [Object.freeze({
        resultId: result.id,
        displayLabel: result.formattedAddress,
        coordinate: normalizedMapCoordinate(result.location.lng().toFixed(7), result.location.lat().toFixed(7)),
        provider: Object.freeze({
          providerId: "google-maps-places-new",
          termsVersion: GOOGLE_TERMS_VERSION,
          attribution: "Google Maps",
          storagePolicy: "provider_specific" as const,
          retrievedAt: this.now(),
        }),
      })];
    }).slice(0, 5));
  }
}
