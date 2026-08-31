import { describe, expect, it } from "vitest";
import { FenceGoogleMapRendererAdapter } from "../src/fence-map-renderer";
import { GoogleReadOnlyMapPresentationAdapter, type GoogleMapsRuntime } from "../src/google-map-renderer";
import type { FenceDraftEditEvent, FenceMapDisplayProjection } from "../src/map-contract";
import { normalizedMapCoordinate, type MapBasePresentation, type MapPresentationInteraction, type MapPresentationScene } from "../src/map-presentation";

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
  setMapTypeId(value: MapBasePresentation) { this.mapType = value; }
  setOptions(options: Record<string, unknown>) { this.heading = Number(options.heading ?? this.heading); this.tilt = Number(options.tilt ?? this.tilt); }
  setZoom(value: number) { this.zoom = value; }
}

class FakePolyline {
  static instances: FakePolyline[] = [];
  map: FakeMap | null;
  constructor(options: Record<string, unknown>) { this.map = options.map as FakeMap; FakePolyline.instances.push(this); }
  setMap(map: FakeMap | null) { this.map = map; }
}
class FakePolygon {
  static instances: FakePolygon[] = [];
  map: FakeMap | null;
  constructor(options: Record<string, unknown>) { this.map = options.map as FakeMap; FakePolygon.instances.push(this); }
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

const runtime = { Map: FakeMap, Polyline: FakePolyline, Polygon: FakePolygon, Circle: FakeCircle } as unknown as GoogleMapsRuntime;
const coordinate = normalizedMapCoordinate("-83.9200000", "35.9600000");
const second = normalizedMapCoordinate("-83.9199000", "35.9601000");
const projection: FenceMapDisplayProjection = { revision: "fence-1", nodes: [{ id: "a", coordinate, role: "endpoint" }, { id: "b", coordinate: second, role: "corner" }], runs: [{ id: "run", kind: "fence", coordinates: [coordinate, second] }] };
const style = { strokeColor: "#174f3c", strokeOpacity: 1, strokeWidth: 3, fillColor: "#ffffff", fillOpacity: 0.2 } as const;
const scene: MapPresentationScene = { revision: "generic-1", points: [{ id: "point", coordinate, radiusMeters: 0.5, draggable: true, style }], polylines: [{ id: "line", coordinates: [coordinate, second], style }], polygons: [{ id: "area", rings: [[coordinate, second, normalizedMapCoordinate("-83.9198000", "35.9600000")]], style }] };

describe("provider-neutral Google presentation adapter", () => {
  it("mounts generic immutable overlays, syncs reference/location layers, and destroys cleanly", async () => {
    FakeMap.instances = []; FakePolyline.instances = []; FakePolygon.instances = []; FakeCircle.instances = [];
    const adapter = new GoogleReadOnlyMapPresentationAdapter("restricted-test-key", async () => runtime);
    const interactions: MapPresentationInteraction[] = []; adapter.onPresentationInteraction((event) => interactions.push(event));
    adapter.showScene(scene);
    await adapter.mount({} as HTMLElement);
    const map = FakeMap.instances[0];
    expect(adapter.availability().status).toBe("ready");
    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakePolygon.instances).toHaveLength(1);
    expect(FakeCircle.instances).toHaveLength(1);
    for (const presentation of ["hybrid", "roadmap", "terrain", "satellite"] as const) {
      adapter.setBasePresentation(presentation);
      expect(map.mapType).toBe(presentation);
    }
    adapter.showReferenceLayer({ type: "FeatureCollection", features: [{ type: "Feature", properties: { layer: "parcel-reference" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.919, 35.961]] } }] });
    expect(map.dataFeatures).toHaveLength(1);
    adapter.setReferenceLayerVisible(false); expect(map.dataFeatures).toHaveLength(0);
    map.emit("click", { latLng: new LatLng(35.961, -83.919) });
    FakeCircle.instances[0].emit("dragend", { latLng: new LatLng(35.962, -83.918) });
    expect(interactions.map(({ type }) => type)).toEqual(["map_press", "point_move"]);
    adapter.showObservationalLocation(second, 8); expect(FakeCircle.instances).toHaveLength(3);
    adapter.destroy();
    expect(adapter.availability().status).toBe("destroyed");
    expect(FakePolyline.instances[0].map).toBeNull();
    expect(FakePolygon.instances[0].map).toBeNull();
  });

  it("fails offline without changing the supplied generic scene", async () => {
    const before = JSON.stringify(scene);
    const adapter = new GoogleReadOnlyMapPresentationAdapter("restricted-test-key", async () => { throw new Error("provider offline"); });
    adapter.showScene(scene);
    await expect(adapter.mount({} as HTMLElement)).rejects.toThrow("provider offline");
    expect(adapter.availability()).toEqual({ status: "offline", reason: "provider offline" });
    expect(JSON.stringify(scene)).toBe(before);
    adapter.destroy(); expect(adapter.availability().status).toBe("destroyed");
  });

  it("destroys safely when a provider returns an incomplete listener during partial initialization", async () => {
    class PartialCircle extends FakeCircle {
      addListener() { return undefined as unknown as Listener; }
    }
    const partialRuntime = { ...runtime, Circle: PartialCircle } as unknown as GoogleMapsRuntime;
    const adapter = new GoogleReadOnlyMapPresentationAdapter("restricted-test-key", async () => partialRuntime);
    adapter.showScene(scene);
    await adapter.mount({} as HTMLElement);
    expect(() => adapter.destroy()).not.toThrow();
    expect(adapter.availability().status).toBe("destroyed");
  });
});

describe("Fence-owned Google wrapper", () => {
  it("converts only generic presentation interactions into Fence draft events", async () => {
    FakeMap.instances = []; FakePolyline.instances = []; FakePolygon.instances = []; FakeCircle.instances = [];
    const adapter = new FenceGoogleMapRendererAdapter("restricted-test-key", async () => runtime);
    const edits: FenceDraftEditEvent[] = []; adapter.onDraftEdit((event: FenceDraftEditEvent) => edits.push(event));
    adapter.showDomainProjection(projection); await adapter.mount({} as HTMLElement);
    FakeMap.instances[0].emit("click", { latLng: new LatLng(35.961, -83.919) });
    FakeCircle.instances[0].emit("dragend", { latLng: new LatLng(35.962, -83.918) });
    expect(edits.map(({ type }) => type)).toEqual(["place_node", "move_node"]);
    adapter.destroy();
  });
});
