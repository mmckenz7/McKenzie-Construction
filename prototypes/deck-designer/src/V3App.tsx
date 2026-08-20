import { Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyPolygonRegionReplacement, PolygonEdgeReviewRequiredError } from "./commandsV3";
import { deriveDeckDesignProjectionV3 } from "./designProjectionV3";
import { derivePlatformGeometryV3 } from "./geometryV3";
import { createHistoryV3, designHistoryReducerV3 } from "./historyV3";
import { DEFAULT_DESIGN, updateDesign } from "./model";
import { deckDesignV3Fingerprint, migrateDeckDesignToV3, normalizeDeckDesignV3, stableDeckDesignV3Json, type DeckDesignV3, type DeckPlatformV3, type StairLandingConnectionV3, type StairLandingV3, type StairSystemV3 } from "./modelV3";
import { PlanViewV3 } from "./PlanViewV3";
import { formatFeetInches } from "./PlanView";
import { saveDeckDesignV3 } from "./storageV3";
import type { CameraPreset } from "./ThreeView";
import type { RenderQuality } from "./renderQuality";
import { addBumpoutOnEdge, movePolygonCorner, movePolygonSegment } from "./polygonEditorV3";
import { createDesignFromConfirmedPhotoFacts, type ConfirmedPhotoFacts, type PhotoIntakeReview } from "./photoIntake";
import type { PolygonPoint } from "./polygon";
import { deriveHouseContextGeometry } from "./houseContextGeometry";

const ThreeViewV3 = lazy(async () => ({ default: (await import("./ThreeViewV3")).ThreeViewV3 }));
const PhotoIntake = lazy(async () => ({ default: (await import("./PhotoIntakeDialog")).PhotoIntake }));
const HouseConnectionEditor = lazy(async () => ({ default: (await import("./HouseConnectionEditor")).HouseConnectionEditor }));
const RailingStageControls = lazy(async () => ({ default: (await import("./RailingStageControls")).RailingStageControls }));
const RailingMobileActions = lazy(async () => ({ default: (await import("./RailingStageControls")).RailingMobileActions }));
const LandingConnectionsEditor = lazy(async () => ({ default: (await import("./LandingConnectionsEditor")).LandingConnectionsEditor }));
type Point = Readonly<{ x: number; z: number }>;

function revisePlatform(design: DeckDesignV3, platform: DeckPlatformV3): DeckDesignV3 {
  return normalizeDeckDesignV3({ ...design, platforms: design.platforms.map((item) => item.id === platform.id ? platform : item), metadata: { ...design.metadata, revision: design.metadata.revision + 1 } });
}

export function V3App({ initialDesign, initialMessage = "Corner editor ready.", startWithPhotos = false }: { initialDesign: DeckDesignV3; initialMessage?: string; startWithPhotos?: boolean }) {
  const [history, dispatch] = useReducer(designHistoryReducerV3, initialDesign, createHistoryV3);
  const [preview, setPreview] = useState<DeckDesignV3 | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState(initialDesign.platforms[0].id);
  const design = preview ?? history.present;
  const platform = design.platforms.find((item) => item.id === selectedPlatformId) ?? design.platforms[0];
  const geometry = useMemo(() => derivePlatformGeometryV3(design, platform.id), [design, platform.id]);
  const houseGeometry = useMemo(() => deriveHouseContextGeometry(design.siteContext), [design.siteContext]);
  const projection = useMemo(() => deriveDeckDesignProjectionV3(design), [design]);
  const [message, setMessage] = useState(initialMessage);
  const [snapIncrement, setSnapIncrement] = useState(6);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStairSystemId, setSelectedStairSystemId] = useState<string | null>(initialDesign.platforms[0].construction.stairSystems.find((system) => !system.locked)?.id ?? null);
  const [selectedLandingId, setSelectedLandingId] = useState<string | null>(initialDesign.platforms[0].construction.stairSystems.find((system) => !system.locked)?.landings.find((landing) => !landing.locked)?.id ?? null);
  const [landingPositionMode, setLandingPositionMode] = useState<"height" | "distance" | "below" | "above">("below");
  const [addingStairSystem, setAddingStairSystem] = useState(initialDesign.platforms[0].construction.stairSystems.length === 0);
  const [workflowStage, setWorkflowStage] = useState<"layout" | "railings">("layout");
  const [showFraming, setShowFraming] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("perspective");
  const [presetRequest, setPresetRequest] = useState(0);
  const [quality, setQuality] = useState<RenderQuality>("balanced");
  const [photoIntakeOpen, setPhotoIntakeOpen] = useState(startWithPhotos);
  const [photoStartSummary, setPhotoStartSummary] = useState<Readonly<{ photoCount: number; review: PhotoIntakeReview }> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeStairSystem = platform.construction.stairSystems.find((system) => system.id === selectedStairSystemId) ?? null;
  const activeLanding = activeStairSystem?.landings.find((landing) => landing.id === selectedLandingId) ?? activeStairSystem?.landings.find((landing) => !landing.locked) ?? null;
  const activeTotalRisers = activeStairSystem ? Math.ceil((platform.elevation - design.siteContext.gradeElevation) / activeStairSystem.maxRiserHeight) : 0;
  const activeActualRise = activeTotalRisers ? (platform.elevation - design.siteContext.gradeElevation) / activeTotalRisers : 0;
  const hasEdgeReferences = platform.edgeConditions.some((condition) => condition.condition === "house_attachment") || platform.construction.railing.enabledEdgeIds.length > 0 || platform.construction.stairSystems.length > 0;
  const visibleGeometry = useMemo(() => workflowStage === "layout" ? { ...geometry, railSegments: [], railPosts: [] } : geometry, [geometry, workflowStage]);
  const apply = (next: DeckDesignV3, nextMessage: string) => { setPreview(null); dispatch({ type: "apply", design: next }); setMessage(nextMessage); };
  const replaceRegion = (outer: readonly Point[], commit: boolean): boolean => {
    try {
      const result = applyPolygonRegionReplacement(history.present, platform.id, { outer, holes: platform.region.holes });
      if (commit) apply(result.design, result.notices.join(" ")); else setPreview(result.design);
      return true;
    } catch (error) {
      setPreview(null);
      if (error instanceof PolygonEdgeReviewRequiredError) {
        const affected = [...new Set(error.plan.impacts.flatMap((impact) => impact.usages))].join(", ");
        setMessage(`Outline paused: ${affected} references would change.`);
      } else setMessage(error instanceof Error ? `Outline rejected: ${error.message}` : "Outline rejected.");
      return false;
    }
  };
  const moveCorner = (index: number, point: Point, commit: boolean) => replaceRegion(movePolygonCorner(platform.region.outer, index, point, commit, snapIncrement), commit);
  const addCorner = (edgeIndex: number, point: Point) => {
    try {
      const outer = addBumpoutOnEdge(platform.region.outer, edgeIndex, point, snapIncrement);
      if (replaceRegion(outer, true)) {
        setSelectedEdgeId(null);
        setMessage("Bumpout added. Drag its corners or segment handles to refine it.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Corner could not be added.");
    }
  };
  const moveSegment = (edgeIndex: number, distance: number, commit: boolean) => {
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      replaceRegion(movePolygonSegment(current.region.outer, edgeIndex, distance, snapIncrement, commit), commit);
      if (commit) setMessage("Segment and attached corners moved.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "Segment move was rejected.");
    }
  };
  const updatePlatform = (update: Partial<DeckPlatformV3>, nextMessage: string) => {
    const current = history.present.platforms.find((item) => item.id === platform.id)!;
    apply(revisePlatform(history.present, { ...current, ...update }), nextMessage);
  };
  const updateConstruction = (construction: DeckPlatformV3["construction"], nextMessage: string) => updatePlatform({ construction }, nextMessage);
  const unlockOutline = () => {
    const current = history.present.platforms.find((item) => item.id === platform.id)!;
    const unlocked: DeckPlatformV3 = {
      ...current,
      edgeConditions: current.edgeConditions.map((condition) => ({ ...condition, condition: "free", attachment: "none" })),
      construction: {
        ...current.construction,
        railing: { ...current.construction.railing, enabledEdgeIds: [] },
        stairSystems: [],
      },
    };
    apply(revisePlatform(history.present, unlocked), "Outline unlocked; side options and stairs cleared.");
    setSelectedStairSystemId(null);
    setSelectedLandingId(null);
    setAddingStairSystem(true);
  };
  const addBumpoutToEdge = (edgeId: string) => {
    const edgeIndex = geometry.platformEdges.findIndex((edge) => edge.id === edgeId);
    const edge = geometry.platformEdges[edgeIndex];
    if (!edge) { setMessage("Select the side where you want the bumpout first."); return; }
    addCorner(edgeIndex, { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 });
  };
  const removeCorner = (index: number) => {
    if (platform.region.outer.length <= 4) { setMessage("Keep at least four corners."); return; }
    replaceRegion(platform.region.outer.filter((_, current) => current !== index), true);
  };
  const applyRailing = (railing: DeckPlatformV3["construction"]["railing"], nextMessage: string) => updateConstruction({ ...platform.construction, railing }, nextMessage);
  const enterRailingStage = () => { setPreview(null); setSelectedEdgeId(null); setWorkflowStage("railings"); setMessage("Layout locked. Tap sides that need railings."); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const returnToLayoutStage = () => { setSelectedEdgeId(null); setWorkflowStage("layout"); setMessage("Layout reopened; side attachments remain protected."); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const replaceStairSystems = (systems: readonly StairSystemV3[], nextMessage: string, previewOnly = false) => {
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      const next = revisePlatform(history.present, { ...current, construction: { ...current.construction, stairSystems: systems } });
      if (previewOnly) setPreview(next); else apply(next, nextMessage);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Stair update rejected."); }
  };
  const updateStairSystem = (update: Partial<StairSystemV3>, nextMessage: string, previewOnly = false) => {
    if (!activeStairSystem) { setMessage("Choose or add a stair system first."); return; }
    replaceStairSystems(platform.construction.stairSystems.map((system) => system.id === activeStairSystem.id ? { ...system, ...update } : system), nextMessage, previewOnly);
  };
  const updateLanding = (update: Partial<StairLandingV3>, nextMessage: string) => {
    if (!activeStairSystem || !activeLanding) { setMessage("Add or select a landing first."); return; }
    updateStairSystem({ landings: activeStairSystem.landings.map((landing) => landing.id === activeLanding.id ? { ...landing, ...update } : landing) }, nextMessage);
  };
  const updateLandingConnection = (connectionId: string, update: Partial<StairLandingConnectionV3>, nextMessage: string) => {
    if (!activeLanding) return;
    updateLanding({ connections: activeLanding.connections.map((connection) => connection.id === connectionId ? { ...connection, ...update } : connection) }, nextMessage);
  };
  const nextSystemId = () => { let index = 1; const used = new Set(platform.construction.stairSystems.map((system) => system.id)); while (used.has(`stair-system-${index}`)) index += 1; return `stair-system-${index}`; };
  const attachStairsToEdge = (edgeId: string, edgeLength: number) => {
    if (activeStairSystem && !activeStairSystem.locked) {
      updateStairSystem({ edgeId, offset: Math.min(activeStairSystem.offset, edgeLength - activeStairSystem.width) }, "Active stair system moved to the selected exact side.");
      return;
    }
    const id = nextSystemId();
    const width = 48;
    const system: StairSystemV3 = Object.freeze({ id, locked: false, edgeId, offset: Math.max(0, Math.min(48, edgeLength - width)), width, treadDepth: 10, maxRiserHeight: 7.75, landings: Object.freeze([]) });
    setSelectedStairSystemId(id); setSelectedLandingId(null);
    setAddingStairSystem(false);
    replaceStairSystems([...platform.construction.stairSystems, system], `Added ${id.replaceAll("-", " ")} on the selected side.`);
  };
  const addLanding = (kind: "top" | "midway") => {
    if (!activeStairSystem || activeStairSystem.locked) { setMessage("Open a stair system before adding a landing."); return; }
    const totalRisers = Math.ceil((platform.elevation - design.siteContext.gradeElevation) / activeStairSystem.maxRiserHeight);
    if (activeStairSystem.landings.some((landing) => !landing.locked)) { setMessage("Lock the current landing before adding another one."); return; }
    if (kind === "top" && activeStairSystem.landings.some((landing) => landing.afterRiser === 0)) { setMessage("Top landing already added."); return; }
    const midwayLandings = activeStairSystem.landings.filter((landing) => landing.afterRiser > 0);
    const previousMidway = midwayLandings.at(-1);
    const afterRiser = kind === "top" ? 0 : previousMidway ? Math.min(totalRisers - 1, previousMidway.afterRiser + Math.max(1, Math.floor((totalRisers - previousMidway.afterRiser) / 2))) : Math.floor(totalRisers / 2);
    if (kind === "midway" && (totalRisers < 2 || (previousMidway && afterRiser <= previousMidway.afterRiser))) { setMessage("No stair rise remains for another landing."); return; }
    const id = `${activeStairSystem.id}-landing-${activeStairSystem.landings.length + 1}`;
    const landing: StairLandingV3 = Object.freeze({ id, locked: false, afterRiser, width: activeStairSystem.width, depth: 48, turn: "straight", connections: Object.freeze([]) });
    setSelectedLandingId(id);
    updateStairSystem({ landings: [...activeStairSystem.landings, landing].sort((a, b) => a.afterRiser - b.afterRiser) }, `${kind === "top" ? "Top" : "Midway"} landing added.`);
  };
  const updateMidwayLandingPosition = (mode: "height" | "distance" | "below" | "above", value: number) => {
    if (!activeStairSystem || !activeLanding || activeLanding.afterRiser === 0) return;
    const totalRisers = Math.ceil((platform.elevation - design.siteContext.gradeElevation) / activeStairSystem.maxRiserHeight);
    const actualRise = (platform.elevation - design.siteContext.gradeElevation) / totalRisers;
    let position = value;
    if (mode === "height") position = (platform.elevation - design.siteContext.gradeElevation - value) / actualRise;
    else if (mode === "distance") position = value / activeStairSystem.treadDepth;
    else if (mode === "above") position = totalRisers - value;
    const afterRiser = Math.max(1, Math.min(totalRisers - 1, Math.round(position)));
    if (activeStairSystem.landings.some((landing) => landing.id !== activeLanding.id && landing.afterRiser === afterRiser)) { setMessage("Another landing already uses that stair position."); return; }
    updateLanding({ afterRiser }, "Landing position updated.");
  };
  const midwayLandingValue = () => {
    if (!activeStairSystem || !activeLanding) return 0;
    if (landingPositionMode === "height") return Math.round(((platform.elevation - design.siteContext.gradeElevation) - activeLanding.afterRiser * activeActualRise) * 100) / 100;
    if (landingPositionMode === "distance") return activeLanding.afterRiser * activeStairSystem.treadDepth;
    return landingPositionMode === "above" ? activeTotalRisers - activeLanding.afterRiser : activeLanding.afterRiser;
  };
  const addLandingConnection = (destination: "deck" | "grade") => {
    if (!activeStairSystem || !activeLanding?.locked) { setMessage("Lock the landing before connecting a flight."); return; }
    if (destination === "deck" && activeLanding.afterRiser === 0) { setMessage("Move this landing below deck height first."); return; }
    const last = activeLanding.connections.at(-1);
    if (last && !last.locked) { setMessage("Lock this flight before adding another."); return; }
    const usedDirections = new Set([activeLanding.turn, ...activeLanding.connections.map((connection) => connection.direction)]);
    const direction = (["left", "right", "straight"] as const).find((candidate) => !usedDirections.has(candidate));
    if (!direction) { setMessage("All landing sides already have stairs."); return; }
    const id = `${activeLanding.id}-connection-${activeLanding.connections.length + 1}`;
    const connection: StairLandingConnectionV3 = Object.freeze({ id, locked: false, destination, direction, width: activeStairSystem.width, treadDepth: activeStairSystem.treadDepth });
    updateLanding({ connections: [...activeLanding.connections, connection] }, `Connected another stair ${destination === "deck" ? "up to deck" : "down to grade"} through this shared landing.`);
  };
  const lockLanding = () => updateLanding({ locked: true }, "Landing locked. Another may now be added.");
  const lockStairSystem = () => {
    if (!activeStairSystem) return;
    const landings = activeStairSystem.landings.map((landing) => ({ ...landing, locked: true, connections: landing.connections.map((connection) => ({ ...connection, locked: true })) }));
    replaceStairSystems(platform.construction.stairSystems.map((system) => system.id === activeStairSystem.id ? { ...system, locked: true, landings } : system), "Stairs locked. Add another set if needed.");
    setSelectedStairSystemId(null); setSelectedLandingId(null);
    setAddingStairSystem(false);
  };
  const beginAddingStairSystem = () => {
    setSelectedStairSystemId(null);
    setSelectedLandingId(null);
    setSelectedEdgeId(null);
    setAddingStairSystem(true);
    setMessage("Adding stairs: tap a deck side, then choose Add stairs here.");
  };
  const updateHouseConnection = (next: DeckDesignV3, attachment: "unknown" | "ledger" | "non-ledger") => apply(next, attachment === "unknown" ? "House updated; connection needs field review." : "House connection updated.");
  const download = () => { const url = URL.createObjectURL(new Blob([stableDeckDesignV3Json(design)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "deck-design-v3.json"; link.click(); URL.revokeObjectURL(url); };
  const applyTemplate = (kind: "rectangle" | "l-shape") => {
    const legacy = updateDesign(DEFAULT_DESIGN, kind === "rectangle" ? { kind } : { kind, cutoutWidth: 48, cutoutDepth: 48 });
    const next = migrateDeckDesignToV3({ ...legacy, id: design.id, name: design.name, metadata: { ...legacy.metadata, revision: design.metadata.revision + 1 } });
    apply(next, `${kind === "rectangle" ? "Rectangle" : "L-shape"} template applied in v3.`); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setAddingStairSystem(true); setWorkflowStage("layout");
  };
  const photoBounds = platform.region.outer.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const initialPhotoFacts: ConfirmedPhotoFacts = {
    designName: design.name,
    layoutIntent: "rectangle",
    width: photoBounds.maxX - photoBounds.minX,
    projection: photoBounds.maxZ - photoBounds.minZ,
    surfaceElevation: null,
    doorWidth: null,
    attachment: platform.edgeConditions.find((condition) => condition.condition === "house_attachment")?.attachment as "unknown" | "ledger" | "non-ledger" | undefined ?? "unknown",
  };
  const startFromPhotos = (facts: ConfirmedPhotoFacts, review: PhotoIntakeReview, photoCount: number, confirmedOuter?: readonly PolygonPoint[], stairEdgeId?: string | null, stairOffset?: number | null, stairWidth?: number) => {
    const next = createDesignFromConfirmedPhotoFacts(history.present, facts, confirmedOuter, stairEdgeId, stairOffset, stairWidth);
    setPreview(null);
    dispatch({ type: "reset", design: next });
    setSelectedPlatformId(next.platforms[0].id);
    setSelectedEdgeId(null);
    setSelectedStairSystemId(next.platforms[0].construction.stairSystems.find((system) => !system.locked)?.id ?? null);
    setSelectedLandingId(next.platforms[0].construction.stairSystems.find((system) => !system.locked)?.landings.find((landing) => !landing.locked)?.id ?? null);
    setAddingStairSystem(next.platforms[0].construction.stairSystems.length === 0);
    setWorkflowStage("layout");
    setPhotoStartSummary(Object.freeze({ photoCount, review }));
    setPhotoIntakeOpen(false);
    setMessage(facts.layoutIntent === "non-standard"
      ? `Created a confirmed ${next.platforms[0].region.outer.length}-corner traced outline.`
      : `Created a confirmed ${formatFeetInches(facts.width)} × ${formatFeetInches(facts.projection)} rectangle.`);
  };

  return <main>
    {photoIntakeOpen && <Suspense fallback={<div className="photo-intake-backdrop"><div className="photo-intake-loading" role="status">Preparing local photo review…</div></div>}><PhotoIntake initialFacts={initialPhotoFacts} fallbackSurfaceElevation={platform.elevation} gradeElevation={design.siteContext.gradeElevation} onCancel={() => setPhotoIntakeOpen(false)} onStartDesign={startFromPhotos} /></Suspense>}
    <header className="topbar"><div className="brand-mark">M</div><div><p className="eyebrow">McKenzie Construction · isolated R&amp;D</p><h1>Deck Designer</h1></div><div className="header-actions"><button className="quiet" onClick={() => setPhotoIntakeOpen(true)}>Start with photos</button><button className="quiet" onClick={() => { saveDeckDesignV3(localStorage, design); setMessage(`Saved v3 locally at revision ${design.metadata.revision}.`); }}>Save locally</button><button className="quiet" onClick={download}>Download JSON</button><button className="primary" onClick={() => fileInput.current?.click()}>Load JSON</button><input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const next = migrateDeckDesignToV3(JSON.parse(await file.text())); dispatch({ type: "reset", design: next }); setSelectedPlatformId(next.platforms[0].id); setWorkflowStage("layout"); setSelectedEdgeId(null); const nextSystem = next.platforms[0].construction.stairSystems.find((system) => !system.locked); setSelectedStairSystemId(nextSystem?.id ?? null); setSelectedLandingId(nextSystem?.landings.find((landing) => !landing.locked)?.id ?? null); setAddingStairSystem(next.platforms[0].construction.stairSystems.length === 0); setMessage(`Loaded v3 design “${next.name}”.`); } catch (error) { setMessage(error instanceof Error ? `Load rejected: ${error.message}` : "Load rejected."); } event.target.value = ""; }} /></div></header>
    <section className="warning"><strong>Conceptual design — not for construction.</strong> Geometry and quantities are deterministic; field, structure, connection, and code review remain required.</section>
    <nav className="designer-stage-nav" aria-label="Deck design stages"><button className={workflowStage === "layout" ? "active" : "complete"} onClick={returnToLayoutStage}><span>1</span> Deck layout</button><button className={workflowStage === "railings" ? "active" : ""} onClick={workflowStage === "layout" ? enterRailingStage : undefined}><span>2</span> Railings</button><span className="stage-coming-soon">Materials and review come next</span></nav>
    {workflowStage === "layout" ? <nav className="mobile-workspace-nav" aria-label="Mobile designer sections"><a href="#design-views">Plan &amp; 3D</a><a href="#design-controls">Shape</a><a href="#side-options">Stairs</a><a href="#house-connection">House</a></nav> : <nav className="mobile-workspace-nav railing-mobile-nav" aria-label="Mobile railing sections"><a href="#design-views">Railing plan</a><a href="#railing-controls">Railing controls</a></nav>}
    <div className="workspace"><aside className="controls-panel" id="design-controls">
      {workflowStage === "layout" ? <>
      <div className="section-heading"><span>01</span><div><p>Deck outline</p><small>Move corners or add rectangular offsets</small></div></div>
      {photoStartSummary && <section className={`photo-start-summary${photoStartSummary.review.outlineWarning ? " needs-outline" : ""}`}><strong>Photo-assisted start</strong><p>{photoStartSummary.photoCount} local photo{photoStartSummary.photoCount === 1 ? "" : "s"} reviewed. Only confirmed entries and tracing created geometry.</p>{photoStartSummary.review.outlineWarning && <p className="outline-warning">{photoStartSummary.review.outlineWarning}</p>}<small>{photoStartSummary.review.fieldVerification.length} field note{photoStartSummary.review.fieldVerification.length === 1 ? "" : "s"} remain.</small><button onClick={() => setPhotoIntakeOpen(true)}>Review other photos</button></section>}
      <div className="shape-switch"><button onClick={() => applyTemplate("rectangle")}>Rectangle</button><button onClick={() => applyTemplate("l-shape")}>L-shape</button></div>
      <label className="field full"><span>Design name</span><input value={design.name} onChange={(event) => { try { apply(normalizeDeckDesignV3({ ...history.present, name: event.target.value, metadata: { ...history.present.metadata, revision: history.present.metadata.revision + 1 } }), "Design name updated."); } catch { /* retain */ } }} /></label>
      {design.platforms.length > 1 && <label className="field full"><span>Platform to edit</span><select value={platform.id} onChange={(event) => { setSelectedPlatformId(event.target.value); setSelectedEdgeId(null); }} >{design.platforms.map((item) => <option key={item.id} value={item.id}>{item.id} · {formatFeetInches(item.elevation)} high</option>)}</select></label>}
      <label className="field full"><span>Drag step</span><select value={snapIncrement} onChange={(event) => setSnapIncrement(Number(event.target.value))}><option value="1">1 inch · fine</option><option value="6">6 inches · standard</option><option value="12">12 inches · coarse</option></select></label>
      <div className="field-grid"><V3NumberField label="Deck height" value={platform.elevation} onCommit={(value) => updatePlatform({ elevation: value }, "Deck height updated.")} /><V3NumberField label="Joist spacing" value={platform.construction.framing.joistSpacing} onCommit={(value) => updateConstruction({ ...platform.construction, framing: { ...platform.construction.framing, joistSpacing: value } }, "Joist layout spacing updated.")} /></div>
      {hasEdgeReferences && <section className="selected-edge-card review-card"><strong>Edit deck outline</strong><p>Side options must be cleared before reshaping.</p><button className="primary" onClick={unlockOutline}>Edit deck outline</button><small>Reattach stairs and side options afterward.</small></section>}
      <p className="offset-action-status" role="status">Tap a plan side for its actions.</p>
      <p className="outline-edit-feedback" aria-live="polite">{message}</p>
      <div className="corner-list">{platform.region.outer.map((point, index) => <section className="corner-row" key={index}><strong>Corner {index + 1}</strong><V3NumberField label="Left / right" value={point.x} onCommit={(value) => moveCorner(index, { ...point, x: value }, true)} /><V3NumberField label="Away" value={point.z} onCommit={(value) => moveCorner(index, { ...point, z: value }, true)} /><button disabled={platform.region.outer.length <= 4} onClick={() => removeCorner(index)}>Remove</button></section>)}</div>
      <div className="section-heading compact" id="side-options"><span>02</span><div><p>Stairs</p><small>Select the side where the stairs belong</small></div></div>
      {platform.construction.stairSystems.length > 0 && <div className="stair-system-list">{platform.construction.stairSystems.map((system, index) => <button key={system.id} className={`stair-system-summary${system.id === activeStairSystem?.id ? " active" : ""}`} onClick={() => { setAddingStairSystem(false); setSelectedStairSystemId(system.id); setSelectedLandingId(system.landings.find((landing) => !landing.locked)?.id ?? system.landings[0]?.id ?? null); }}><strong>Stair system {index + 1}</strong><small>{system.landings.length} landing{system.landings.length === 1 ? "" : "s"} · {system.locked ? "locked · tap to reopen" : "editing"}</small></button>)}</div>}
      {!activeStairSystem && !addingStairSystem && <section className="selected-edge-card stair-add-next"><strong>Finished stairs</strong><p>Reopen one or add another.</p><button className="primary" onClick={beginAddingStairSystem}>Add stairs</button></section>}
      {!activeStairSystem && addingStairSystem && <section className="selected-edge-card stair-add-next active-add-mode" role="status"><strong>Adding stairs</strong><p>Tap a side, then Add stairs here.</p>{platform.construction.stairSystems.length > 0 && <button onClick={() => { setAddingStairSystem(false); setSelectedEdgeId(null); setMessage("Canceled."); }}>Cancel</button>}</section>}
      {selectedEdgeId ? (() => { const edge = geometry.platformEdges.find((item) => item.id === selectedEdgeId)!; const width = activeStairSystem?.width ?? 48; const stairActionEnabled = Boolean(activeStairSystem && !activeStairSystem.locked) || addingStairSystem; return <section className="selected-edge-card"><strong>{formatFeetInches(edge.length)} side selected</strong><div className="selected-edge-actions contextual"><button disabled={hasEdgeReferences} onClick={() => addBumpoutToEdge(edge.id)}>{hasEdgeReferences ? "Edit shape first" : "Add bumpout here"}</button><button disabled={edge.length < width || !stairActionEnabled} onClick={() => attachStairsToEdge(edge.id, edge.length)}>{activeStairSystem ? "Move active stairs here" : "Add stairs here"}</button></div></section>; })() : <p className="section-help">{activeStairSystem ? "Tap a side to move these stairs." : addingStairSystem ? "Tap a side to place stairs." : "Choose stairs above."}</p>}
      {activeStairSystem && <section className="selected-edge-card stair-configuration">
        <strong>{activeStairSystem.id.replaceAll("-", " ")}</strong>
        <p>{activeStairSystem.locked ? "Locked. Reopen to edit." : "Lock each landing, then lock this stair system."}</p>
        {activeStairSystem.locked ? <button onClick={() => updateStairSystem({ locked: false }, "Stair system reopened for explicit editing.")}>Edit this stair system</button> : <>
          <div className="field-grid"><V3NumberField label="Stair position" value={activeStairSystem.offset} onCommit={(value) => updateStairSystem({ offset: value }, "Stair position updated exactly.")} /><V3NumberField label="Stair width" value={activeStairSystem.width} onCommit={(value) => updateStairSystem({ width: value, landings: activeStairSystem.landings.map((landing) => ({ ...landing, width: Math.max(landing.width, value) })) }, "Stair width updated exactly.")} /><V3NumberField label="Step depth" value={activeStairSystem.treadDepth} onCommit={(value) => updateStairSystem({ treadDepth: value }, "Step depth updated exactly.")} /></div>
          <div className="stair-railing-note"><strong>Stair railings included</strong><small>Tracked separately from deck railings.</small></div>
          <div className="landing-sequence">{activeStairSystem.landings.map((landing) => <button key={landing.id} className={landing.id === activeLanding?.id ? "active" : ""} onClick={() => setSelectedLandingId(landing.id)}><strong>{landing.afterRiser === 0 ? "Top landing" : "Midway landing"}</strong><small>after step {landing.afterRiser} · {landing.connections.length} connected · {landing.locked ? "locked" : "editing"}</small></button>)}</div>
          {activeLanding && <div className="stair-landing-controls">
            {activeLanding.afterRiser === 0 ? <div className="stair-railing-note"><strong>Top landing</strong><small>At deck height before the first stair.</small></div> : <>
              <div className="stair-railing-note"><strong>Midway landing position</strong><small>Choose the measurement you know.</small></div>
              <label className="field"><span>Set midway landing by</span><select value={landingPositionMode} onChange={(event) => setLandingPositionMode(event.target.value as typeof landingPositionMode)}><option value="height">Height above grade</option><option value="distance">Distance from deck edge</option><option value="below">Steps below deck</option><option value="above">Steps above grade</option></select></label>
              <V3NumberField label={landingPositionMode === "height" ? "Height above grade (in)" : landingPositionMode === "distance" ? "Distance from deck (in)" : landingPositionMode === "above" ? "Steps above grade" : "Steps below deck"} value={midwayLandingValue()} step={landingPositionMode === "above" || landingPositionMode === "below" ? 1 : .25} onCommit={(value) => updateMidwayLandingPosition(landingPositionMode, value)} />
            </>}
            <div className="field-grid"><V3NumberField label="Landing width" value={activeLanding.width} onCommit={(value) => updateLanding({ width: value }, "Landing width updated exactly.")} /><V3NumberField label="Landing depth" value={activeLanding.depth} onCommit={(value) => updateLanding({ depth: value }, "Landing depth updated exactly.")} /></div>
            <fieldset><legend>Direction after landing</legend><div className="toggle-grid">{(["straight", "left", "right"] as const).map((turn) => <button type="button" key={turn} className={`toggle${activeLanding.turn === turn ? " active" : ""}`} onClick={() => updateLanding({ turn, depth: turn === "straight" ? activeLanding.depth : Math.max(activeLanding.depth, activeStairSystem.width) }, `Stairs continue ${turn}.`)}>{turn}</button>)}</div><small>Viewed walking down.</small></fieldset>
            {!activeLanding.locked && <button className="primary" onClick={lockLanding}>Lock this landing</button>}
            {activeLanding.locked && <Suspense fallback={<div className="house-editor-loading" role="status">Preparing shared landing controls…</div>}><LandingConnectionsEditor landing={activeLanding} onAdd={addLandingConnection} onUpdateLanding={(connections, nextMessage) => updateLanding({ connections }, nextMessage)} onUpdateConnection={updateLandingConnection} /></Suspense>}
          </div>}
          <div className="selected-edge-actions contextual"><button disabled={activeStairSystem.landings.some((landing) => !landing.locked) || activeStairSystem.landings.some((landing) => landing.afterRiser === 0)} onClick={() => addLanding("top")}>Add top landing</button><button disabled={activeTotalRisers < 2 || activeStairSystem.landings.some((landing) => !landing.locked) || activeStairSystem.landings.some((landing) => landing.afterRiser === activeTotalRisers - 1)} onClick={() => addLanding("midway")}>Add midway landing</button><button className="primary" onClick={lockStairSystem}>Lock this stair system</button></div>
          <button className="remove-stairs" onClick={() => { const remaining = platform.construction.stairSystems.filter((system) => system.id !== activeStairSystem.id); replaceStairSystems(remaining, "Stairs removed; they can be added again."); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedEdgeId(null); setAddingStairSystem(remaining.length === 0); }}>Remove this stair system</button>
        </>}
      </section>}
      <Suspense fallback={<div className="house-editor-loading" role="status">Preparing house connection…</div>}><HouseConnectionEditor design={design} platform={platform} onApply={updateHouseConnection} onError={setMessage} /></Suspense>
      <section className="stage-continue-card"><span>Layout ready?</span><strong>Lock it before choosing railings.</strong><button className="primary" onClick={enterRailingStage}>Lock layout &amp; continue to railings</button><small>You can return later.</small></section>
      </> : <Suspense fallback={<div className="house-editor-loading" role="status">Preparing railing workspace…</div>}><RailingStageControls platform={platform} geometry={geometry} selectedEdgeId={selectedEdgeId} onRailingChange={applyRailing} onHeight={(height) => updateConstruction({ ...platform.construction, railing: { ...platform.construction.railing, height } }, "Railing height updated exactly.")} onBack={returnToLayoutStage} /></Suspense>}
      <div className="history-actions"><button disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>Undo</button><button disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>Redo</button></div>
      <div className="design-facts"><div><span>Schema</span><strong>DeckDesign v3</strong></div><div><span>Revision</span><strong>{design.metadata.revision}</strong></div><div><span>Fingerprint</span><code>{deckDesignV3Fingerprint(design)}</code></div></div><p className="status-message" aria-live="polite">{message}</p>
    </aside><section className="visual-area" id="design-views">
      <article className="view-card plan-card"><div className="card-title"><div><span>{workflowStage === "layout" ? "Measured polygon plan" : "Railing plan"}</span><small>{workflowStage === "layout" ? `2D · ${platform.id} · ${platform.region.outer.length} corners` : "2D · tap a side for railing"}</small></div><strong>{formatFeetInches(platform.elevation)} high</strong></div><PlanViewV3 platform={platform} activeStairSystem={activeStairSystem} geometry={visibleGeometry} houseGeometry={houseGeometry} snapIncrement={snapIncrement} editingEnabled={workflowStage === "layout"} selectedEdgeId={selectedEdgeId} onSelectEdge={setSelectedEdgeId} onCornerPreview={(index, point) => moveCorner(index, point, false)} onCornerCommit={(index, point) => moveCorner(index, point, true)} onCancel={() => setPreview(null)} onStairPreview={(offset) => updateStairSystem({ offset }, "", true)} onStairCommit={(offset) => updateStairSystem({ offset }, `Stairs moved to ${formatFeetInches(offset)}.`)} onSegmentPreview={(index, distance) => moveSegment(index, distance, false)} onSegmentCommit={(index, distance) => moveSegment(index, distance, true)} />
        {workflowStage === "layout" ? <section className="mobile-plan-edge-actions" aria-live="polite">{selectedEdgeId ? (() => { const edge = geometry.platformEdges.find((item) => item.id === selectedEdgeId)!; const width = activeStairSystem?.width ?? 48; const stairActionEnabled = Boolean(activeStairSystem && !activeStairSystem.locked) || addingStairSystem; return <><div><strong>{formatFeetInches(edge.length)} side selected</strong><small>{hasEdgeReferences ? "Shape locked. Unlock above to add a bumpout." : "Actions affect this side."}</small></div><button disabled={hasEdgeReferences} onClick={() => addBumpoutToEdge(edge.id)}>{hasEdgeReferences ? "Edit shape first" : "Add bumpout here"}</button><button className="primary" disabled={edge.length < width || !stairActionEnabled} onClick={() => attachStairsToEdge(edge.id, edge.length)}>{activeStairSystem ? "Move active stairs here" : "Add stairs here"}</button>{!stairActionEnabled && <small>Open Stairs below, then Add stairs.</small>}</>; })() : <p>{addingStairSystem ? "Adding stairs: tap their deck side." : "Tap a side to show its actions."}</p>}</section> : <Suspense fallback={<div className="mobile-plan-edge-actions"><p>Preparing railing controls…</p></div>}><RailingMobileActions platform={platform} geometry={geometry} selectedEdgeId={selectedEdgeId} onRailingChange={applyRailing} /></Suspense>}
      </article>
      <article className="view-card three-card"><div className="card-title"><div><span>{workflowStage === "layout" ? "Model view" : "Railing model"}</span><small>3D · polygon authority</small></div><div className="view-tools"><select value={quality} aria-label="3D quality" onChange={(event) => setQuality(event.target.value as RenderQuality)}><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select><div className="camera-buttons">{(["perspective", "top", "front"] as CameraPreset[]).map((value) => <button key={value} className={preset === value ? "active" : ""} onClick={() => { setPreset(value); setPresetRequest((current) => current + 1); }}>{value}</button>)}</div></div></div><Suspense fallback={<div className="three-loading">Preparing polygon model…</div>}><ThreeViewV3 platform={platform} geometry={visibleGeometry} houseGeometry={houseGeometry} gradeElevation={design.siteContext.gradeElevation} preset={preset} presetRequest={presetRequest} showFraming={showFraming} quality={quality} /></Suspense><label className="check-row three-framing"><input type="checkbox" checked={showFraming} onChange={(event) => setShowFraming(event.target.checked)} />Show framing intent</label></article>
    </section></div>
    <section className="quantity-section"><div className="quantity-heading"><div><p className="eyebrow">Deterministic v3 projection</p><h2>Conceptual quantities</h2></div><p>{photoStartSummary?.review.outlineWarning ? "Envelope quantities only until the outline is reshaped." : "No products, prices, labor, margin, or structural conclusions."}</p></div><div className="quantity-grid">{projection.aggregateQuantities.map((line) => <article className="quantity-card" key={line.key}><span>{line.key.replaceAll("-", " ")}</span><strong>{line.amount.toLocaleString()} <small>{line.unit}</small></strong><p>From {line.sourceGeometry.length} geometry references.</p></article>)}</div></section>
  </main>;
}

function V3NumberField({ label, value, step = .25, onCommit }: { label: string; value: number; step?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="field"><span>{label}</span><input type="number" step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onCommit(Number(draft)); setDraft(String(value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}
