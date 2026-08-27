import { GoogleReadOnlyMapPresentationAdapter, loadGoogleMapsRuntime, type GoogleRuntimeLoader } from "./google-map-renderer";
import { normalizeDisplayProjection, normalizeDraftEditEvent, type FenceDraftEditEvent, type FenceMapDisplayProjection, type FenceMapRendererAdapter } from "./map-contract";
import { normalizeMapPresentationScene, type GeoJsonReferenceLayer, type MapBasePresentation, type MapPresentationScene, type MapViewport, type NormalizedMapCoordinate, type ReadOnlyMapPresentationAdapter, type RendererAvailabilityEvent } from "./map-presentation";

const FENCE_POINT = Object.freeze({ strokeColor: "#174f3c", strokeOpacity: 1, strokeWidth: 2, fillColor: "#ffffff", fillOpacity: 1 });
const GATE_POINT = Object.freeze({ ...FENCE_POINT, fillColor: "#d97706" });
const FENCE_RUN = Object.freeze({ strokeColor: "#174f3c", strokeOpacity: 1, strokeWidth: 5, fillColor: "#174f3c", fillOpacity: 0 });
const GATE_RUN = Object.freeze({ ...FENCE_RUN, strokeColor: "#d97706", strokeWidth: 7 });

export function fenceProjectionToPresentationScene(input: FenceMapDisplayProjection): MapPresentationScene {
  const projection = normalizeDisplayProjection(input);
  return normalizeMapPresentationScene({
    revision: projection.revision,
    points: projection.nodes.map((node) => ({ id: node.id, coordinate: node.coordinate, radiusMeters: node.role === "gate" ? 0.7 : 0.55, draggable: true, style: node.role === "gate" ? GATE_POINT : FENCE_POINT })),
    polylines: projection.runs.map((run) => ({ id: run.id, coordinates: run.coordinates, style: run.kind === "gate" ? GATE_RUN : FENCE_RUN })),
    polygons: [],
  });
}

export class FenceGoogleMapRendererAdapter implements FenceMapRendererAdapter {
  private readonly presenter: GoogleReadOnlyMapPresentationAdapter;
  private readonly draftListeners = new Set<(event: FenceDraftEditEvent) => void>();
  private readonly offInteraction: () => void;

  constructor(apiKey: string, loader: GoogleRuntimeLoader = loadGoogleMapsRuntime, initialViewport?: MapViewport) {
    this.presenter = new GoogleReadOnlyMapPresentationAdapter(apiKey, loader, initialViewport);
    this.offInteraction = this.presenter.onPresentationInteraction((event) => {
      const draft = event.type === "map_press"
        ? normalizeDraftEditEvent({ type: "place_node", coordinate: event.coordinate })
        : normalizeDraftEditEvent({ type: "move_node", nodeId: event.pointId, coordinate: event.coordinate });
      this.draftListeners.forEach((listener) => listener(draft));
    });
  }

  mount(container: HTMLElement) { return this.presenter.mount(container); }
  destroy() { this.offInteraction(); this.presenter.destroy(); this.draftListeners.clear(); }
  availability(): RendererAvailabilityEvent { return this.presenter.availability(); }
  setViewport(viewport: MapViewport) { this.presenter.setViewport(viewport); }
  currentViewport() { return this.presenter.currentViewport(); }
  showDomainProjection(projection: FenceMapDisplayProjection) { this.presenter.showScene(fenceProjectionToPresentationScene(projection)); }
  setMapType(type: MapBasePresentation) { this.presenter.setBasePresentation(type); }
  showParcelGeoJson(parcel: GeoJsonReferenceLayer | null) { this.presenter.showReferenceLayer(parcel); }
  setParcelVisible(visible: boolean) { this.presenter.setReferenceLayerVisible(visible); }
  showLiveLocation(coordinate: NormalizedMapCoordinate | null, accuracyMeters: number | null) { this.presenter.showObservationalLocation(coordinate, accuracyMeters); }
  onViewportChange(listener: (viewport: MapViewport) => void) { return this.presenter.onViewportChange(listener); }
  onDraftEdit(listener: (event: FenceDraftEditEvent) => void) { this.draftListeners.add(listener); return () => this.draftListeners.delete(listener); }
  onAvailabilityChange(listener: (event: RendererAvailabilityEvent) => void) { return this.presenter.onAvailabilityChange(listener); }

  readOnlyPresenter(): ReadOnlyMapPresentationAdapter { return this.presenter; }
}
