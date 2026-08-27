import { describe, expect, it } from "vitest";
import { ReadOnlyMapPresentationContractHarness, normalizeMapPresentationScene, normalizedMapCoordinate, type MapPresentationInteraction, type MapPresentationScene } from "../src/map-presentation";

const a = normalizedMapCoordinate("-83.9200000", "35.9600000");
const b = normalizedMapCoordinate("-83.9199000", "35.9601000");
const c = normalizedMapCoordinate("-83.9198000", "35.9600000");
const style = { strokeColor: "#174f3c", strokeOpacity: 1, strokeWidth: 3, fillColor: "#ffffff", fillOpacity: 0.2 } as const;
const scene: MapPresentationScene = { revision: "domain-7", points: [{ id: "point-a", coordinate: a, radiusMeters: 0.5, draggable: false, style }], polylines: [{ id: "line-a", coordinates: [a, b], style }], polygons: [{ id: "polygon-a", rings: [[a, b, c]], style }] };
const viewport = { center: a, zoom: "19", bearing: "0", pitch: "0" } as const;

describe("provider-neutral read-only map presentation contract", () => {
  it("normalizes immutable point, polyline, and polygon overlays without domain vocabulary", () => {
    const normalized = normalizeMapPresentationScene(scene);
    expect(normalized).toEqual(scene);
    expect(Object.isFrozen(normalized.points)).toBe(true);
    expect(Object.isFrozen(normalized.polylines[0].coordinates)).toBe(true);
    expect(Object.isFrozen(normalized.polygons[0].rings)).toBe(true);
    expect(JSON.stringify(normalized)).not.toMatch(/fence|deck|takeoff/i);
  });

  it("keeps lifecycle, viewport, base, references, and observations independent from the scene", async () => {
    const harness = new ReadOnlyMapPresentationContractHarness(viewport);
    await harness.mount({} as HTMLElement);
    harness.showScene(scene);
    harness.setBasePresentation("hybrid");
    harness.showReferenceLayer({ type: "FeatureCollection", features: [{ type: "Feature", properties: { layer: "parcel-reference" }, geometry: { type: "LineString", coordinates: [[-83.92, 35.96], [-83.9199, 35.9601]] } }] });
    harness.setReferenceLayerVisible(false);
    harness.showObservationalLocation(b, 8);
    expect(harness.snapshot()).toMatchObject({ base: "hybrid", referenceVisible: false, observation: { accuracyMeters: 8 }, scene: { revision: "domain-7" } });
    harness.reportOffline("tiles unavailable");
    expect(harness.snapshot().scene?.revision).toBe("domain-7");
    harness.destroy(); expect(harness.availability().status).toBe("destroyed");
  });

  it("emits generic presentation interactions without changing its immutable scene", async () => {
    const before = JSON.stringify(scene); const interactions: MapPresentationInteraction[] = [];
    const harness = new ReadOnlyMapPresentationContractHarness(viewport);
    await harness.mount({} as HTMLElement); harness.showScene(scene);
    harness.onPresentationInteraction((event) => interactions.push(event));
    harness.emitInteraction({ type: "map_press", coordinate: b });
    harness.emitInteraction({ type: "point_move", pointId: "point-a", coordinate: c });
    expect(interactions.map(({ type }) => type)).toEqual(["map_press", "point_move"]);
    expect(JSON.stringify(scene)).toBe(before);
    expect(harness.snapshot().scene?.points[0].coordinate).toEqual(a);
  });

  it("rejects duplicate IDs, provider instances, and malformed polygons", () => {
    expect(() => normalizeMapPresentationScene({ ...scene, polylines: [{ ...scene.polylines[0], id: "point-a" }] })).toThrow(/unique/i);
    expect(() => normalizeMapPresentationScene({ ...scene, polygons: [{ ...scene.polygons[0], rings: [[a, b]] }] })).toThrow(/at least 3/i);
    class ProviderPoint { id = "provider"; coordinate = a; radiusMeters = 1; draggable = false; style = style; }
    expect(() => normalizeMapPresentationScene({ ...scene, points: [new ProviderPoint()] })).toThrow(/provider or class instance/i);
  });
});
