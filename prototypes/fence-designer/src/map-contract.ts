export type NormalizedMapCoordinate = Readonly<{
  longitude: string;
  latitude: string;
}>;

export type MapViewport = Readonly<{
  center: NormalizedMapCoordinate;
  zoom: string;
  bearing: string;
  pitch: string;
}>;

export type FenceMapDisplayProjection = Readonly<{
  revision: string;
  nodes: readonly Readonly<{ id: string; coordinate: NormalizedMapCoordinate; role: "endpoint" | "corner" | "gate" }>[];
  runs: readonly Readonly<{ id: string; kind: "fence" | "gate"; coordinates: readonly NormalizedMapCoordinate[] }>[];
}>;

export type FenceDraftEditEvent =
  | Readonly<{ type: "place_node"; coordinate: NormalizedMapCoordinate }>
  | Readonly<{ type: "move_node"; nodeId: string; coordinate: NormalizedMapCoordinate }>
  | Readonly<{ type: "delete_node"; nodeId: string }>;

export type RendererAvailability = "unmounted" | "ready" | "offline" | "destroyed";
export type RendererAvailabilityEvent = Readonly<{ status: RendererAvailability; reason: string | null }>;

export interface FenceMapRendererAdapter {
  mount(container: HTMLElement): Promise<void>;
  destroy(): void;
  availability(): RendererAvailabilityEvent;
  setViewport(viewport: MapViewport): void;
  showDomainProjection(projection: FenceMapDisplayProjection): void;
  onViewportChange(listener: (viewport: MapViewport) => void): () => void;
  onDraftEdit(listener: (event: FenceDraftEditEvent) => void): () => void;
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void): () => void;
}

export class FenceMapRendererContractHarness implements FenceMapRendererAdapter {
  private state: RendererAvailabilityEvent = Object.freeze({ status: "unmounted", reason: null });
  private viewport: MapViewport | null = null;
  private projection: FenceMapDisplayProjection | null = null;
  private readonly viewportListeners = new Set<(viewport: MapViewport) => void>();
  private readonly draftListeners = new Set<(event: FenceDraftEditEvent) => void>();
  private readonly availabilityListeners = new Set<(event: RendererAvailabilityEvent) => void>();

  async mount(container: HTMLElement) {
    if (!container) throw new TypeError("A renderer container is required.");
    if (this.state.status !== "unmounted") throw new TypeError("A renderer may mount only once.");
    this.updateAvailability("ready", null);
  }

  destroy() {
    if (this.state.status === "destroyed") return;
    this.updateAvailability("destroyed", null);
    this.viewportListeners.clear(); this.draftListeners.clear(); this.availabilityListeners.clear();
  }

  availability() { return this.state; }

  setViewport(viewport: MapViewport) {
    this.assertActive();
    this.viewport = normalizeMapViewport(viewport);
  }

  showDomainProjection(projection: FenceMapDisplayProjection) {
    this.assertActive();
    this.projection = normalizeDisplayProjection(projection);
  }

  onViewportChange(listener: (viewport: MapViewport) => void) { return this.subscribe(this.viewportListeners, listener); }
  onDraftEdit(listener: (event: FenceDraftEditEvent) => void) { return this.subscribe(this.draftListeners, listener); }
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void) { return this.subscribe(this.availabilityListeners, listener); }

  reportOffline(reason: string) {
    this.assertActive();
    this.updateAvailability("offline", requiredText(reason, "Offline reason"));
  }

  reportReady() {
    this.assertActive();
    this.updateAvailability("ready", null);
  }

  emitViewportChange(viewport: MapViewport) {
    this.assertActive();
    const normalized = normalizeMapViewport(viewport);
    this.viewport = normalized;
    this.viewportListeners.forEach((listener) => listener(normalized));
  }

  emitDraftEdit(event: FenceDraftEditEvent) {
    this.assertActive();
    const normalized = normalizeDraftEditEvent(event);
    this.draftListeners.forEach((listener) => listener(normalized));
  }

  snapshot() { return Object.freeze({ availability: this.state, viewport: this.viewport, projection: this.projection }); }

  private assertActive() {
    if (this.state.status === "unmounted" || this.state.status === "destroyed") throw new TypeError("Renderer is not active.");
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

const coordinatePattern = /^-?(?:0|[1-9][0-9]*)\.[0-9]{7}$/;
const decimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function boundedCoordinate(value: string, minimum: number, maximum: number, label: string) {
  if (!coordinatePattern.test(value) || Number(value) < minimum || Number(value) > maximum || Object.is(Number(value), -0)) {
    throw new TypeError(`${label} must be a normalized seven-decimal WGS84 string.`);
  }
  return value;
}

export function normalizedMapCoordinate(longitude: string, latitude: string): NormalizedMapCoordinate {
  return Object.freeze({
    longitude: boundedCoordinate(longitude, -180, 180, "Longitude"),
    latitude: boundedCoordinate(latitude, -90, 90, "Latitude"),
  });
}

function decimal(value: string, label: string, minimum: number, maximum: number) {
  if (!decimalPattern.test(value) || Number(value) < minimum || Number(value) > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}

export function normalizeMapViewport(input: MapViewport): MapViewport {
  return Object.freeze({
    center: normalizedMapCoordinate(input.center.longitude, input.center.latitude),
    zoom: decimal(input.zoom, "Zoom", 0, 30),
    bearing: decimal(input.bearing, "Bearing", -360, 360),
    pitch: decimal(input.pitch, "Pitch", 0, 90),
  });
}

function requiredText(value: string, label: string, maximum = 200) {
  const result = value.trim();
  if (!result || result.length > maximum) throw new TypeError(`${label} is required and must be ${maximum} characters or fewer.`);
  return result;
}

export function assertProviderNeutral(value: unknown, label = "Provider-neutral value"): void {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProviderNeutral(item, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object") throw new TypeError(`${label} contains an unsupported value.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} contains a provider or class instance.`);
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => assertProviderNeutral(item, `${label}.${key}`));
}

export function normalizeDisplayProjection(input: FenceMapDisplayProjection): FenceMapDisplayProjection {
  assertProviderNeutral(input, "Fence display projection");
  const nodeIds = new Set<string>();
  const nodes = input.nodes.map((node) => {
    const id = requiredText(node.id, "Node ID", 80);
    if (nodeIds.has(id)) throw new TypeError("Node IDs must be unique.");
    nodeIds.add(id);
    return Object.freeze({ id, coordinate: normalizedMapCoordinate(node.coordinate.longitude, node.coordinate.latitude), role: node.role });
  });
  const runIds = new Set<string>();
  const runs = input.runs.map((run) => {
    const id = requiredText(run.id, "Run ID", 80);
    if (runIds.has(id)) throw new TypeError("Run IDs must be unique.");
    if (run.coordinates.length < 2) throw new TypeError("A displayed run requires at least two coordinates.");
    runIds.add(id);
    return Object.freeze({ id, kind: run.kind, coordinates: Object.freeze(run.coordinates.map((coordinate) => normalizedMapCoordinate(coordinate.longitude, coordinate.latitude))) });
  });
  return Object.freeze({ revision: requiredText(input.revision, "Projection revision", 80), nodes: Object.freeze(nodes), runs: Object.freeze(runs) });
}

export function normalizeDraftEditEvent(input: FenceDraftEditEvent): FenceDraftEditEvent {
  assertProviderNeutral(input, "Fence draft event");
  if (input.type === "place_node") return Object.freeze({ type: input.type, coordinate: normalizedMapCoordinate(input.coordinate.longitude, input.coordinate.latitude) });
  const nodeId = requiredText(input.nodeId, "Draft node ID", 80);
  if (input.type === "delete_node") return Object.freeze({ type: input.type, nodeId });
  return Object.freeze({ type: input.type, nodeId, coordinate: normalizedMapCoordinate(input.coordinate.longitude, input.coordinate.latitude) });
}

export type ProviderUseMetadata = Readonly<{
  providerId: string;
  termsVersion: string;
  attribution: string;
  storagePolicy: "temporary" | "permanent" | "provider_specific";
  retrievedAt: string;
}>;

export type AddressSearchCandidate = Readonly<{
  resultId: string;
  displayLabel: string;
  coordinate: NormalizedMapCoordinate;
  provider: ProviderUseMetadata;
}>;

export interface AddressSearchAdapter {
  search(query: string): Promise<readonly AddressSearchCandidate[]>;
}

export class AddressSearchContractHarness implements AddressSearchAdapter {
  private available = true;
  private readonly candidates: readonly AddressSearchCandidate[];

  constructor(candidates: readonly AddressSearchCandidate[]) {
    this.candidates = Object.freeze(candidates.map(normalizeAddressCandidate));
  }

  setAvailable(available: boolean) { this.available = available; }

  async search(query: string) {
    requiredText(query, "Address query");
    if (!this.available) throw new TypeError("Address search provider is unavailable.");
    return this.candidates;
  }
}

export type PendingAddressSelection = Readonly<{ candidate: AddressSearchCandidate; confirmed: false }>;
export type ConfirmedAddressSelection = Readonly<{ candidate: AddressSearchCandidate; confirmed: true; confirmedAt: string }>;

function normalizeProviderMetadata(provider: ProviderUseMetadata): ProviderUseMetadata {
  if (!(["temporary", "permanent", "provider_specific"] as const).includes(provider.storagePolicy)) throw new TypeError("Provider storage policy is invalid.");
  return Object.freeze({
    providerId: requiredText(provider.providerId, "Provider ID", 80),
    termsVersion: requiredText(provider.termsVersion, "Provider terms version", 120),
    attribution: requiredText(provider.attribution, "Provider attribution"),
    storagePolicy: provider.storagePolicy,
    retrievedAt: utcTimestamp(provider.retrievedAt, "Provider retrieval time"),
  });
}

function utcTimestamp(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new TypeError(`${label} must be UTC RFC 3339.`);
  return value;
}

function normalizeAddressCandidate(candidate: AddressSearchCandidate): AddressSearchCandidate {
  assertProviderNeutral(candidate, "Address candidate");
  return Object.freeze({
    resultId: requiredText(candidate.resultId, "Address result ID", 120),
    displayLabel: requiredText(candidate.displayLabel, "Address display label"),
    coordinate: normalizedMapCoordinate(candidate.coordinate.longitude, candidate.coordinate.latitude),
    provider: normalizeProviderMetadata(candidate.provider),
  });
}

export function beginAddressSelection(candidate: AddressSearchCandidate): PendingAddressSelection {
  return Object.freeze({ candidate: normalizeAddressCandidate(candidate), confirmed: false });
}

export function confirmAddressSelection(selection: PendingAddressSelection, resultId: string, confirmedAt: string): ConfirmedAddressSelection {
  if (selection.candidate.resultId !== resultId) throw new TypeError("The confirmed address must match the selected provider result.");
  return Object.freeze({ candidate: selection.candidate, confirmed: true, confirmedAt: utcTimestamp(confirmedAt, "Address confirmation time") });
}

export type BaseLayerKind = "roadmap" | "satellite" | "hybrid" | "terrain" | "custom";
export type OverlayLayerSource = "parcel" | "gps" | "moasure" | "lidar" | "cad";
export type LayerDescriptor = Readonly<{
  id: string;
  label: string;
}>;
export type BaseLayerDescriptor = LayerDescriptor & Readonly<{ kind: BaseLayerKind; provider: ProviderUseMetadata }>;
export type OverlayLayerDescriptor = LayerDescriptor & Readonly<{ source: OverlayLayerSource; visible: boolean; provider: ProviderUseMetadata | null }>;
export type FenceLayerRegistry = Readonly<{
  baseLayers: readonly BaseLayerDescriptor[];
  selectedBaseLayerId: string | null;
  overlays: readonly OverlayLayerDescriptor[];
}>;

export function createLayerRegistry(baseLayers: readonly BaseLayerDescriptor[], overlays: readonly OverlayLayerDescriptor[]): FenceLayerRegistry {
  const ids = [...baseLayers, ...overlays].map(({ id }) => requiredText(id, "Layer ID", 80));
  if (new Set(ids).size !== ids.length) throw new TypeError("Layer IDs must be unique across base and overlay layers.");
  const normalizedBases = baseLayers.map((layer) => Object.freeze({ id: layer.id, label: requiredText(layer.label, "Layer label"), provider: normalizeProviderMetadata(layer.provider), kind: layer.kind }));
  const normalizedOverlays = overlays.map((layer) => Object.freeze({ id: layer.id, label: requiredText(layer.label, "Layer label"), provider: layer.provider ? normalizeProviderMetadata(layer.provider) : null, source: layer.source, visible: Boolean(layer.visible) }));
  return Object.freeze({ baseLayers: Object.freeze(normalizedBases), selectedBaseLayerId: normalizedBases[0]?.id ?? null, overlays: Object.freeze(normalizedOverlays) });
}

export function selectBaseLayer(registry: FenceLayerRegistry, layerId: string): FenceLayerRegistry {
  if (!registry.baseLayers.some(({ id }) => id === layerId)) throw new TypeError("Selected base layer does not exist.");
  return Object.freeze({ ...registry, selectedBaseLayerId: layerId });
}

export function setOverlayVisibility(registry: FenceLayerRegistry, layerId: string, visible: boolean): FenceLayerRegistry {
  if (!registry.overlays.some(({ id }) => id === layerId)) throw new TypeError("Selected overlay layer does not exist.");
  return Object.freeze({ ...registry, overlays: Object.freeze(registry.overlays.map((layer) => layer.id === layerId ? Object.freeze({ ...layer, visible }) : layer)) });
}
