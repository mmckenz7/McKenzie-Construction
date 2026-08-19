import { Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyPolygonRegionReplacement, PolygonEdgeReviewRequiredError } from "./commandsV3";
import { deriveDeckDesignProjectionV3 } from "./designProjectionV3";
import { derivePlatformGeometryV3 } from "./geometryV3";
import { createHistoryV3, designHistoryReducerV3 } from "./historyV3";
import { DEFAULT_DESIGN, updateDesign } from "./model";
import { deckDesignV3Fingerprint, migrateDeckDesignToV3, normalizeDeckDesignV3, stableDeckDesignV3Json, type DeckDesignV3, type DeckPlatformV3 } from "./modelV3";
import { PlanViewV3 } from "./PlanViewV3";
import { formatFeetInches } from "./PlanView";
import { saveDeckDesignV3 } from "./storageV3";
import type { CameraPreset } from "./ThreeView";
import type { RenderQuality } from "./renderQuality";
import { addCornerOnEdge, movePolygonSegment } from "./polygonEditorV3";

const ThreeViewV3 = lazy(async () => ({ default: (await import("./ThreeViewV3")).ThreeViewV3 }));
type Point = Readonly<{ x: number; z: number }>;

function revisePlatform(design: DeckDesignV3, platform: DeckPlatformV3): DeckDesignV3 {
  return normalizeDeckDesignV3({ ...design, platforms: design.platforms.map((item) => item.id === platform.id ? platform : item), metadata: { ...design.metadata, revision: design.metadata.revision + 1 } });
}

export function V3App({ initialDesign, initialMessage = "Corner editor ready." }: { initialDesign: DeckDesignV3; initialMessage?: string }) {
  const [history, dispatch] = useReducer(designHistoryReducerV3, initialDesign, createHistoryV3);
  const [preview, setPreview] = useState<DeckDesignV3 | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState(initialDesign.platforms[0].id);
  const design = preview ?? history.present;
  const platform = design.platforms.find((item) => item.id === selectedPlatformId) ?? design.platforms[0];
  const geometry = useMemo(() => derivePlatformGeometryV3(design, platform.id), [design, platform.id]);
  const projection = useMemo(() => deriveDeckDesignProjectionV3(design), [design]);
  const [message, setMessage] = useState(initialMessage);
  const [snapIncrement, setSnapIncrement] = useState(6);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [offsetComplete, setOffsetComplete] = useState(false);
  const [addCornerMode, setAddCornerMode] = useState(false);
  const [showFraming, setShowFraming] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("perspective");
  const [presetRequest, setPresetRequest] = useState(0);
  const [quality, setQuality] = useState<RenderQuality>("balanced");
  const fileInput = useRef<HTMLInputElement>(null);
  const hasEdgeReferences = platform.edgeConditions.some((condition) => condition.condition === "house_attachment") || platform.construction.railing.enabledEdgeIds.length > 0 || platform.construction.stairs.enabled;
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
        setMessage(`Outline edit paused for explicit review: ${affected} references would change. Use “Unlock outline editing” or move those options first.`);
      } else setMessage(error instanceof Error ? `Outline rejected: ${error.message}` : "Outline rejected.");
      return false;
    }
  };
  const moveCorner = (index: number, point: Point, commit: boolean) => replaceRegion(platform.region.outer.map((current, currentIndex) => currentIndex === index ? point : current), commit);
  const addCorner = (edgeIndex: number, point: Point) => {
    try {
      const outer = addCornerOnEdge(platform.region.outer, edgeIndex, point, snapIncrement);
      if (replaceRegion(outer, true)) {
        setAddCornerMode(false);
        setOffsetComplete(false);
        setMessage("Corner added. Drag the new corner, any existing corner, or a square segment handle to refine the outline.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Corner could not be added.");
    }
  };
  const moveSegment = (edgeIndex: number, distance: number, commit: boolean) => {
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      replaceRegion(movePolygonSegment(current.region.outer, edgeIndex, distance, snapIncrement), commit);
      if (commit) setMessage("Segment moved with both attached corners; neighboring segments remained connected.");
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
        stairs: { ...current.construction.stairs, enabled: false },
      },
    };
    apply(revisePlatform(history.present, unlocked), "Outline unlocked by your command: edge attachments and railings were cleared and stairs were turned off. Add them back after shaping the deck.");
  };
  const addOffset = () => {
    const edgeIndex = geometry.platformEdges.findIndex((edge) => edge.id === selectedEdgeId);
    if (edgeIndex < 0) { setMessage("Select the edge where you want the offset first."); return; }
    const edge = geometry.platformEdges[edgeIndex];
    const inset = 24;
    const entry = { x: edge.start.x + (edge.end.x - edge.start.x) / 3, z: edge.start.z + (edge.end.z - edge.start.z) / 3 };
    const exit = { x: edge.start.x + (edge.end.x - edge.start.x) * 2 / 3, z: edge.start.z + (edge.end.z - edge.start.z) * 2 / 3 };
    const innerEntry = { x: entry.x - edge.outward.x * inset, z: entry.z - edge.outward.z * inset };
    const innerExit = { x: exit.x - edge.outward.x * inset, z: exit.z - edge.outward.z * inset };
    const next = [...platform.region.outer];
    next.splice(edgeIndex + 1, 0, entry, innerEntry, innerExit, exit);
    if (replaceRegion(next, true)) {
      setSelectedEdgeId(null);
      setOffsetComplete(true);
    }
  };
  const removeCorner = (index: number) => {
    if (platform.region.outer.length <= 4) { setMessage("Keep at least four corners in this orthogonal deck editor."); return; }
    replaceRegion(platform.region.outer.filter((_, current) => current !== index), true);
  };
  const toggleRail = (edgeId: string) => {
    const railing = platform.construction.railing;
    const enabledEdgeIds = railing.enabledEdgeIds.includes(edgeId) ? railing.enabledEdgeIds.filter((id) => id !== edgeId) : [...railing.enabledEdgeIds, edgeId];
    updateConstruction({ ...platform.construction, railing: { ...railing, enabledEdgeIds } }, "Railing intent updated on the exact geometric edge.");
  };
  const updateStairs = (update: Partial<DeckPlatformV3["construction"]["stairs"]>, nextMessage: string, previewOnly = false) => {
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      const next = revisePlatform(history.present, { ...current, construction: { ...current.construction, stairs: { ...current.construction.stairs, ...update } } });
      if (previewOnly) setPreview(next); else apply(next, nextMessage);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Stair update rejected."); }
  };
  const download = () => { const url = URL.createObjectURL(new Blob([stableDeckDesignV3Json(design)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "deck-design-v3.json"; link.click(); URL.revokeObjectURL(url); };
  const applyTemplate = (kind: "rectangle" | "l-shape") => {
    const legacy = updateDesign(DEFAULT_DESIGN, kind === "rectangle" ? { kind } : { kind, cutoutWidth: 48, cutoutDepth: 48 });
    const next = migrateDeckDesignToV3({ ...legacy, id: design.id, name: design.name, metadata: { ...legacy.metadata, revision: design.metadata.revision + 1 } });
    apply(next, `${kind === "rectangle" ? "Rectangle" : "L-shape"} template applied in v3.`); setSelectedEdgeId(null); setOffsetComplete(false);
  };

  return <main>
    <header className="topbar"><div className="brand-mark">M</div><div><p className="eyebrow">McKenzie Construction · isolated R&amp;D</p><h1>Deck Designer</h1></div><div className="header-actions"><button className="quiet" onClick={() => { saveDeckDesignV3(localStorage, design); setMessage(`Saved v3 locally at revision ${design.metadata.revision}.`); }}>Save locally</button><button className="quiet" onClick={download}>Download JSON</button><button className="primary" onClick={() => fileInput.current?.click()}>Load JSON</button><input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const next = migrateDeckDesignToV3(JSON.parse(await file.text())); dispatch({ type: "reset", design: next }); setMessage(`Loaded v3 design “${next.name}”.`); } catch (error) { setMessage(error instanceof Error ? `Load rejected: ${error.message}` : "Load rejected."); } event.target.value = ""; }} /></div></header>
    <section className="warning"><strong>Conceptual design — not for construction.</strong> Corner geometry and quantities are deterministic; structure, connections, code, and field dimensions still require qualified review.</section>
    <div className="workspace"><aside className="controls-panel">
      <div className="section-heading"><span>01</span><div><p>Deck outline</p><small>Move corners or add rectangular offsets</small></div></div>
      <div className="shape-switch"><button onClick={() => applyTemplate("rectangle")}>Rectangle</button><button onClick={() => applyTemplate("l-shape")}>L-shape</button></div>
      <label className="field full"><span>Design name</span><input value={design.name} onChange={(event) => { try { apply(normalizeDeckDesignV3({ ...history.present, name: event.target.value, metadata: { ...history.present.metadata, revision: history.present.metadata.revision + 1 } }), "Design name updated."); } catch { /* retain */ } }} /></label>
      {design.platforms.length > 1 && <label className="field full"><span>Platform to edit</span><select value={platform.id} onChange={(event) => { setSelectedPlatformId(event.target.value); setSelectedEdgeId(null); }} >{design.platforms.map((item) => <option key={item.id} value={item.id}>{item.id} · {formatFeetInches(item.elevation)} high</option>)}</select></label>}
      <label className="field full"><span>Drag step</span><select value={snapIncrement} onChange={(event) => setSnapIncrement(Number(event.target.value))}><option value="1">1 inch · fine</option><option value="6">6 inches · standard</option><option value="12">12 inches · coarse</option></select></label>
      <div className="field-grid"><V3NumberField label="Deck height" value={platform.elevation} onCommit={(value) => updatePlatform({ elevation: value }, "Deck height updated.")} /><V3NumberField label="Joist spacing" value={platform.construction.framing.joistSpacing} onCommit={(value) => updateConstruction({ ...platform.construction, framing: { ...platform.construction.framing, joistSpacing: value } }, "Joist layout spacing updated.")} /></div>
      {hasEdgeReferences && <section className="selected-edge-card review-card"><strong>Unlock corner editing</strong><p>The current house, railing, or stair options are attached to exact edges. Unlocking clears those edge options so the outline can change safely.</p><button className="primary" onClick={unlockOutline}>Unlock corner editing</button><small>Stairs are turned off and edge options are cleared. Reattach them after shaping the deck.</small></section>}
      <button className={`primary full-action add-corner-button${addCornerMode ? " active" : ""}`} disabled={hasEdgeReferences} aria-pressed={addCornerMode} onClick={() => setAddCornerMode((current) => !current)}>{addCornerMode ? "Cancel adding corner" : "Add corner"}</button>
      <p className={`offset-action-status${addCornerMode ? " ready" : ""}`} role="status">{hasEdgeReferences ? "Unlock corner editing above first." : addCornerMode ? "Now click the outline segment where the new corner should go." : "Drag round corner handles or square segment handles directly in the plan."}</p>
      <div className="section-heading compact preset-offset-heading"><span>+</span><div><p>Preset rectangular offset</p><small>Optional shortcut for a standard notch</small></div></div>
      <label className="field full"><span>Step 2 · Choose the offset edge</span><select disabled={hasEdgeReferences} value={selectedEdgeId ?? ""} onChange={(event) => { setSelectedEdgeId(event.target.value || null); setOffsetComplete(false); }}><option value="">Select an edge…</option>{geometry.platformEdges.map((edge, index) => <option value={edge.id} key={edge.id}>Edge {index + 1} · {formatFeetInches(edge.length)}</option>)}</select><small className="field-help">You can also click an edge directly in the measured plan.</small></label>
      <button className="primary full-action" disabled={hasEdgeReferences || !selectedEdgeId} title={hasEdgeReferences ? "Unlock corner editing first." : !selectedEdgeId && !offsetComplete ? "Choose an edge first." : undefined} onClick={addOffset}>{offsetComplete ? "Offset added ✓" : "Step 3 · Add rectangular offset"}</button>
      <p className={`offset-action-status${offsetComplete || (!hasEdgeReferences && selectedEdgeId) ? " ready" : ""}`} role="status">{hasEdgeReferences ? "Start with Step 1 above." : offsetComplete ? "Offset added successfully. Select another edge only if you want a second offset." : selectedEdgeId ? "Ready — add the offset, then adjust its corners." : "Corner editing is unlocked. Choose an edge for Step 2."}</p>
      <p className="section-help">Adds a 2-foot-deep rectangular offset to the selected edge. Repeat these last two steps on another edge for a deck with two offsets.</p>
      <div className="corner-list">{platform.region.outer.map((point, index) => <section className="corner-row" key={index}><strong>Corner {index + 1}</strong><V3NumberField label="Left / right" value={point.x} onCommit={(value) => moveCorner(index, { ...point, x: value }, true)} /><V3NumberField label="Away" value={point.z} onCommit={(value) => moveCorner(index, { ...point, z: value }, true)} /><button disabled={platform.region.outer.length <= 4} onClick={() => removeCorner(index)}>Remove</button></section>)}</div>
      <div className="section-heading compact"><span>02</span><div><p>Selected edge</p><small>Railings and stairs use exact edge references</small></div></div>
      {selectedEdgeId ? (() => { const edge = geometry.platformEdges.find((item) => item.id === selectedEdgeId)!; return <section className="selected-edge-card"><strong>{formatFeetInches(edge.length)} edge</strong><div className="selected-edge-actions"><button onClick={() => toggleRail(edge.id)}>Toggle railing</button><button disabled={edge.length < platform.construction.stairs.width} onClick={() => updateStairs({ enabled: true, edgeId: edge.id, offset: Math.min(platform.construction.stairs.offset, edge.length - platform.construction.stairs.width) }, "Stairs attached to the selected exact edge.")}>Attach stairs</button></div></section>; })() : <p className="section-help">Click an edge in the plan or choose one above.</p>}
      {platform.construction.stairs.enabled && <section className="selected-edge-card"><strong>Movable stairs</strong><p>Drag the orange-outlined handle in the plan.</p><div className="field-grid"><V3NumberField label="Stair position" value={platform.construction.stairs.offset} onCommit={(value) => updateStairs({ offset: value }, "Stair position updated exactly.")} /><V3NumberField label="Stair width" value={platform.construction.stairs.width} onCommit={(value) => updateStairs({ width: value }, "Stair width updated exactly.")} /><V3NumberField label="Step depth" value={platform.construction.stairs.treadDepth} onCommit={(value) => updateStairs({ treadDepth: value }, "Step depth updated exactly.")} /></div><button onClick={() => updateStairs({ enabled: false }, "Stairs removed.")}>Remove stairs</button></section>}
      <div className="history-actions"><button disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>Undo</button><button disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>Redo</button></div>
      <div className="design-facts"><div><span>Schema</span><strong>DeckDesign v3</strong></div><div><span>Revision</span><strong>{design.metadata.revision}</strong></div><div><span>Fingerprint</span><code>{deckDesignV3Fingerprint(design)}</code></div></div><p className="status-message" aria-live="polite">{message}</p>
    </aside><section className="visual-area">
      <article className="view-card plan-card"><div className="card-title"><div><span>Measured polygon plan</span><small>2D · {platform.id} · {platform.region.outer.length} editable corners</small></div><strong>{formatFeetInches(platform.elevation)} high</strong></div><PlanViewV3 platform={platform} geometry={geometry} snapIncrement={snapIncrement} selectedEdgeId={selectedEdgeId} onSelectEdge={(edgeId) => { setSelectedEdgeId(edgeId); setOffsetComplete(false); }} onCornerPreview={(index, point) => moveCorner(index, point, false)} onCornerCommit={(index, point) => moveCorner(index, point, true)} onCancel={() => setPreview(null)} onStairPreview={(offset) => updateStairs({ offset }, "", true)} onStairCommit={(offset) => updateStairs({ offset }, `Stairs moved to ${formatFeetInches(offset)} from the edge start.`)} addCornerMode={addCornerMode} onAddCorner={addCorner} onSegmentPreview={(index, distance) => moveSegment(index, distance, false)} onSegmentCommit={(index, distance) => moveSegment(index, distance, true)} /></article>
      <article className="view-card three-card"><div className="card-title"><div><span>Model view</span><small>3D · polygon authority</small></div><div className="view-tools"><select value={quality} aria-label="3D quality" onChange={(event) => setQuality(event.target.value as RenderQuality)}><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select><div className="camera-buttons">{(["perspective", "top", "front"] as CameraPreset[]).map((value) => <button key={value} className={preset === value ? "active" : ""} onClick={() => { setPreset(value); setPresetRequest((current) => current + 1); }}>{value}</button>)}</div></div></div><Suspense fallback={<div className="three-loading">Preparing polygon model…</div>}><ThreeViewV3 platform={platform} geometry={geometry} gradeElevation={design.siteContext.gradeElevation} preset={preset} presetRequest={presetRequest} showFraming={showFraming} quality={quality} /></Suspense><label className="check-row three-framing"><input type="checkbox" checked={showFraming} onChange={(event) => setShowFraming(event.target.checked)} />Show framing intent</label></article>
    </section></div>
    <section className="quantity-section"><div className="quantity-heading"><div><p className="eyebrow">Deterministic v3 projection</p><h2>Conceptual quantities</h2></div><p>No products, prices, labor, waste, margin, or structural conclusions.</p></div><div className="quantity-grid">{projection.aggregateQuantities.map((line) => <article className="quantity-card" key={line.key}><span>{line.key.replaceAll("-", " ")}</span><strong>{line.amount.toLocaleString()} <small>{line.unit}</small></strong><p>Derived from {line.sourceGeometry.length} recorded geometry references.</p></article>)}</div></section>
  </main>;
}

function V3NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="field"><span>{label}</span><input type="number" step="0.25" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onCommit(Number(draft)); setDraft(String(value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}
