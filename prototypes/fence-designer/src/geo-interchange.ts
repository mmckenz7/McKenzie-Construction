import { pointById, type FenceDesign } from "./model";
import { normalizedMapCoordinate, type FenceMapDisplayProjection, type NormalizedMapCoordinate } from "./map-contract";

const EARTH_RADIUS_METERS = 6_378_137;

export type LocalGroundToWgs84Registration = Readonly<{
  localAnchor: Readonly<{ xMm: number; yMm: number }>;
  mapAnchor: NormalizedMapCoordinate;
  xAxisBearingDegrees: number;
}>;

export type ParcelGeoJson = Readonly<{
  type: "FeatureCollection";
  features: readonly Readonly<{
    type: "Feature";
    properties: Readonly<Record<string, string>>;
    geometry: Readonly<{
      type: "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
      coordinates: unknown;
    }>;
  }>[];
}>;

function wholeMillimeter(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must use integer millimeters.`);
  return value;
}

function bearing(value: number) {
  if (!Number.isFinite(value)) throw new TypeError("Registration bearing must be finite.");
  return ((value % 360) + 360) % 360;
}

export function normalizeGroundRegistration(input: LocalGroundToWgs84Registration): LocalGroundToWgs84Registration {
  return Object.freeze({
    localAnchor: Object.freeze({ xMm: wholeMillimeter(input.localAnchor.xMm, "Local anchor X"), yMm: wholeMillimeter(input.localAnchor.yMm, "Local anchor Y") }),
    mapAnchor: normalizedMapCoordinate(input.mapAnchor.longitude, input.mapAnchor.latitude),
    xAxisBearingDegrees: bearing(input.xAxisBearingDegrees),
  });
}

function coordinateString(value: number) {
  const rounded = Math.round(value * 10_000_000) / 10_000_000;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(7);
}

export function localGroundToMap(point: Readonly<{ xMm: number; yMm: number }>, input: LocalGroundToWgs84Registration): NormalizedMapCoordinate {
  const registration = normalizeGroundRegistration(input);
  const dxMeters = (wholeMillimeter(point.xMm, "Point X") - registration.localAnchor.xMm) / 1_000;
  const dyMeters = (wholeMillimeter(point.yMm, "Point Y") - registration.localAnchor.yMm) / 1_000;
  const bearingRadians = registration.xAxisBearingDegrees * Math.PI / 180;
  const eastMeters = Math.sin(bearingRadians) * dxMeters + Math.sin(bearingRadians + Math.PI / 2) * dyMeters;
  const northMeters = Math.cos(bearingRadians) * dxMeters + Math.cos(bearingRadians + Math.PI / 2) * dyMeters;
  const anchorLatitude = Number(registration.mapAnchor.latitude) * Math.PI / 180;
  const latitude = Number(registration.mapAnchor.latitude) + northMeters / EARTH_RADIUS_METERS * 180 / Math.PI;
  const longitude = Number(registration.mapAnchor.longitude) + eastMeters / (EARTH_RADIUS_METERS * Math.cos(anchorLatitude)) * 180 / Math.PI;
  return normalizedMapCoordinate(coordinateString(longitude), coordinateString(latitude));
}

export function mapToLocalGround(coordinate: NormalizedMapCoordinate, input: LocalGroundToWgs84Registration) {
  const registration = normalizeGroundRegistration(input);
  const normalized = normalizedMapCoordinate(coordinate.longitude, coordinate.latitude);
  const anchorLatitude = Number(registration.mapAnchor.latitude) * Math.PI / 180;
  const eastMeters = (Number(normalized.longitude) - Number(registration.mapAnchor.longitude)) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(anchorLatitude);
  const northMeters = (Number(normalized.latitude) - Number(registration.mapAnchor.latitude)) * Math.PI / 180 * EARTH_RADIUS_METERS;
  const bearingRadians = registration.xAxisBearingDegrees * Math.PI / 180;
  const dxMeters = Math.sin(bearingRadians) * eastMeters + Math.cos(bearingRadians) * northMeters;
  const dyMeters = Math.sin(bearingRadians + Math.PI / 2) * eastMeters + Math.cos(bearingRadians + Math.PI / 2) * northMeters;
  return Object.freeze({ xMm: registration.localAnchor.xMm + Math.round(dxMeters * 1_000), yMm: registration.localAnchor.yMm + Math.round(dyMeters * 1_000) });
}

export function projectFenceDesignToMap(design: FenceDesign, registration: LocalGroundToWgs84Registration): FenceMapDisplayProjection {
  const nodeCoordinates = new Map(design.points.map((point) => [point.id, localGroundToMap(point, registration)]));
  return Object.freeze({
    revision: `fence-${design.revision}`,
    nodes: Object.freeze(design.points.map((point) => Object.freeze({ id: point.id, coordinate: nodeCoordinates.get(point.id)!, role: design.segments.some(({ kind, fromPointId, toPointId }) => kind === "gate" && (fromPointId === point.id || toPointId === point.id)) ? "gate" as const : design.segments.filter(({ fromPointId, toPointId }) => fromPointId === point.id || toPointId === point.id).length < 2 ? "endpoint" as const : "corner" as const }))),
    runs: Object.freeze(design.segments.map((segment) => Object.freeze({ id: segment.id, kind: segment.kind, coordinates: Object.freeze([nodeCoordinates.get(segment.fromPointId)!, nodeCoordinates.get(segment.toPointId)!]) }))),
  });
}

function finiteCoordinatePair(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError("Parcel coordinates must be valid WGS84 longitude/latitude pairs.");
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
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
  const coordinates = text.trim().split(/\s+/).filter(Boolean).map((entry) => {
    const [longitude, latitude] = entry.split(",").map(Number);
    return finiteCoordinatePair([longitude, latitude]);
  });
  if (coordinates.length < 2) throw new TypeError("KML parcel lines require at least two coordinates.");
  return Object.freeze(coordinates);
}

export function parseParcelKml(text: string): ParcelGeoJson {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TypeError("KML document types and entities are not supported.");
  const features: ParcelGeoJson["features"][number][] = [];
  for (const match of text.matchAll(/<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi)) {
    features.push(Object.freeze({ type: "Feature", properties: Object.freeze({ layer: "parcel-reference" }), geometry: Object.freeze({ type: "LineString", coordinates: kmlCoordinateList(match[1]) }) }));
  }
  for (const match of text.matchAll(/<Polygon\b[^>]*>[\s\S]*?<outerBoundaryIs\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>[\s\S]*?<\/Polygon>/gi)) {
    features.push(Object.freeze({ type: "Feature", properties: Object.freeze({ layer: "parcel-reference" }), geometry: Object.freeze({ type: "Polygon", coordinates: Object.freeze([kmlCoordinateList(match[1])]) }) }));
  }
  return normalizeParcelGeoJson({ type: "FeatureCollection", features });
}

export function parseLocalParcelFile(name: string, text: string): ParcelGeoJson {
  const extension = name.toLowerCase().split(".").at(-1);
  if (extension === "kml") return parseParcelKml(text);
  if (extension !== "geojson" && extension !== "json") throw new TypeError("Choose a local GeoJSON, JSON, or KML parcel file.");
  try { return normalizeParcelGeoJson(JSON.parse(text)); }
  catch (error) { throw error instanceof SyntaxError ? new TypeError("The parcel GeoJSON is not valid JSON.") : error; }
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function fenceGeoJson(design: FenceDesign, registration: LocalGroundToWgs84Registration) {
  const projection = projectFenceDesignToMap(design, registration);
  return Object.freeze({
    type: "FeatureCollection" as const,
    properties: Object.freeze({ authority: "mckenzie-integer-mm", provenance: "not-attached", verification: "not-asserted" }),
    features: Object.freeze(projection.runs.map((run) => Object.freeze({
      type: "Feature" as const,
      id: run.id,
      properties: Object.freeze({ id: run.id, kind: run.kind, authority: "mckenzie-integer-mm", provenance: "not-attached", verification: "not-asserted" }),
      geometry: Object.freeze({ type: "LineString" as const, coordinates: Object.freeze(run.coordinates.map(({ longitude, latitude }) => Object.freeze([Number(longitude), Number(latitude)]))) }),
    }))),
  });
}

export function fenceKml(design: FenceDesign, registration: LocalGroundToWgs84Registration) {
  const projection = projectFenceDesignToMap(design, registration);
  const placemarks = projection.runs.map((run) => {
    const coordinates = run.coordinates.map(({ longitude, latitude }) => `${longitude},${latitude},0`).join(" ");
    return `<Placemark><name>${escapeXml(run.id)}</name><ExtendedData><Data name="kind"><value>${run.kind}</value></Data><Data name="authority"><value>mckenzie-integer-mm</value></Data><Data name="provenance"><value>not-attached</value></Data><Data name="verification"><value>not-asserted</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString></Placemark>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>McKenzie Fence Layout</name>${placemarks}</Document></kml>`;
}

export function registrationAtDesignOrigin(design: FenceDesign, mapAnchor: NormalizedMapCoordinate, xAxisBearingDegrees = 90): LocalGroundToWgs84Registration {
  const anchor = design.points.length ? pointById(design, design.points[0].id) : { xMm: 0, yMm: 0 };
  return normalizeGroundRegistration({ localAnchor: { xMm: anchor.xMm, yMm: anchor.yMm }, mapAnchor, xAxisBearingDegrees });
}
