import { normalizeMapPresentationInteraction, normalizeMapPresentationScene, normalizeMapViewport, normalizedMapCoordinate, type GeoJsonReferenceLayer, type MapBasePresentation, type MapPresentationInteraction, type MapPresentationInteractionSource, type MapPresentationScene, type MapViewport, type NormalizedMapCoordinate, type ReadOnlyMapPresentationAdapter, type RendererAvailability, type RendererAvailabilityEvent } from "./map-presentation";

type GoogleListener = Readonly<{ remove(): void }>;
type GoogleLatLng = Readonly<{ lat(): number; lng(): number }>;
type GoogleMapMouseEvent = Readonly<{ latLng: GoogleLatLng | null }>;
type GoogleMap = {
  data: { addGeoJson(value: unknown): unknown[]; forEach(callback: (feature: unknown) => void): void; remove(feature: unknown): void; setStyle(style: Record<string, unknown>): void };
  addListener(name: string, listener: (event?: GoogleMapMouseEvent) => void): GoogleListener;
  getCenter(): GoogleLatLng | null;
  getZoom(): number | undefined;
  getHeading(): number | undefined;
  getTilt(): number | undefined;
  setCenter(center: { lat: number; lng: number }): void;
  setMapTypeId(type: "satellite" | "hybrid"): void;
  setOptions(options: Record<string, unknown>): void;
  setZoom(zoom: number): void;
};
type GooglePolyline = { setMap(map: GoogleMap | null): void };
type GooglePolygon = { setMap(map: GoogleMap | null): void };
type GoogleCircle = { addListener(name: string, listener: (event?: GoogleMapMouseEvent) => void): GoogleListener; getCenter(): GoogleLatLng | null; setCenter(center: { lat: number; lng: number }): void; setMap(map: GoogleMap | null): void; setRadius(radius: number): void; setOptions(options: Record<string, unknown>): void };

export type GoogleMapsRuntime = Readonly<{
  Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  Polygon: new (options: Record<string, unknown>) => GooglePolygon;
  Circle: new (options: Record<string, unknown>) => GoogleCircle;
}>;

export type GoogleRuntimeLoader = (apiKey: string) => Promise<GoogleMapsRuntime>;

const SCRIPT_ID = "mckenzie-google-maps-js";
let runtimePromise: Promise<GoogleMapsRuntime> | null = null;

function browserGoogleRuntime(): GoogleMapsRuntime | null {
  const maps = (window as unknown as { google?: { maps?: GoogleMapsRuntime } }).google?.maps;
  return maps?.Map && maps.Polyline && maps.Polygon && maps.Circle ? maps : null;
}

export function loadGoogleMapsRuntime(apiKey: string): Promise<GoogleMapsRuntime> {
  if (!apiKey.trim()) return Promise.reject(new TypeError("A restricted non-Production Maps JavaScript key is required."));
  const existing = browserGoogleRuntime();
  if (existing) return Promise.resolve(existing);
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const callbackName = `__mckenzieMapGoogleReady${Date.now()}`;
    const host = window as unknown as Record<string, unknown>;
    const cleanup = () => { delete host[callbackName]; };
    host[callbackName] = () => {
      const runtime = browserGoogleRuntime();
      cleanup();
      if (!runtime) { runtimePromise = null; reject(new TypeError("Maps JavaScript loaded without its expected drawing primitives.")); return; }
      resolve(runtime);
    };
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${encodeURIComponent(callbackName)}`;
    script.onerror = () => { cleanup(); runtimePromise = null; reject(new TypeError("Google Maps could not load. The local domain model remains available without this presentation.")); };
    document.head.append(script);
  });
  return runtimePromise;
}

function numberCoordinate(value: NormalizedMapCoordinate) {
  return Object.freeze({ lat: Number(value.latitude), lng: Number(value.longitude) });
}

function normalizedLatLng(value: GoogleLatLng): NormalizedMapCoordinate {
  return normalizedMapCoordinate(value.lng().toFixed(7), value.lat().toFixed(7));
}

export class GoogleReadOnlyMapPresentationAdapter implements ReadOnlyMapPresentationAdapter, MapPresentationInteractionSource {
  private state: RendererAvailabilityEvent = Object.freeze({ status: "unmounted", reason: null });
  private runtime: GoogleMapsRuntime | null = null;
  private map: GoogleMap | null = null;
  private scene: MapPresentationScene | null = null;
  private viewport: MapViewport;
  private mapType: MapBasePresentation = "satellite";
  private parcel: GeoJsonReferenceLayer | null = null;
  private parcelVisible = true;
  private runOverlays: GooglePolyline[] = [];
  private polygonOverlays: GooglePolygon[] = [];
  private nodeOverlays: GoogleCircle[] = [];
  private locationDot: GoogleCircle | null = null;
  private accuracyCircle: GoogleCircle | null = null;
  private listeners: GoogleListener[] = [];
  private geometryListeners: GoogleListener[] = [];
  private readonly viewportListeners = new Set<(viewport: MapViewport) => void>();
  private readonly interactionListeners = new Set<(event: MapPresentationInteraction) => void>();
  private readonly availabilityListeners = new Set<(event: RendererAvailabilityEvent) => void>();

  constructor(private readonly apiKey: string, private readonly loader: GoogleRuntimeLoader = loadGoogleMapsRuntime, initialViewport: MapViewport = { center: normalizedMapCoordinate("-83.9200000", "35.9600000"), zoom: "19", bearing: "0", pitch: "0" }) {
    this.viewport = normalizeMapViewport(initialViewport);
  }

  async mount(container: HTMLElement) {
    if (!container) throw new TypeError("A renderer container is required.");
    if (this.state.status !== "unmounted") throw new TypeError("A renderer may mount only once.");
    try {
      this.runtime = await this.loader(this.apiKey);
      if (this.availability().status === "destroyed") return;
      this.map = new this.runtime.Map(container, {
        center: numberCoordinate(this.viewport.center), zoom: Number(this.viewport.zoom), mapTypeId: this.mapType,
        disableDefaultUI: true, mapTypeControl: false, clickableIcons: false, gestureHandling: "greedy", keyboardShortcuts: true,
      });
      this.listeners.push(this.map.addListener("click", (event) => {
        if (!event?.latLng) return;
        this.emitInteraction({ type: "map_press", coordinate: normalizedLatLng(event.latLng) });
      }));
      this.listeners.push(this.map.addListener("idle", () => this.emitViewport()));
      this.renderAll();
      this.updateAvailability("ready", null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Google Maps could not load.";
      this.updateAvailability("offline", reason);
      throw error;
    }
  }

  destroy() {
    if (this.state.status === "destroyed") return;
    this.clearGeometry();
    this.listeners.splice(0).forEach((listener) => listener.remove());
    this.locationDot?.setMap(null); this.accuracyCircle?.setMap(null);
    this.locationDot = null; this.accuracyCircle = null; this.map = null; this.runtime = null;
    this.updateAvailability("destroyed", null);
    this.viewportListeners.clear(); this.interactionListeners.clear(); this.availabilityListeners.clear();
  }

  availability() { return this.state; }

  setViewport(viewport: MapViewport) {
    this.viewport = normalizeMapViewport(viewport);
    if (!this.map) return;
    this.map.setCenter(numberCoordinate(this.viewport.center));
    this.map.setZoom(Number(this.viewport.zoom));
    this.map.setOptions({ heading: Number(this.viewport.bearing), tilt: Number(this.viewport.pitch) });
  }

  currentViewport() { return this.viewport; }

  showScene(scene: MapPresentationScene) {
    this.scene = normalizeMapPresentationScene(scene);
    if (this.map) this.renderScene();
  }

  setBasePresentation(type: MapBasePresentation) {
    this.mapType = type;
    this.map?.setMapTypeId(type);
  }

  showReferenceLayer(parcel: GeoJsonReferenceLayer | null) {
    this.parcel = parcel;
    if (this.map) this.renderParcel();
  }

  setReferenceLayerVisible(visible: boolean) {
    this.parcelVisible = visible;
    if (this.map) this.renderParcel();
  }

  showObservationalLocation(coordinate: NormalizedMapCoordinate | null, accuracyMeters: number | null) {
    if (!this.map || !this.runtime) return;
    if (!coordinate) { this.locationDot?.setMap(null); this.accuracyCircle?.setMap(null); return; }
    const center = numberCoordinate(coordinate);
    if (!this.locationDot) this.locationDot = new this.runtime.Circle({ map: this.map, center, radius: 1.2, clickable: false, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, zIndex: 30 });
    else { this.locationDot.setMap(this.map); this.locationDot.setCenter(center); }
    if (accuracyMeters !== null && Number.isFinite(accuracyMeters) && accuracyMeters >= 0) {
      if (!this.accuracyCircle) this.accuracyCircle = new this.runtime.Circle({ map: this.map, center, radius: accuracyMeters, clickable: false, fillColor: "#2563eb", fillOpacity: 0.12, strokeColor: "#2563eb", strokeOpacity: 0.7, strokeWeight: 1, zIndex: 20 });
      else { this.accuracyCircle.setMap(this.map); this.accuracyCircle.setCenter(center); this.accuracyCircle.setRadius(accuracyMeters); }
    } else this.accuracyCircle?.setMap(null);
  }

  onViewportChange(listener: (viewport: MapViewport) => void) { return this.subscribe(this.viewportListeners, listener); }
  onPresentationInteraction(listener: (event: MapPresentationInteraction) => void) { return this.subscribe(this.interactionListeners, listener); }
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void) { return this.subscribe(this.availabilityListeners, listener); }

  private renderAll() { this.renderScene(); this.renderParcel(); }

  private clearGeometry() {
    this.geometryListeners.splice(0).forEach((listener) => listener.remove());
    this.runOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    this.polygonOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    this.nodeOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
  }

  private renderScene() {
    this.clearGeometry();
    if (!this.map || !this.runtime || !this.scene) return;
    this.runOverlays = this.scene.polylines.map((line) => new this.runtime!.Polyline({
      map: this.map, path: line.coordinates.map(numberCoordinate), clickable: false, editable: false, geodesic: false,
      strokeColor: line.style.strokeColor, strokeOpacity: line.style.strokeOpacity, strokeWeight: line.style.strokeWidth, zIndex: 10,
    }));
    this.polygonOverlays = this.scene.polygons.map((polygon) => new this.runtime!.Polygon({
      map: this.map, paths: polygon.rings.map((ring) => ring.map(numberCoordinate)), clickable: false, editable: false, geodesic: false,
      strokeColor: polygon.style.strokeColor, strokeOpacity: polygon.style.strokeOpacity, strokeWeight: polygon.style.strokeWidth,
      fillColor: polygon.style.fillColor, fillOpacity: polygon.style.fillOpacity, zIndex: 9,
    }));
    this.nodeOverlays = this.scene.points.map((point) => {
      const circle = new this.runtime!.Circle({
        map: this.map, center: numberCoordinate(point.coordinate), radius: point.radiusMeters, draggable: point.draggable,
        fillColor: point.style.fillColor, fillOpacity: point.style.fillOpacity, strokeColor: point.style.strokeColor, strokeOpacity: point.style.strokeOpacity, strokeWeight: point.style.strokeWidth, zIndex: 15,
      });
      this.geometryListeners.push(circle.addListener("dragend", (event) => {
        const center = event?.latLng ?? circle.getCenter();
        if (center && point.draggable) this.emitInteraction({ type: "point_move", pointId: point.id, coordinate: normalizedLatLng(center) });
      }));
      return circle;
    });
  }

  private renderParcel() {
    if (!this.map) return;
    const existing: unknown[] = [];
    this.map.data.forEach((feature) => existing.push(feature));
    existing.forEach((feature) => this.map!.data.remove(feature));
    if (this.parcel && this.parcelVisible) this.map.data.addGeoJson(this.parcel);
    this.map.data.setStyle({ clickable: false, fillColor: "#22c55e", fillOpacity: 0.08, strokeColor: "#16a34a", strokeOpacity: 0.9, strokeWeight: 3, zIndex: 4 });
  }

  private emitViewport() {
    if (!this.map) return;
    const center = this.map.getCenter();
    if (!center) return;
    this.viewport = normalizeMapViewport({ center: normalizedLatLng(center), zoom: String(this.map.getZoom() ?? Number(this.viewport.zoom)), bearing: String(this.map.getHeading() ?? 0), pitch: String(this.map.getTilt() ?? 0) });
    this.viewportListeners.forEach((listener) => listener(this.viewport));
  }

  private emitInteraction(event: MapPresentationInteraction) {
    const normalized = normalizeMapPresentationInteraction(event);
    this.interactionListeners.forEach((listener) => listener(normalized));
  }

  private updateAvailability(status: RendererAvailability, reason: string | null) {
    this.state = Object.freeze({ status, reason });
    this.availabilityListeners.forEach((listener) => listener(this.state));
  }

  private subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
}
