import { localGroundToMap, normalizeGroundRegistration, type LocalGroundToWgs84Registration } from "./ground-registration";
import type { FenceMapDisplayProjection } from "./map-contract";
import type { NormalizedMapCoordinate } from "./map-presentation";
import { pointById, type FenceDesign } from "./model";

export function projectFenceDesignToMap(design: FenceDesign, registration: LocalGroundToWgs84Registration): FenceMapDisplayProjection {
  const nodeCoordinates = new Map(design.points.map((point) => [point.id, localGroundToMap(point, registration)]));
  return Object.freeze({
    revision: `fence-${design.revision}`,
    nodes: Object.freeze(design.points.map((point) => Object.freeze({ id: point.id, coordinate: nodeCoordinates.get(point.id)!, role: design.segments.some(({ kind, fromPointId, toPointId }) => kind === "gate" && (fromPointId === point.id || toPointId === point.id)) ? "gate" as const : design.segments.filter(({ fromPointId, toPointId }) => fromPointId === point.id || toPointId === point.id).length < 2 ? "endpoint" as const : "corner" as const }))),
    runs: Object.freeze(design.segments.map((segment) => Object.freeze({ id: segment.id, kind: segment.kind, coordinates: Object.freeze([nodeCoordinates.get(segment.fromPointId)!, nodeCoordinates.get(segment.toPointId)!]) }))),
  });
}

function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }

export function fenceGeoJson(design: FenceDesign, registration: LocalGroundToWgs84Registration) {
  const projection = projectFenceDesignToMap(design, registration);
  return Object.freeze({
    type: "FeatureCollection" as const,
    properties: Object.freeze({ authority: "mckenzie-integer-mm", provenance: "not-attached", verification: "not-asserted" }),
    features: Object.freeze(projection.runs.map((run) => Object.freeze({ type: "Feature" as const, id: run.id, properties: Object.freeze({ id: run.id, kind: run.kind, authority: "mckenzie-integer-mm", provenance: "not-attached", verification: "not-asserted" }), geometry: Object.freeze({ type: "LineString" as const, coordinates: Object.freeze(run.coordinates.map(({ longitude, latitude }) => Object.freeze([Number(longitude), Number(latitude)]))) }) }))),
  });
}

export function fenceKml(design: FenceDesign, registration: LocalGroundToWgs84Registration) {
  const projection = projectFenceDesignToMap(design, registration);
  const placemarks = projection.runs.map((run) => { const coordinates = run.coordinates.map(({ longitude, latitude }) => `${longitude},${latitude},0`).join(" "); return `<Placemark><name>${escapeXml(run.id)}</name><ExtendedData><Data name="kind"><value>${run.kind}</value></Data><Data name="authority"><value>mckenzie-integer-mm</value></Data><Data name="provenance"><value>not-attached</value></Data><Data name="verification"><value>not-asserted</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString></Placemark>`; }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>McKenzie Fence Layout</name>${placemarks}</Document></kml>`;
}

export function registrationAtDesignOrigin(design: FenceDesign, mapAnchor: NormalizedMapCoordinate, xAxisBearingDegrees = 90): LocalGroundToWgs84Registration {
  const anchor = design.points.length ? pointById(design, design.points[0].id) : { xMm: 0, yMm: 0 };
  return normalizeGroundRegistration({ localAnchor: { xMm: anchor.xMm, yMm: anchor.yMm }, mapAnchor, xAxisBearingDegrees });
}
