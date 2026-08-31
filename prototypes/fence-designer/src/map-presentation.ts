export type NormalizedMapCoordinate = Readonly<{ longitude: string; latitude: string }>;
export type MapViewport = Readonly<{ center: NormalizedMapCoordinate; zoom: string; bearing: string; pitch: string }>;
export type MapBasePresentation = "satellite" | "hybrid" | "roadmap" | "terrain";
export type RendererAvailability = "unmounted" | "ready" | "offline" | "destroyed";
export type RendererAvailabilityEvent = Readonly<{ status: RendererAvailability; reason: string | null }>;

export type MapOverlayStyle = Readonly<{
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
}>;

export type MapPointOverlay = Readonly<{
  id: string;
  coordinate: NormalizedMapCoordinate;
  radiusMeters: number;
  draggable: boolean;
  style: MapOverlayStyle;
}>;

export type MapPolylineOverlay = Readonly<{
  id: string;
  coordinates: readonly NormalizedMapCoordinate[];
  style: MapOverlayStyle;
}>;

export type MapPolygonOverlay = Readonly<{
  id: string;
  rings: readonly (readonly NormalizedMapCoordinate[])[];
  style: MapOverlayStyle;
}>;

export type MapPresentationScene = Readonly<{
  revision: string;
  points: readonly MapPointOverlay[];
  polylines: readonly MapPolylineOverlay[];
  polygons: readonly MapPolygonOverlay[];
}>;

export type GeoJsonReferenceLayer = Readonly<{
  type: "FeatureCollection";
  features: readonly Readonly<{
    type: "Feature";
    properties: Readonly<Record<string, string>>;
    geometry: Readonly<{ type: "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon"; coordinates: unknown }>;
  }>[];
}>;

export type MapPresentationInteraction =
  | Readonly<{ type: "map_press"; coordinate: NormalizedMapCoordinate }>
  | Readonly<{ type: "point_move"; pointId: string; coordinate: NormalizedMapCoordinate }>;

export interface ReadOnlyMapPresentationAdapter {
  mount(container: HTMLElement): Promise<void>;
  destroy(): void;
  availability(): RendererAvailabilityEvent;
  setViewport(viewport: MapViewport): void;
  currentViewport(): MapViewport;
  setBasePresentation(type: MapBasePresentation): void;
  showScene(scene: MapPresentationScene): void;
  showReferenceLayer(layer: GeoJsonReferenceLayer | null): void;
  setReferenceLayerVisible(visible: boolean): void;
  showObservationalLocation(coordinate: NormalizedMapCoordinate | null, accuracyMeters: number | null): void;
  onViewportChange(listener: (viewport: MapViewport) => void): () => void;
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void): () => void;
}

export interface MapPresentationInteractionSource {
  onPresentationInteraction(listener: (event: MapPresentationInteraction) => void): () => void;
}

const coordinatePattern = /^-?(?:0|[1-9][0-9]*)\.[0-9]{7}$/;
const decimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const colorPattern = /^(?:#[0-9a-f]{6}|[a-z]+)$/i;

function requiredText(value: string, label: string, maximum = 200) {
  const result = value.trim();
  if (!result || result.length > maximum) throw new TypeError(`${label} is required and must be ${maximum} characters or fewer.`);
  return result;
}

function boundedCoordinate(value: string, minimum: number, maximum: number, label: string) {
  if (!coordinatePattern.test(value) || Number(value) < minimum || Number(value) > maximum || Object.is(Number(value), -0)) throw new TypeError(`${label} must be a normalized seven-decimal WGS84 string.`);
  return value;
}

function decimal(value: string, label: string, minimum: number, maximum: number) {
  if (!decimalPattern.test(value) || Number(value) < minimum || Number(value) > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}

function unitInterval(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label} must be from zero through one.`);
  return value;
}

export function normalizedMapCoordinate(longitude: string, latitude: string): NormalizedMapCoordinate {
  return Object.freeze({ longitude: boundedCoordinate(longitude, -180, 180, "Longitude"), latitude: boundedCoordinate(latitude, -90, 90, "Latitude") });
}

export function normalizeMapViewport(input: MapViewport): MapViewport {
  return Object.freeze({ center: normalizedMapCoordinate(input.center.longitude, input.center.latitude), zoom: decimal(input.zoom, "Zoom", 0, 30), bearing: decimal(input.bearing, "Bearing", -360, 360), pitch: decimal(input.pitch, "Pitch", 0, 90) });
}

export function assertProviderNeutral(value: unknown, label = "Provider-neutral value"): void {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) { value.forEach((item, index) => assertProviderNeutral(item, `${label}[${index}]`)); return; }
  if (typeof value !== "object") throw new TypeError(`${label} contains an unsupported value.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} contains a provider or class instance.`);
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => assertProviderNeutral(item, `${label}.${key}`));
}

export function normalizeOverlayStyle(input: MapOverlayStyle): MapOverlayStyle {
  if (!colorPattern.test(input.strokeColor) || !colorPattern.test(input.fillColor)) throw new TypeError("Overlay colors must be simple named or six-digit hex colors.");
  if (!Number.isFinite(input.strokeWidth) || input.strokeWidth < 0 || input.strokeWidth > 30) throw new TypeError("Overlay stroke width must be from zero through 30 pixels.");
  return Object.freeze({ strokeColor: input.strokeColor, strokeOpacity: unitInterval(input.strokeOpacity, "Stroke opacity"), strokeWidth: input.strokeWidth, fillColor: input.fillColor, fillOpacity: unitInterval(input.fillOpacity, "Fill opacity") });
}

function normalizeCoordinates(coordinates: readonly NormalizedMapCoordinate[], label: string, minimum: number) {
  if (coordinates.length < minimum) throw new TypeError(`${label} requires at least ${minimum} coordinates.`);
  return Object.freeze(coordinates.map((coordinate) => normalizedMapCoordinate(coordinate.longitude, coordinate.latitude)));
}

export function normalizeMapPresentationScene(input: MapPresentationScene): MapPresentationScene {
  assertProviderNeutral(input, "Map presentation scene");
  const ids = [...input.points, ...input.polylines, ...input.polygons].map(({ id }) => requiredText(id, "Overlay ID", 100));
  if (new Set(ids).size !== ids.length) throw new TypeError("Map overlay IDs must be unique across the scene.");
  const points = input.points.map((point) => {
    if (!Number.isFinite(point.radiusMeters) || point.radiusMeters <= 0 || point.radiusMeters > 1_000) throw new TypeError("Point radius must be greater than zero and at most 1,000 meters.");
    return Object.freeze({ id: requiredText(point.id, "Point overlay ID", 100), coordinate: normalizedMapCoordinate(point.coordinate.longitude, point.coordinate.latitude), radiusMeters: point.radiusMeters, draggable: Boolean(point.draggable), style: normalizeOverlayStyle(point.style) });
  });
  const polylines = input.polylines.map((line) => Object.freeze({ id: requiredText(line.id, "Polyline overlay ID", 100), coordinates: normalizeCoordinates(line.coordinates, "Polyline", 2), style: normalizeOverlayStyle(line.style) }));
  const polygons = input.polygons.map((polygon) => {
    if (!polygon.rings.length) throw new TypeError("Polygon overlays require at least one ring.");
    return Object.freeze({ id: requiredText(polygon.id, "Polygon overlay ID", 100), rings: Object.freeze(polygon.rings.map((ring) => normalizeCoordinates(ring, "Polygon ring", 3))), style: normalizeOverlayStyle(polygon.style) });
  });
  return Object.freeze({ revision: requiredText(input.revision, "Scene revision", 100), points: Object.freeze(points), polylines: Object.freeze(polylines), polygons: Object.freeze(polygons) });
}

export function normalizeMapPresentationInteraction(input: MapPresentationInteraction): MapPresentationInteraction {
  assertProviderNeutral(input, "Map presentation interaction");
  if (input.type === "map_press") return Object.freeze({ type: input.type, coordinate: normalizedMapCoordinate(input.coordinate.longitude, input.coordinate.latitude) });
  return Object.freeze({ type: input.type, pointId: requiredText(input.pointId, "Moved point ID", 100), coordinate: normalizedMapCoordinate(input.coordinate.longitude, input.coordinate.latitude) });
}

export class ReadOnlyMapPresentationContractHarness implements ReadOnlyMapPresentationAdapter, MapPresentationInteractionSource {
  private state: RendererAvailabilityEvent = Object.freeze({ status: "unmounted", reason: null });
  private viewport: MapViewport;
  private scene: MapPresentationScene | null = null;
  private base: MapBasePresentation = "satellite";
  private reference: GeoJsonReferenceLayer | null = null;
  private referenceVisible = true;
  private observation: Readonly<{ coordinate: NormalizedMapCoordinate; accuracyMeters: number | null }> | null = null;
  private readonly viewportListeners = new Set<(viewport: MapViewport) => void>();
  private readonly availabilityListeners = new Set<(event: RendererAvailabilityEvent) => void>();
  private readonly interactionListeners = new Set<(event: MapPresentationInteraction) => void>();

  constructor(initialViewport: MapViewport) { this.viewport = normalizeMapViewport(initialViewport); }
  async mount(container: HTMLElement) { if (!container) throw new TypeError("A renderer container is required."); if (this.state.status !== "unmounted") throw new TypeError("A renderer may mount only once."); this.updateAvailability("ready", null); }
  destroy() { if (this.state.status === "destroyed") return; this.updateAvailability("destroyed", null); this.viewportListeners.clear(); this.availabilityListeners.clear(); this.interactionListeners.clear(); }
  availability() { return this.state; }
  setViewport(viewport: MapViewport) { this.assertActive(); this.viewport = normalizeMapViewport(viewport); }
  currentViewport() { return this.viewport; }
  setBasePresentation(type: MapBasePresentation) { this.assertActive(); this.base = type; }
  showScene(scene: MapPresentationScene) { this.assertActive(); this.scene = normalizeMapPresentationScene(scene); }
  showReferenceLayer(layer: GeoJsonReferenceLayer | null) { this.assertActive(); this.reference = layer; }
  setReferenceLayerVisible(visible: boolean) { this.assertActive(); this.referenceVisible = visible; }
  showObservationalLocation(coordinate: NormalizedMapCoordinate | null, accuracyMeters: number | null) { this.assertActive(); this.observation = coordinate ? Object.freeze({ coordinate: normalizedMapCoordinate(coordinate.longitude, coordinate.latitude), accuracyMeters }) : null; }
  onViewportChange(listener: (viewport: MapViewport) => void) { return this.subscribe(this.viewportListeners, listener); }
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void) { return this.subscribe(this.availabilityListeners, listener); }
  onPresentationInteraction(listener: (event: MapPresentationInteraction) => void) { return this.subscribe(this.interactionListeners, listener); }
  emitViewport(viewport: MapViewport) { this.assertActive(); this.viewport = normalizeMapViewport(viewport); this.viewportListeners.forEach((listener) => listener(this.viewport)); }
  emitInteraction(event: MapPresentationInteraction) { this.assertActive(); const normalized = normalizeMapPresentationInteraction(event); this.interactionListeners.forEach((listener) => listener(normalized)); }
  reportOffline(reason: string) { this.assertActive(); this.updateAvailability("offline", requiredText(reason, "Offline reason")); }
  reportReady() { this.assertActive(); this.updateAvailability("ready", null); }
  snapshot() { return Object.freeze({ availability: this.state, viewport: this.viewport, scene: this.scene, base: this.base, reference: this.reference, referenceVisible: this.referenceVisible, observation: this.observation }); }
  private assertActive() { if (this.state.status === "unmounted" || this.state.status === "destroyed") throw new TypeError("Renderer is not active."); }
  private updateAvailability(status: RendererAvailability, reason: string | null) { this.state = Object.freeze({ status, reason }); this.availabilityListeners.forEach((listener) => listener(this.state)); }
  private subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) { listeners.add(listener); return () => listeners.delete(listener); }
}
