"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fenceGeoJson, fenceKml, projectFenceDesignToMap, registrationAtDesignOrigin } from "./fence-geo-interchange";
import { FenceGoogleMapRendererAdapter } from "./fence-map-renderer";
import { mapToLocalGround, type LocalGroundToWgs84Registration } from "./ground-registration";
import { parseLocalParcelFile, type ParcelGeoJson } from "./local-reference-interchange";
import { IDLE_LOCATION_STATE, ObservationalLocationSession, type ObservationalLocationState } from "./live-location";
import { normalizedMapCoordinate, type RendererAvailabilityEvent } from "./map-presentation";
import type { FenceDesign } from "./model";

type GoogleMapSpikeProps = Readonly<{
  apiKey: string | null;
  design: FenceDesign;
  onPlacePoint(position: Readonly<{ xMm: number; yMm: number }>): void;
  onMovePoint(pointId: string, position: Readonly<{ xMm: number; yMm: number }>): void;
}>;

const DEIDENTIFIED_KNOXVILLE_CENTER = normalizedMapCoordinate("-83.9200000", "35.9600000");

function downloadText(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function locationLabel(state: ObservationalLocationState) {
  if (state.status === "idle") return "Location is off.";
  if (state.status === "watching") return "Waiting for browser location…";
  if (state.accuracyMeters !== null) {
    const tier = state.accuracyTier === "best-observational" ? "best available" : state.accuracyTier === "caution" ? "caution" : "rejected";
    return `±${Math.round(state.accuracyMeters)} m · ${tier} · observational only`;
  }
  return state.reason ?? "Location stopped.";
}

export default function GoogleMapSpike({ apiKey, design, onPlacePoint, onMovePoint }: GoogleMapSpikeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<FenceGoogleMapRendererAdapter | null>(null);
  const locationSessionRef = useRef<ObservationalLocationSession | null>(null);
  const registrationRef = useRef<LocalGroundToWgs84Registration>(registrationAtDesignOrigin(design, DEIDENTIFIED_KNOXVILLE_CENTER));
  const [registration, setRegistration] = useState(registrationRef.current);
  const [registrationPlaced, setRegistrationPlaced] = useState(false);
  const [availability, setAvailability] = useState<RendererAvailabilityEvent>({ status: "unmounted", reason: null });
  const [mapType, setMapType] = useState<"satellite" | "hybrid">("satellite");
  const [sketchEnabled, setSketchEnabled] = useState(false);
  const [parcel, setParcel] = useState<ParcelGeoJson | null>(null);
  const [parcelName, setParcelName] = useState<string | null>(null);
  const [parcelVisible, setParcelVisible] = useState(true);
  const [location, setLocation] = useState<ObservationalLocationState>(IDLE_LOCATION_STATE);
  const [message, setMessage] = useState("The Google renderer is disposable. Fence measurements remain in McKenzie integer millimeters.");
  const placeRef = useRef(onPlacePoint); const moveRef = useRef(onMovePoint); const sketchRef = useRef(sketchEnabled);
  placeRef.current = onPlacePoint; moveRef.current = onMovePoint; sketchRef.current = sketchEnabled; registrationRef.current = registration;

  const projection = useMemo(() => projectFenceDesignToMap(design, registration), [design, registration]);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    const adapter = new FenceGoogleMapRendererAdapter(apiKey);
    adapterRef.current = adapter;
    const offAvailability = adapter.onAvailabilityChange(setAvailability);
    const offDraft = adapter.onDraftEdit((event) => {
      if (!sketchRef.current || event.type === "delete_node") return;
      const local = mapToLocalGround(event.coordinate, registrationRef.current);
      if (event.type === "place_node") placeRef.current(local);
      else moveRef.current(event.nodeId, local);
    });
    void adapter.mount(containerRef.current).catch((error) => setMessage(error instanceof Error ? error.message : "Google Maps could not load."));
    return () => { offAvailability(); offDraft(); adapter.destroy(); adapterRef.current = null; locationSessionRef.current?.stop("Map renderer closed."); };
  }, [apiKey]);

  useEffect(() => { adapterRef.current?.showDomainProjection(projection); }, [projection]);
  useEffect(() => { adapterRef.current?.setMapType(mapType); }, [mapType]);
  useEffect(() => { adapterRef.current?.showParcelGeoJson(parcel); }, [parcel]);
  useEffect(() => { adapterRef.current?.setParcelVisible(parcelVisible); }, [parcelVisible]);
  useEffect(() => { adapterRef.current?.showLiveLocation(location.coordinate, location.status === "fix" || location.status === "stale" ? location.accuracyMeters : null); }, [location]);

  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) locationSessionRef.current?.stop("Live location stopped when the page was hidden."); };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);

  const reanchor = () => {
    const center = adapterRef.current?.currentViewport().center;
    if (!center) { setMessage("Wait for the map to become ready before placing the plan."); return; }
    const next = registrationAtDesignOrigin(design, center, registration.xAxisBearingDegrees);
    setRegistration(next);
    setRegistrationPlaced(true);
    setMessage("Fence plan origin placed at the current map center. Exact McKenzie lengths did not change.");
  };

  const importParcel = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new RangeError("Choose a parcel file smaller than 5 MB.");
      const parsed = parseLocalParcelFile(file.name, await file.text());
      setParcel(parsed); setParcelName(file.name); setParcelVisible(true);
      setMessage(`${parsed.features.length} local parcel feature${parsed.features.length === 1 ? "" : "s"} loaded as reference context. No upload occurred.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The local parcel file could not be read."); }
  };

  const toggleLocation = () => {
    if (locationSessionRef.current?.active()) { locationSessionRef.current.stop(); return; }
    if (!navigator.geolocation) { setLocation({ ...IDLE_LOCATION_STATE, status: "error", reason: "This browser does not provide location." }); return; }
    const session = new ObservationalLocationSession(navigator.geolocation);
    locationSessionRef.current = session;
    session.start((next) => {
      setLocation(next);
      if (next.status === "stopped" || next.status === "error") locationSessionRef.current = null;
    });
  };

  const exportGeoJson = () => {
    if (!design.segments.length) { setMessage("Draw at least one fence run before exporting."); return; }
    if (!registrationPlaced) { setMessage("Place the plan at the map center before exporting map coordinates."); return; }
    downloadText("mckenzie-fence-layout.geojson", "application/geo+json", `${JSON.stringify(fenceGeoJson(design, registration), null, 2)}\n`);
    setMessage("GeoJSON exported locally. Nothing was synchronized or uploaded.");
  };
  const exportKml = () => {
    if (!design.segments.length) { setMessage("Draw at least one fence run before exporting."); return; }
    if (!registrationPlaced) { setMessage("Place the plan at the map center before exporting map coordinates."); return; }
    downloadText("mckenzie-fence-layout.kml", "application/vnd.google-earth.kml+xml", fenceKml(design, registration));
    setMessage("KML exported locally. Nothing was synchronized or uploaded.");
  };

  return <section className="google-map-spike" aria-label="Google Maps renderer beta">
    <div className="field-panel-heading"><div><p className="eyebrow">Non-Production renderer spike</p><h3>Live satellite + fence overlay</h3></div><span className="reference-chip">Reference only</span></div>
    <p>Google is the live display surface only. Exact McKenzie lengths, gates, history, and takeoff remain authoritative and survive if this map is unavailable.</p>
    {!apiKey ? <div className="calibration-status required" role="status"><strong>Restricted Preview key not configured</strong><span>The adapter is installed but will not contact Google until the approved browser-restricted Maps JavaScript key is available in this non-Production environment.</span></div> : <>
      <div className="google-map-controls">
        <div className="segmented" aria-label="Google base imagery"><button className={mapType === "satellite" ? "active" : ""} onClick={() => setMapType("satellite")}>Satellite</button><button className={mapType === "hybrid" ? "active" : ""} onClick={() => setMapType("hybrid")}>Hybrid + streets</button></div>
        <button aria-pressed={sketchEnabled} className={sketchEnabled ? "active-tool" : ""} onClick={() => { setSketchEnabled((current) => !current); setMessage(sketchEnabled ? "Map sketching off." : "Map sketching on. Tap to add a point; drag a point circle to move it."); }}>{sketchEnabled ? "✎ Sketching on" : "✎ Sketch on map"}</button>
        <button onClick={reanchor}>⌖ Place plan at map center</button>
      </div>
      <div ref={containerRef} className="google-map-canvas" aria-label="Google satellite fence map" />
      <div className="google-map-status" role="status"><strong>{availability.status === "ready" ? "Map ready" : availability.status === "offline" ? "Map unavailable—local Fence remains ready" : "Loading map…"}</strong>{availability.reason && <span>{availability.reason}</span>}</div>
    </>}
    <div className="google-layer-controls">
      <label className="parcel-file"><span>Local parcel overlay</span><input type="file" accept=".geojson,.json,.kml,application/geo+json,application/json,application/vnd.google-earth.kml+xml" onChange={(event) => { void importParcel(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
      <label><input type="checkbox" checked={parcelVisible} disabled={!parcel} onChange={(event) => setParcelVisible(event.target.checked)} /> Show parcel {parcelName ? `· ${parcelName}` : ""}</label>
      <button disabled={!parcel} onClick={() => { setParcel(null); setParcelName(null); setMessage("Local parcel overlay removed. Fence geometry did not change."); }}>Remove parcel</button>
    </div>
    <div className="google-location-controls">
      <button aria-pressed={locationSessionRef.current?.active() ?? false} onClick={toggleLocation}>{locationSessionRef.current?.active() ? "Stop live location" : "Start observational location"}</button>
      <span className={`location-quality ${location.accuracyTier ?? ""}`}>{locationLabel(location)}</span>
    </div>
    <div className="google-export-controls"><button disabled={!registrationPlaced} onClick={exportGeoJson}>Export GeoJSON</button><button disabled={!registrationPlaced} onClick={exportKml}>Export KML</button></div>
    <div className="walk-status" role="status">{message}</div>
    <small>GPS is observational only: ≤5 m best available, 5–15 m caution, over 15 m rejected. It never snaps or verifies construction geometry. Location stops when requested, hidden, failed, idle for 30 seconds, or after five minutes. Parcel files stay in this browser and are not survey truth. Export is a local file—not live Acres or LandGlide synchronization.</small>
  </section>;
}
