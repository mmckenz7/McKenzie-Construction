import { kgisAddressMapUrl } from "./kgis";

export type PropertyReferenceLinks = Readonly<{
  acres: string;
  googleMaps: string;
  kgis: string;
}>;

const ACRES_MAP_URL = "https://maps.acres.com/";
const GOOGLE_MAPS_SEARCH_URL = "https://www.google.com/maps/search/";

export function normalizedPropertyAddress(address: string): string {
  const normalized = address.trim().replace(/\s+/g, " ");
  if (!normalized) throw new RangeError("Enter a property address.");
  if (normalized.length > 160) throw new RangeError("The address is too long.");
  return normalized;
}

export function propertyReferenceLinks(address: string): PropertyReferenceLinks {
  const normalized = normalizedPropertyAddress(address);
  const googleMaps = new URL(GOOGLE_MAPS_SEARCH_URL);
  googleMaps.searchParams.set("api", "1");
  googleMaps.searchParams.set("query", normalized);
  return Object.freeze({
    acres: ACRES_MAP_URL,
    googleMaps: googleMaps.toString(),
    kgis: kgisAddressMapUrl(normalized),
  });
}
