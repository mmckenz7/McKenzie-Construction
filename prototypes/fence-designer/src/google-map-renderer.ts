import { normalizeDisplayProjection, normalizeDraftEditEvent, normalizeMapViewport, normalizedMapCoordinate, type FenceDraftEditEvent, type FenceMapDisplayProjection, type FenceMapRendererAdapter, type MapViewport, type NormalizedMapCoordinate, type RendererAvailability, type RendererAvailabilityEvent } from "./map-contract";
import type { ParcelGeoJson } from "./geo-interchange";

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
type GoogleCircle = { addListener(name: string, listener: (event?: GoogleMapMouseEvent) => void): GoogleListener; getCenter(): GoogleLatLng | null; setCenter(center: { lat: number; lng: number }): void; setMap(map: GoogleMap | null): void; setRadius(radius: number): void; setOptions(options: Record<string, unknown>): void };

export type GoogleMapsRuntime = Readonly<{
  Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  Circle: new (options: Record<string, unknown>) => GoogleCircle;
}>;

export type GoogleRuntimeLoader = (apiKey: string) => Promise<GoogleMapsRuntime>;

const SCRIPT_ID = "mckenzie-google-maps-js";
let runtimePromise: Promise<GoogleMapsRuntime> | null = null;

function browserGoogleRuntime(): GoogleMapsRuntime | null {
  const maps = (window as unknown as { google?: { maps?: GoogleMapsRuntime } }).google?.maps;
  return maps?.Map && maps.Polyline && maps.Circle ? maps : null;
}

export function loadGoogleMapsRuntime(apiKey: string): Promise<GoogleMapsRuntime> {
  if (!apiKey.trim()) return Promise.reject(new TypeError("A restricted non-Production Maps JavaScript key is required."));
  const existing = browserGoogleRuntime();
  if (existing) return Promise.resolve(existing);
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const callbackName = `__mckenzieFenceGoogleReady${Date.now()}`;
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
    script.onerror = () => { cleanup(); runtimePromise = null; reject(new TypeError("Google Maps could not load. The Fence design remains available in the local renderer.")); };
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

export class GoogleMapRendererAdapter implements FenceMapRendererAdapter {
  private state: RendererAvailabilityEvent = Object.freeze({ status: "unmounted", reason: null });
  private runtime: GoogleMapsRuntime | null = null;
  private map: GoogleMap | null = null;
  private projection: FenceMapDisplayProjection | null = null;
  private viewport: MapViewport;
  private mapType: "satellite" | "hybrid" = "satellite";
  private parcel: ParcelGeoJson | null = null;
  private parcelVisible = true;
  private runOverlays: GooglePolyline[] = [];
  private nodeOverlays: GoogleCircle[] = [];
  private locationDot: GoogleCircle | null = null;
  private accuracyCircle: GoogleCircle | null = null;
  private listeners: GoogleListener[] = [];
  private geometryListeners: GoogleListener[] = [];
  private readonly viewportListeners = new Set<(viewport: MapViewport) => void>();
  private readonly draftListeners = new Set<(event: FenceDraftEditEvent) => void>();
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
        this.emitDraft({ type: "place_node", coordinate: normalizedLatLng(event.latLng) });
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
    this.viewportListeners.clear(); this.draftListeners.clear(); this.availabilityListeners.clear();
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

  showDomainProjection(projection: FenceMapDisplayProjection) {
    this.projection = normalizeDisplayProjection(projection);
    if (this.map) this.renderFence();
  }

  setMapType(type: "satellite" | "hybrid") {
    this.mapType = type;
    this.map?.setMapTypeId(type);
  }

  showParcelGeoJson(parcel: ParcelGeoJson | null) {
    this.parcel = parcel;
    if (this.map) this.renderParcel();
  }

  setParcelVisible(visible: boolean) {
    this.parcelVisible = visible;
    if (this.map) this.renderParcel();
  }

  showLiveLocation(coordinate: NormalizedMapCoordinate | null, accuracyMeters: number | null) {
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
  onDraftEdit(listener: (event: FenceDraftEditEvent) => void) { return this.subscribe(this.draftListeners, listener); }
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void) { return this.subscribe(this.availabilityListeners, listener); }

  private renderAll() { this.renderFence(); this.renderParcel(); }

  private clearGeometry() {
    this.geometryListeners.splice(0).forEach((listener) => listener.remove());
    this.runOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    this.nodeOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
  }

  private renderFence() {
    this.clearGeometry();
    if (!this.map || !this.runtime || !this.projection) return;
    this.runOverlays = this.projection.runs.map((run) => new this.runtime!.Polyline({
      map: this.map, path: run.coordinates.map(numberCoordinate), clickable: false, editable: false, geodesic: false,
      strokeColor: run.kind === "gate" ? "#d97706" : "#174f3c", strokeOpacity: 1, strokeWeight: run.kind === "gate" ? 7 : 5, zIndex: 10,
    }));
    this.nodeOverlays = this.projection.nodes.map((node) => {
      const circle = new this.runtime!.Circle({
        map: this.map, center: numberCoordinate(node.coordinate), radius: node.role === "gate" ? 0.7 : 0.55, draggable: true,
        fillColor: node.role === "gate" ? "#d97706" : "#ffffff", fillOpacity: 1, strokeColor: "#174f3c", strokeWeight: 2, zIndex: 15,
      });
      this.geometryListeners.push(circle.addListener("dragend", (event) => {
        const center = event?.latLng ?? circle.getCenter();
        if (center) this.emitDraft({ type: "move_node", nodeId: node.id, coordinate: normalizedLatLng(center) });
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

  private emitDraft(event: FenceDraftEditEvent) {
    const normalized = normalizeDraftEditEvent(event);
    this.draftListeners.forEach((listener) => listener(normalized));
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
