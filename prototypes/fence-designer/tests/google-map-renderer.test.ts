import { describe, expect, it } from "vitest";
import { GoogleMapRendererAdapter, type GoogleMapsRuntime } from "../src/google-map-renderer";
import { normalizedMapCoordinate, type FenceDraftEditEvent, type FenceMapDisplayProjection } from "../src/map-contract";

class Listener { removed = false; constructor(readonly callback: (event?: unknown) => void) {} remove() { this.removed = true; } }
class LatLng { constructor(private readonly latitude: number, private readonly longitude: number) {} lat() { return this.latitude; } lng() { return this.longitude; } }

class FakeMap {
  static instances: FakeMap[] = [];
  readonly listeners = new Map<string, Listener[]>();
  center = new LatLng(35.96, -83.92); zoom = 19; heading = 0; tilt = 0; mapType = "satellite";
  readonly dataFeatures: unknown[] = [];
  readonly data = {
    addGeoJson: (value: unknown) => { this.dataFeatures.push(value); return [value]; },
    forEach: (callback: (feature: unknown) => void) => this.dataFeatures.slice().forEach(callback),
    remove: (feature: unknown) => { const index = this.dataFeatures.indexOf(feature); if (index >= 0) this.dataFeatures.splice(index, 1); },
    setStyle: (_style: Record<string, unknown>) => undefined,
  };
  constructor(_container: HTMLElement, options: Record<string, unknown>) { this.mapType = String(options.mapTypeId); FakeMap.instances.push(this); }
  addListener(name: string, callback: (event?: unknown) => void) { const listener = new Listener(callback); this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]); return listener; }
  emit(name: string, event?: unknown) { this.listeners.get(name)?.forEach((listener) => { if (!listener.removed) listener.callback(event); }); }
  getCenter() { return this.center; } getZoom() { return this.zoom; } getHeading() { return this.heading; } getTilt() { return this.tilt; }
  setCenter(value: { lat: number; lng: number }) { this.center = new LatLng(value.lat, value.lng); }
  setMapTypeId(value: "satellite" | "hybrid") { this.mapType = value; }
  setOptions(options: Record<string, unknown>) { this.heading = Number(options.heading ?? this.heading); this.tilt = Number(options.tilt ?? this.tilt); }
  setZoom(value: number) { this.zoom = value; }
}

class FakePolyline {
  static instances: FakePolyline[] = [];
  map: FakeMap | null;
  constructor(options: Record<string, unknown>) { this.map = options.map as FakeMap; FakePolyline.instances.push(this); }
  setMap(map: FakeMap | null) { this.map = map; }
}

class FakeCircle {
  static instances: FakeCircle[] = [];
  readonly listeners = new Map<string, Listener>();
  map: FakeMap | null; center: LatLng; radius: number;
  constructor(options: Record<string, unknown>) { const center = options.center as { lat: number; lng: number }; this.center = new LatLng(center.lat, center.lng); this.radius = Number(options.radius); this.map = options.map as FakeMap; FakeCircle.instances.push(this); }
  addListener(name: string, callback: (event?: unknown) => void) { const listener = new Listener(callback); this.listeners.set(name, listener); return listener; }
  getCenter() { return this.center; }
  setCenter(value: { lat: number; lng: number }) { this.center = new LatLng(value.lat, value.lng); }
  setMap(map: FakeMap | null) { this.map = map; }
  setRadius(value: number) { this.radius = value; }
  setOptions() {}
  emit(name: string, event?: unknown) { this.listeners.get(name)?.callback(event); }
}

const runtime = { Map: FakeMap, Polyline: FakePolyline, Circle: FakeCircle } as unknown as GoogleMapsRuntime;
const coordinate = normalizedMapCoordinate("-83.9200000", "35.9600000");
const second = normalizedMapCoordinate("-83.9199000", "35.9601000");
const projection: FenceMapDisplayProjection = { revision: "fence-1", nodes: [{ id: "a", coordinate, role: "endpoint" }, { id: "b", coordinate: second, role: "corner" }], runs: [{ id: "run", kind: "fence", coordinates: [coordinate, second] }] };

describe("Google candidate renderer adapter", () => {
  it("mounts, syncs independent layers, emits disposable draft edits, and destroys cleanly", async () => {
    FakeMap.instances = []; FakePolyline.instances = []; FakeCircle.instances = [];
    const adapter = new GoogleMapRendererAdapter("restricted-test-key", async () => runtime);
    const edits: FenceDraftEditEvent[] = []; adapter.onDraftEdit((event) => edits.push(event));
    adapter.showDomainProjection(projection);
    await adapter.mount({} as HTMLElement);
    const map = FakeMap.instances[0];
    expect(adapter.availability().status).toBe("ready");
    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakeCircle.instances).toHaveLength(2);
    adapter.setMapType("hybrid"); expect(map.mapType).toBe("hybrid");
    adapter.showParcelGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", properties: { layer: "parcel-reference" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.919, 35.961]] } }] });
    expect(map.dataFeatures).toHaveLength(1);
    adapter.setParcelVisible(false); expect(map.dataFeatures).toHaveLength(0);
    map.emit("click", { latLng: new LatLng(35.961, -83.919) });
    FakeCircle.instances[0].emit("dragend", { latLng: new LatLng(35.962, -83.918) });
    expect(edits.map(({ type }) => type)).toEqual(["place_node", "move_node"]);
    adapter.showLiveLocation(second, 8); expect(FakeCircle.instances).toHaveLength(4);
    adapter.destroy();
    expect(adapter.availability().status).toBe("destroyed");
    expect(FakePolyline.instances[0].map).toBeNull();
  });

  it("fails offline without changing the supplied McKenzie projection", async () => {
    const before = JSON.stringify(projection);
    const adapter = new GoogleMapRendererAdapter("restricted-test-key", async () => { throw new Error("provider offline"); });
    adapter.showDomainProjection(projection);
    await expect(adapter.mount({} as HTMLElement)).rejects.toThrow("provider offline");
    expect(adapter.availability()).toEqual({ status: "offline", reason: "provider offline" });
    expect(JSON.stringify(projection)).toBe(before);
    adapter.destroy(); expect(adapter.availability().status).toBe("destroyed");
  });
});
