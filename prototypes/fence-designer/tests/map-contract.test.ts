import { describe, expect, it } from "vitest";
import {
  FenceMapRendererContractHarness,
  AddressSearchContractHarness,
  assertProviderNeutral,
  beginAddressSelection,
  confirmAddressSelection,
  createLayerRegistry,
  normalizeGroundPlaneScene,
  normalizeLayerRegistration,
  normalizedMapCoordinate,
  selectBaseLayer,
  setOverlayVisibility,
  type FenceMapDisplayProjection,
  type MapViewport,
  type ProviderUseMetadata,
} from "../src/map-contract";
import { EMPTY_DESIGN, normalizeDesign } from "../src/model";

const coordinate = normalizedMapCoordinate("-83.9200000", "35.9600000");
const secondCoordinate = normalizedMapCoordinate("-83.9199000", "35.9601000");
const viewport: MapViewport = { center: coordinate, zoom: "19", bearing: "0", pitch: "0" };
const projection: FenceMapDisplayProjection = {
  revision: "revision-1",
  nodes: [
    { id: "node-1", coordinate, role: "endpoint" },
    { id: "node-2", coordinate: secondCoordinate, role: "corner" },
  ],
  runs: [{ id: "run-1", kind: "fence", coordinates: [coordinate, secondCoordinate] }],
};
const useMetadata: ProviderUseMetadata = {
  providerId: "candidate-provider",
  termsVersion: "review-required",
  attribution: "Provider attribution required",
  storagePolicy: "provider_specific",
  retrievedAt: "2026-08-25T12:00:00.000Z",
};

describe("provider-neutral renderer contract", () => {
  it("mounts, receives read-only projections and viewport events, and destroys cleanly", async () => {
    const renderer = new FenceMapRendererContractHarness();
    const viewportEvents: MapViewport[] = [];
    renderer.onViewportChange((event) => viewportEvents.push(event));
    await renderer.mount({} as HTMLElement);
    renderer.setViewport(viewport);
    renderer.showDomainProjection(projection);
    renderer.emitViewportChange({ ...viewport, zoom: "20" });
    expect(renderer.snapshot().availability.status).toBe("ready");
    expect(renderer.snapshot().viewport?.zoom).toBe("20");
    expect(renderer.snapshot().projection?.revision).toBe("revision-1");
    expect(viewportEvents.map(({ zoom }) => zoom)).toEqual(["20"]);
    renderer.destroy();
    expect(renderer.availability().status).toBe("destroyed");
    expect(() => renderer.setViewport(viewport)).toThrow("Renderer is not active");
  });

  it("preserves the last domain projection while the provider is offline", async () => {
    const renderer = new FenceMapRendererContractHarness();
    const availabilityEvents: string[] = [];
    renderer.onAvailabilityChange((event) => availabilityEvents.push(event.status));
    await renderer.mount({} as HTMLElement);
    renderer.showDomainProjection(projection);
    renderer.reportOffline("Provider tiles are unavailable.");
    expect(renderer.snapshot().availability.status).toBe("offline");
    expect(renderer.snapshot().projection?.revision).toBe("revision-1");
    renderer.emitDraftEdit({ type: "move_node", nodeId: "node-1", coordinate: secondCoordinate });
    renderer.reportReady();
    expect(availabilityEvents).toEqual(["ready", "offline", "ready"]);
  });

  it("normalizes draft edit events before delivering them", async () => {
    const renderer = new FenceMapRendererContractHarness();
    const draftEvents: unknown[] = [];
    renderer.onDraftEdit((event) => draftEvents.push(event));
    await renderer.mount({} as HTMLElement);
    renderer.emitDraftEdit({ type: "place_node", coordinate });
    renderer.emitDraftEdit({ type: "delete_node", nodeId: " node-1 " });
    expect(draftEvents).toEqual([
      { type: "place_node", coordinate },
      { type: "delete_node", nodeId: "node-1" },
    ]);
  });

  it("rejects provider and class instances from neutral projections", () => {
    class ProviderCoordinate { longitude = "-83.9200000"; latitude = "35.9600000"; }
    expect(() => assertProviderNeutral({ coordinate: new ProviderCoordinate() })).toThrow("provider or class instance");
    expect(() => normalizedMapCoordinate("-83.92", "35.9600000")).toThrow("seven-decimal WGS84");
    const normalizedDesign = normalizeDesign({ ...EMPTY_DESIGN, providerRuntime: new ProviderCoordinate() });
    expect("providerRuntime" in normalizedDesign).toBe(false);
  });
});

describe("address-search contract", () => {
  it("normalizes provider results and fails closed when address search is unavailable", async () => {
    const adapter = new AddressSearchContractHarness([{ resultId: "result-1", displayLabel: "Selected location", coordinate, provider: useMetadata }]);
    const candidates = await adapter.search("location query");
    expect(candidates[0].provider).toMatchObject({ providerId: "candidate-provider", retrievedAt: "2026-08-25T12:00:00.000Z" });
    adapter.setAvailable(false);
    await expect(adapter.search("location query")).rejects.toThrow("unavailable");
  });

  it("requires an explicit matching-result confirmation and retains use metadata", () => {
    const pending = beginAddressSelection({ resultId: "result-1", displayLabel: "Selected location", coordinate, provider: useMetadata });
    expect(pending.confirmed).toBe(false);
    expect(() => confirmAddressSelection(pending, "result-2", "2026-08-25T12:00:00.000Z")).toThrow("must match");
    const confirmed = confirmAddressSelection(pending, "result-1", "2026-08-25T12:00:00.000Z");
    expect(confirmed).toMatchObject({ confirmed: true, candidate: { provider: { storagePolicy: "provider_specific", termsVersion: "review-required" } } });
  });

  it("rejects provider objects and invalid confirmation timestamps", () => {
    class ProviderResult { resultId = "result-1"; displayLabel = "Selected location"; coordinate = coordinate; provider = useMetadata; }
    expect(() => beginAddressSelection(new ProviderResult())).toThrow("provider or class instance");
    const pending = beginAddressSelection({ resultId: "result-1", displayLabel: "Selected location", coordinate, provider: useMetadata });
    expect(() => confirmAddressSelection(pending, "result-1", "today")).toThrow("UTC RFC 3339");
  });
});

describe("layer registry", () => {
  it("selects exactly one base while stacking independent overlays", () => {
    let registry = createLayerRegistry(
      [
        { id: "road", label: "Road", kind: "roadmap", provider: useMetadata },
        { id: "aerial", label: "Aerial", kind: "satellite", provider: useMetadata },
      ],
      [
        { id: "parcel", label: "Parcel", source: "parcel", visible: false, provider: useMetadata },
        { id: "gps", label: "Phone GPS", source: "gps", visible: false, provider: null },
        { id: "moasure", label: "Moasure", source: "moasure", visible: false, provider: null },
        { id: "lidar", label: "LiDAR", source: "lidar", visible: false, provider: null },
        { id: "cad", label: "CAD", source: "cad", visible: false, provider: null },
      ],
    );
    registry = selectBaseLayer(registry, "aerial");
    registry = setOverlayVisibility(registry, "parcel", true);
    registry = setOverlayVisibility(registry, "moasure", true);
    expect(registry.selectedBaseLayerId).toBe("aerial");
    expect(registry.overlays.filter(({ visible }) => visible).map(({ source }) => source)).toEqual(["parcel", "moasure"]);
  });

  it("rejects duplicate and unknown layer IDs", () => {
    expect(() => createLayerRegistry(
      [{ id: "same", label: "Base", kind: "satellite", provider: useMetadata }],
      [{ id: "same", label: "Overlay", source: "parcel", visible: true, provider: useMetadata }],
    )).toThrow("unique");
    const registry = createLayerRegistry([], []);
    expect(() => selectBaseLayer(registry, "missing")).toThrow("does not exist");
    expect(() => setOverlayVisibility(registry, "missing", true)).toThrow("does not exist");
  });
});

describe("shared local ground-plane registration", () => {
  const satelliteRegistration = {
    layerId: "local-satellite",
    role: "base_imagery",
    sourceCrs: "IMAGE_PIXEL",
    groundCrs: "MCKENZIE_LOCAL_MM",
    method: "similarity_controls",
    controls: [
      { source: { x: "100", y: "200" }, ground: { xMm: 0, yMm: 0 } },
      { source: { x: "900", y: "200" }, ground: { xMm: 30_480, yMm: 0 } },
    ],
    residualMm: 76,
    uncertaintyMm: 305,
    status: "registered",
  } as const;
  const parcelRegistration = {
    layerId: "local-parcel",
    role: "parcel_overlay",
    sourceCrs: "EPSG:2915",
    groundCrs: "MCKENZIE_LOCAL_MM",
    method: "declared_crs",
    controls: [],
    residualMm: null,
    uncertaintyMm: 610,
    status: "registered",
  } as const;

  it("registers imagery and parcel context into one integer-millimeter plane without changing fence geometry", () => {
    const fenceProjection = {
      revision: "revision-7",
      points: [{ id: "point-1", position: { xMm: 0, yMm: 0 } }, { id: "point-2", position: { xMm: 6_096, yMm: 0 } }],
      runs: [{ id: "segment-1", fromPointId: "point-1", toPointId: "point-2" }],
    } as const;
    const scene = normalizeGroundPlaneScene({
      plane: "MCKENZIE_LOCAL_MM",
      registrations: [satelliteRegistration, parcelRegistration],
      observations: [
        { observationId: "parcel-observation", segmentId: "segment-1", layerId: "local-parcel", source: "parcel_context", confidence: "medium", verification: "preliminary" },
        { observationId: "aerial-observation", segmentId: "segment-1", layerId: "local-satellite", source: "aerial_imagery", confidence: "low", verification: "estimated" },
      ],
      fenceProjection,
    });
    const registry = createLayerRegistry(
      [{ id: "local-satellite", label: "Local satellite capture", kind: "satellite", provider: useMetadata }],
      [{ id: "local-parcel", label: "Local parcel context", source: "parcel", visible: true, provider: useMetadata }],
    );
    const before = JSON.stringify(scene.fenceProjection);
    const hidden = setOverlayVisibility(registry, "local-parcel", false);
    expect(hidden.overlays[0].visible).toBe(false);
    expect(JSON.stringify(scene.fenceProjection)).toBe(before);
    expect(scene.registrations.map(({ role }) => role)).toEqual(["base_imagery", "parcel_overlay"]);
    expect(scene.observations[0]).toMatchObject({ confidence: "medium", verification: "preliminary" });
  });

  it("requires enough non-collinear controls for similarity and affine registration", () => {
    expect(() => normalizeLayerRegistration({ ...satelliteRegistration, controls: satelliteRegistration.controls.slice(0, 1) })).toThrow(/at least two/i);
    expect(() => normalizeLayerRegistration({
      ...satelliteRegistration,
      method: "affine_controls",
      controls: [
        ...satelliteRegistration.controls,
        { source: { x: "1700", y: "200" }, ground: { xMm: 60_960, yMm: 0 } },
      ],
    })).toThrow(/non-collinear/i);
  });

  it("keeps confidence separate and refuses to promote parcel or imagery context to field verified", () => {
    expect(() => normalizeGroundPlaneScene({
      plane: "MCKENZIE_LOCAL_MM",
      registrations: [parcelRegistration],
      observations: [{ observationId: "parcel-observation", segmentId: null, layerId: "local-parcel", source: "parcel_context", confidence: "high", verification: "field_verified" }],
      fenceProjection: { revision: "empty", points: [], runs: [] },
    })).toThrow(/cannot be promoted/i);
  });
});
