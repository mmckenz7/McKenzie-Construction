const KGIS_MAP_URL = "https://www.kgis.org/kgismaps/Map.htm";

export function kgisAddressMapUrl(address: string): string {
  const normalized = address.trim().replace(/\s+/g, " ");
  if (!normalized) throw new RangeError("Enter a Knox County street address.");
  if (normalized.length > 160) throw new RangeError("The address is too long.");
  const url = new URL(KGIS_MAP_URL);
  url.searchParams.set("map", "aerial2026");
  url.searchParams.set("address", normalized);
  return url.toString();
}
