import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../dist/index.js";

class Listener {
  constructor(callback) { this.callback = callback; this.removed = false; }
  remove() { this.removed = true; }
}
class LatLng {
  constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
  lat() { return this.latitude; }
  lng() { return this.longitude; }
}
class FakeMap {
  static instances = [];
  constructor(_container, options) {
    this.listeners = new Map(); this.center = new LatLng(35.96, -83.92); this.zoom = 19; this.heading = 0; this.tilt = 0; this.mapType = String(options.mapTypeId); this.dataFeatures = [];
    this.data = { addGeoJson: (value) => { this.dataFeatures.push(value); return [value]; }, forEach: (callback) => this.dataFeatures.slice().forEach(callback), remove: (feature) => { const index = this.dataFeatures.indexOf(feature); if (index >= 0) this.dataFeatures.splice(index, 1); }, setStyle: () => undefined };
    FakeMap.instances.push(this);
  }
  addListener(name, callback) { const listener = new Listener(callback); this.listeners.set(name, [...(this.listeners.get(name) || []), listener]); return listener; }
  emit(name, event) { for (const listener of this.listeners.get(name) || []) if (!listener.removed) listener.callback(event); }
  getCenter() { return this.center; } getZoom() { return this.zoom; } getHeading() { return this.heading; } getTilt() { return this.tilt; }
  setCenter(value) { this.center = new LatLng(value.lat, value.lng); } setMapTypeId(value) { this.mapType = value; }
  setOptions(options) { this.heading = Number(options.heading ?? this.heading); this.tilt = Number(options.tilt ?? this.tilt); } setZoom(value) { this.zoom = value; }
}
class FakePolyline { static instances = []; constructor(options) { this.map = options.map; FakePolyline.instances.push(this); } setMap(map) { this.map = map; } }
class FakePolygon { static instances = []; constructor(options) { this.map = options.map; FakePolygon.instances.push(this); } setMap(map) { this.map = map; } }
class FakeCircle {
  static instances = [];
  constructor(options) { this.listeners = new Map(); this.map = options.map; this.center = new LatLng(options.center.lat, options.center.lng); this.radius = Number(options.radius); FakeCircle.instances.push(this); }
  addListener(name, callback) { const listener = new Listener(callback); this.listeners.set(name, listener); return listener; }
  emit(name, event) { this.listeners.get(name)?.callback(event); } getCenter() { return this.center; }
  setCenter(value) { this.center = new LatLng(value.lat, value.lng); } setMap(map) { this.map = map; } setRadius(value) { this.radius = value; } setOptions() {}
}

const runtime = { Map: FakeMap, Polyline: FakePolyline, Polygon: FakePolygon, Circle: FakeCircle };
const coordinate = core.normalizedMapCoordinate("-83.9200000", "35.9600000");
const second = core.normalizedMapCoordinate("-83.9199000", "35.9601000");
const style = { strokeColor: "#174f3c", strokeOpacity: 1, strokeWidth: 3, fillColor: "#ffffff", fillOpacity: 0.2 };
const scene = { revision: "generic-1", points: [{ id: "point", coordinate, radiusMeters: 0.5, draggable: true, style }], polylines: [{ id: "line", coordinates: [coordinate, second], style }], polygons: [{ id: "area", rings: [[coordinate, second, core.normalizedMapCoordinate("-83.9198000", "35.9600000")]], style }] };

test("mounts injected provider overlays and destroys them cleanly", async () => {
  FakeMap.instances = []; FakePolyline.instances = []; FakePolygon.instances = []; FakeCircle.instances = [];
  const adapter = new core.GoogleReadOnlyMapPresentationAdapter("restricted-test-key", async () => runtime);
  const interactions = [];
  adapter.onPresentationInteraction((event) => interactions.push(event));
  adapter.showScene(scene);
  await adapter.mount({});
  const map = FakeMap.instances[0];
  assert.equal(adapter.availability().status, "ready");
  assert.equal(FakePolyline.instances.length, 1); assert.equal(FakePolygon.instances.length, 1); assert.equal(FakeCircle.instances.length, 1);
  adapter.setBasePresentation("hybrid"); assert.equal(map.mapType, "hybrid");
  adapter.showReferenceLayer({ type: "FeatureCollection", features: [{ type: "Feature", properties: { layer: "parcel-reference" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.919, 35.961]] } }] });
  assert.equal(map.dataFeatures.length, 1);
  map.emit("click", { latLng: new LatLng(35.961, -83.919) });
  FakeCircle.instances[0].emit("dragend", { latLng: new LatLng(35.962, -83.918) });
  assert.deepEqual(interactions.map(({ type }) => type), ["map_press", "point_move"]);
  adapter.destroy();
  assert.equal(adapter.availability().status, "destroyed");
  assert.equal(FakePolyline.instances[0].map, null); assert.equal(FakePolygon.instances[0].map, null);
});

test("fails offline without mutating the supplied scene", async () => {
  const before = JSON.stringify(scene);
  const adapter = new core.GoogleReadOnlyMapPresentationAdapter("restricted-test-key", async () => { throw new Error("provider offline"); });
  adapter.showScene(scene);
  await assert.rejects(adapter.mount({}), /provider offline/);
  assert.deepEqual(adapter.availability(), { status: "offline", reason: "provider offline" });
  assert.equal(JSON.stringify(scene), before);
});
