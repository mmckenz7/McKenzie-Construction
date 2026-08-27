import type { GeoJsonReferenceLayer } from "./map-presentation.js";

export type ParcelGeoJson = GeoJsonReferenceLayer;

function finiteCoordinatePair(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError("Parcel coordinates must be valid WGS84 longitude/latitude pairs.");
  const longitude = Number(value[0]); const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) throw new TypeError("Parcel coordinates must be valid WGS84 longitude/latitude pairs.");
  return Object.freeze([longitude, latitude]);
}

function normalizeCoordinates(type: ParcelGeoJson["features"][number]["geometry"]["type"], coordinates: unknown): unknown {
  if (type === "LineString") {
    if (!Array.isArray(coordinates) || coordinates.length < 2) throw new TypeError("Parcel LineStrings require at least two positions.");
    return Object.freeze(coordinates.map(finiteCoordinatePair));
  }
  if (type === "MultiLineString" || type === "Polygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) throw new TypeError(`Parcel ${type} coordinates are empty.`);
    return Object.freeze(coordinates.map((line) => normalizeCoordinates("LineString", line)));
  }
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new TypeError("Parcel MultiPolygon coordinates are empty.");
  return Object.freeze(coordinates.map((polygon) => normalizeCoordinates("Polygon", polygon)));
}

export function normalizeParcelGeoJson(input: unknown): ParcelGeoJson {
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "FeatureCollection" || !Array.isArray((input as { features?: unknown }).features)) throw new TypeError("The parcel file must be a GeoJSON FeatureCollection.");
  const features = (input as { features: unknown[] }).features.map((value, index) => {
    if (!value || typeof value !== "object") throw new TypeError(`Parcel feature ${index + 1} is invalid.`);
    const feature = value as { type?: unknown; geometry?: { type?: unknown; coordinates?: unknown } | null };
    if (feature.type !== "Feature" || !feature.geometry) throw new TypeError(`Parcel feature ${index + 1} needs geometry.`);
    const type = feature.geometry.type;
    if (type !== "LineString" && type !== "MultiLineString" && type !== "Polygon" && type !== "MultiPolygon") throw new TypeError(`Parcel feature ${index + 1} uses an unsupported geometry type.`);
    const normalizedType: ParcelGeoJson["features"][number]["geometry"]["type"] = type;
    return Object.freeze({ type: "Feature" as const, properties: Object.freeze({ layer: "parcel-reference" }), geometry: Object.freeze({ type: normalizedType, coordinates: normalizeCoordinates(normalizedType, feature.geometry.coordinates) }) });
  });
  if (features.length === 0) throw new TypeError("The parcel file contains no supported features.");
  return Object.freeze({ type: "FeatureCollection", features: Object.freeze(features) });
}

function kmlCoordinateList(text: string) {
  const coordinates = text.trim().split(/\s+/).filter(Boolean).map((entry) => { const [longitude, latitude] = entry.split(",").map(Number); return finiteCoordinatePair([longitude, latitude]); });
  if (coordinates.length < 2) throw new TypeError("KML parcel lines require at least two coordinates.");
  return Object.freeze(coordinates);
}

export function parseParcelKml(text: string): ParcelGeoJson {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TypeError("KML document types and entities are not supported.");
  const features: ParcelGeoJson["features"][number][] = [];
  for (const match of text.matchAll(/<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi)) features.push(Object.freeze({ type: "Feature", properties: Object.freeze({ layer: "parcel-reference" }), geometry: Object.freeze({ type: "LineString", coordinates: kmlCoordinateList(match[1]) }) }));
  for (const match of text.matchAll(/<Polygon\b[^>]*>[\s\S]*?<outerBoundaryIs\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>[\s\S]*?<\/Polygon>/gi)) features.push(Object.freeze({ type: "Feature", properties: Object.freeze({ layer: "parcel-reference" }), geometry: Object.freeze({ type: "Polygon", coordinates: Object.freeze([kmlCoordinateList(match[1])]) }) }));
  return normalizeParcelGeoJson({ type: "FeatureCollection", features });
}

export function parseLocalParcelFile(name: string, text: string): ParcelGeoJson {
  const extension = name.toLowerCase().split(".").at(-1);
  if (extension === "kml") return parseParcelKml(text);
  if (extension !== "geojson" && extension !== "json") throw new TypeError("Choose a local GeoJSON, JSON, or KML parcel file.");
  try { return normalizeParcelGeoJson(JSON.parse(text)); }
  catch (error) { throw error instanceof SyntaxError ? new TypeError("The parcel GeoJSON is not valid JSON.") : error; }
}
