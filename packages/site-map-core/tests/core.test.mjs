import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../dist/index.js";

const a = core.normalizedMapCoordinate("-83.9200000", "35.9600000");
const b = core.normalizedMapCoordinate("-83.9199000", "35.9601000");
const c = core.normalizedMapCoordinate("-83.9198000", "35.9600000");
const style = Object.freeze({ strokeColor: "#174f3c", strokeOpacity: 1, strokeWidth: 3, fillColor: "#ffffff", fillOpacity: 0.2 });
const scene = Object.freeze({
  revision: "domain-7",
  points: Object.freeze([{ id: "point-a", coordinate: a, radiusMeters: 0.5, draggable: false, style }]),
  polylines: Object.freeze([{ id: "line-a", coordinates: Object.freeze([a, b]), style }]),
  polygons: Object.freeze([{ id: "polygon-a", rings: Object.freeze([Object.freeze([a, b, c])]), style }]),
});

test("normalizes immutable provider-neutral scenes", () => {
  const normalized = core.normalizeMapPresentationScene(scene);
  assert.deepEqual(normalized, scene);
  assert.equal(Object.isFrozen(normalized.points), true);
  assert.equal(Object.isFrozen(normalized.polylines[0].coordinates), true);
  assert.doesNotMatch(JSON.stringify(normalized), /fence|deck|takeoff/i);
});

test("keeps lifecycle and reference state independent from the scene", async () => {
  const harness = new core.ReadOnlyMapPresentationContractHarness({ center: a, zoom: "19", bearing: "0", pitch: "0" });
  await harness.mount({});
  harness.showScene(scene);
  harness.setBasePresentation("hybrid");
  harness.showReferenceLayer({ type: "FeatureCollection", features: [{ type: "Feature", properties: { layer: "parcel-reference" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.9199, 35.9601]] } }] });
  harness.showObservationalLocation(b, 8);
  harness.reportOffline("tiles unavailable");
  assert.equal(harness.snapshot().scene.revision, "domain-7");
  harness.destroy();
  assert.equal(harness.availability().status, "destroyed");
});

test("rejects duplicate IDs and provider instances", () => {
  assert.throws(() => core.normalizeMapPresentationScene({ ...scene, polylines: [{ ...scene.polylines[0], id: "point-a" }] }), /unique/i);
  class ProviderPoint { constructor() { Object.assign(this, scene.points[0]); } }
  assert.throws(() => core.normalizeMapPresentationScene({ ...scene, points: [new ProviderPoint()] }), /provider or class instance/i);
});

test("round-trips integer-millimeter local ground coordinates", () => {
  assert.equal(core.SITE_MAP_GROUND_PLANE, "MCKENZIE_LOCAL_MM");
  const registration = { localAnchor: { xMm: 1000, yMm: 2000 }, mapAnchor: a, xAxisBearingDegrees: 37 };
  const point = { xMm: 7096, yMm: 5048 };
  const roundTrip = core.mapToLocalGround(core.localGroundToMap(point, registration), registration);
  assert.ok(Math.abs(roundTrip.xMm - point.xMm) <= 7);
  assert.ok(Math.abs(roundTrip.yMm - point.yMm) <= 7);
});

test("sanitizes GeoJSON and KML parcel references", () => {
  const parcel = core.normalizeParcelGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", properties: { customer: "discard" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.919, 35.961]] } }] });
  assert.deepEqual(parcel.features[0].properties, { layer: "parcel-reference" });
  assert.throws(() => core.normalizeParcelGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-83.92, 35.96] } }] }), /unsupported/i);
  const kml = core.parseLocalParcelFile("parcel.kml", "<kml><LineString><coordinates>-83.92,35.96,0 -83.919,35.961,0</coordinates></LineString></kml>");
  assert.equal(kml.features[0].geometry.type, "LineString");
  assert.throws(() => core.parseLocalParcelFile("parcel.kml", '<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>'), /entities/i);
});

test("uses observational accuracy tiers without verification", () => {
  assert.equal(core.locationAccuracyTier(5), "best-observational");
  assert.equal(core.locationAccuracyTier(15), "caution");
  assert.equal(core.locationAccuracyTier(15.01), "rejected");
});
