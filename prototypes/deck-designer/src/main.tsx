import { StrictMode, Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { deriveGeometry } from "./geometry";
import {
  DEFAULT_DESIGN,
  designFingerprint,
  normalizeDesign,
  stableDesignJson,
  updateDesign,
  type DeckDesignV1,
  type DeckEdgeId,
} from "./model";
import { deriveQuantities } from "./quantities";
import { createHistory, designHistoryReducer } from "./history";
import { PlanView, formatFeetInches } from "./PlanView";
import type { PlatformDimensionUpdate } from "./editor";
import { deriveDesignNotices } from "./notices";
import {
  GENERIC_DECK_TEMPLATES,
  applyTemplateToDesign,
  duplicateDesign,
  type DeckTemplateId,
} from "./templates";
import type { CameraPreset } from "./ThreeView";
import type { RenderQuality } from "./renderQuality";
import "./styles.css";

const STORAGE_KEY = "mckenzie-deck-designer:v1:current";
const ThreeView = lazy(async () => {
  const module = await import("./ThreeView");
  return { default: module.ThreeView };
});

function createLocalDesignId(): string {
  return typeof crypto.randomUUID === "function"
    ? `local-${crypto.randomUUID()}`
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadInitialDesign(): DeckDesignV1 {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeDesign(JSON.parse(saved)) : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

function App() {
  const [history, dispatchHistory] = useReducer(
    designHistoryReducer,
    loadInitialDesign(),
    createHistory,
  );
  const [previewDesign, setPreviewDesign] = useState<DeckDesignV1 | null>(null);
  const design = previewDesign ?? history.present;
  const applyDesign = (next: DeckDesignV1) => {
    setPreviewDesign(null);
    dispatchHistory({ type: "apply", design: next });
  };
  const [message, setMessage] = useState("Ready — changes update every projection immediately.");
  const [showFraming, setShowFraming] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("perspective");
  const [presetRequest, setPresetRequest] = useState(0);
  const [renderQuality, setRenderQuality] = useState<RenderQuality>("balanced");
  const [snapIncrement, setSnapIncrement] = useState(6);
  const [selectedEdgeId, setSelectedEdgeId] = useState<DeckEdgeId | null>(null);
  const [templateId, setTemplateId] = useState<DeckTemplateId>("compact-ground");
  const fileInput = useRef<HTMLInputElement>(null);
  const geometry = useMemo(() => deriveGeometry(design), [design]);
  const quantities = useMemo(() => deriveQuantities(design, geometry), [design, geometry]);
  const fingerprint = useMemo(() => designFingerprint(design), [design]);
  const notices = useMemo(() => deriveDesignNotices(design, geometry), [design, geometry]);
  const selectedEdge = geometry.platformEdges.find((edge) => edge.id === selectedEdgeId) ?? null;

  useEffect(() => {
    if (selectedEdgeId && !geometry.platformEdges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [geometry.platformEdges, selectedEdgeId]);

  const previewPlatformDimensions = (update: PlatformDimensionUpdate) => {
    try {
      setPreviewDesign(updateDesign(history.present, update));
    } catch {
      // Constrained handles retain the last valid authoritative preview.
    }
  };

  const commitPlatformDimensions = (update: PlatformDimensionUpdate) => {
    try {
      const next = updateDesign(history.present, update);
      setPreviewDesign(null);
      dispatchHistory({ type: "apply", design: next });
      setMessage(`Plan edit committed on a ${snapIncrement}-inch grid.`);
    } catch (error) {
      setPreviewDesign(null);
      setMessage(error instanceof Error ? error.message : "Plan edit was not supported.");
    }
  };

  const applyNumber = (
    field: "width" | "projection" | "surfaceElevation" | "joistSpacing" | "cutoutWidth" | "cutoutDepth" | "stairOffset" | "stairWidth" | "treadDepth" | "landingDepth",
    raw: string,
  ) => {
    const value = Number(raw);
    try {
      applyDesign(updateDesign(design, { [field]: value }));
      setMessage("Design updated from authoritative dimensions.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That value is not supported.");
    }
  };

  const toggleRail = (edge: DeckEdgeId) => {
    const next = design.construction.railing.enabledEdges.includes(edge)
      ? design.construction.railing.enabledEdges.filter((item) => item !== edge)
      : [...design.construction.railing.enabledEdges, edge];
    try {
      applyDesign(updateDesign(design, { railingEdges: next }));
      setMessage(`${edge[0].toUpperCase()}${edge.slice(1)} railing ${next.includes(edge) ? "enabled" : "removed"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Railing update failed.");
    }
  };

  const saveLocal = () => {
    localStorage.setItem(STORAGE_KEY, stableDesignJson(design));
    setMessage(`Saved locally at revision ${design.metadata.revision}.`);
  };

  const downloadJson = () => {
    const blob = new Blob([stableDesignJson(design)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "deck-design"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Design JSON downloaded.");
  };

  const importJson = async (file: File) => {
    try {
      const imported = normalizeDesign(JSON.parse(await file.text()));
      dispatchHistory({ type: "reset", design: imported });
      setMessage(`Loaded “${imported.name}” revision ${imported.metadata.revision}.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Load rejected: ${error.message}` : "Load rejected.");
    }
  };

  const setCamera = (next: CameraPreset) => {
    setPreset(next);
    setPresetRequest((request) => request + 1);
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark">M</div>
        <div>
          <p className="eyebrow">McKenzie Construction · isolated R&amp;D</p>
          <h1>Deck Designer</h1>
        </div>
        <div className="header-actions">
          <button className="quiet" onClick={saveLocal}>Save locally</button>
          <button className="quiet" onClick={downloadJson}>Download JSON</button>
          <button className="primary" onClick={() => fileInput.current?.click()}>Load JSON</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importJson(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="warning" role="status">
        <strong>Conceptual design — not for construction.</strong> Verify field dimensions, structure, connections, code, and products with qualified professionals.
      </section>

      <div className="workspace">
        <aside className="controls-panel">
          <div className="section-heading template-heading">
            <span>00</span>
            <div><p>Guided start</p><small>Generic geometry only</small></div>
          </div>
          <section className="template-card" aria-label="Deck templates">
            <label className="field full">
              <span>Template</span>
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value as DeckTemplateId)}>
                {GENERIC_DECK_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
            </label>
            <p>{GENERIC_DECK_TEMPLATES.find((template) => template.id === templateId)?.description}</p>
            <div className="template-actions">
              <button
                onClick={() => {
                  try {
                    applyDesign(applyTemplateToDesign(design, templateId));
                    setSelectedEdgeId(null);
                    setMessage("Generic template applied as one undoable design command.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Template could not be applied.");
                  }
                }}
              >Apply template</button>
              <button
                onClick={() => {
                  try {
                    const copy = duplicateDesign(design, createLocalDesignId());
                    setPreviewDesign(null);
                    dispatchHistory({ type: "reset", design: copy });
                    setSelectedEdgeId(null);
                    setMessage("Created a new local design identity from the current facts.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Design could not be duplicated.");
                  }
                }}
              >Duplicate design</button>
            </div>
          </section>
          <div className="section-heading">
            <span>01</span>
            <div><p>Authoritative design</p><small>Single-level foundation</small></div>
          </div>
          <label className="field full">
            <span>Design name</span>
            <input
              value={design.name}
              onChange={(event) => {
                try { applyDesign(updateDesign(design, { name: event.target.value })); } catch { /* retain last valid text */ }
              }}
            />
          </label>
          <div className="shape-switch" aria-label="Platform shape">
            {(["rectangle", "l-shape"] as const).map((kind) => (
              <button
                key={kind}
                className={design.platform.kind === kind ? "active" : ""}
                aria-pressed={design.platform.kind === kind}
                onClick={() => {
                  try {
                    applyDesign(updateDesign(design, { kind }));
                    setMessage(`${kind === "rectangle" ? "Rectangle" : "L-shape"} platform selected.`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Shape update failed.");
                  }
                }}
              >{kind === "rectangle" ? "Rectangle" : "L-shape"}</button>
            ))}
          </div>
          <div className="field-grid">
            <DimensionField label="Width" value={design.platform.width} onCommit={(value) => applyNumber("width", value)} />
            <DimensionField label="Projection" value={design.platform.projection} onCommit={(value) => applyNumber("projection", value)} />
            <DimensionField label="Elevation" value={design.platform.surfaceElevation} onCommit={(value) => applyNumber("surfaceElevation", value)} />
            <DimensionField label="Joist spacing" value={design.construction.framing.joistSpacing} onCommit={(value) => applyNumber("joistSpacing", value)} />
            {design.platform.kind === "l-shape" && (
              <>
                <DimensionField label="Cutout width" value={design.platform.cutoutWidth} onCommit={(value) => applyNumber("cutoutWidth", value)} />
                <DimensionField label="Cutout depth" value={design.platform.cutoutDepth} onCommit={(value) => applyNumber("cutoutDepth", value)} />
              </>
            )}
          </div>
          <label className="field full snap-field">
            <span>Plan snap</span>
            <select value={snapIncrement} onChange={(event) => setSnapIncrement(Number(event.target.value))}>
              <option value="1">1 inch · fine</option>
              <option value="6">6 inches · standard</option>
              <option value="12">12 inches · coarse</option>
            </select>
          </label>
          <label className="field full edge-select-field">
            <span>Edit an edge</span>
            <select
              value={selectedEdgeId ?? ""}
              onChange={(event) => {
                const edgeId = event.target.value as DeckEdgeId | "";
                setSelectedEdgeId(edgeId || null);
                const edge = geometry.platformEdges.find((item) => item.id === edgeId);
                setMessage(edge ? `${edge.label} edge selected for editing.` : "Edge selection cleared.");
              }}
            >
              <option value="">Choose an edge…</option>
              {geometry.platformEdges.map((edge) => <option key={edge.id} value={edge.id}>{edge.label} · {formatFeetInches(edge.length)}</option>)}
            </select>
          </label>
          {selectedEdge && (
            <section className="selected-edge-card" aria-label="Selected edge">
              <div><span>Selected edge</span><strong>{selectedEdge.label}</strong></div>
              <p>{formatFeetInches(selectedEdge.length)} · {design.construction.railing.enabledEdges.includes(selectedEdge.id) ? "railing recorded" : "open edge"}</p>
              <div className="selected-edge-actions">
                <button onClick={() => toggleRail(selectedEdge.id)}>Toggle railing</button>
                <button
                  disabled={selectedEdge.length < design.construction.stairs.width}
                  title={selectedEdge.length < design.construction.stairs.width ? "This edge is shorter than the recorded stair width." : undefined}
                  onClick={() => {
                    try {
                      applyDesign(updateDesign(design, {
                        stairEnabled: true,
                        stairEdgeId: selectedEdge.id,
                        stairOffset: Math.min(design.construction.stairs.offset, selectedEdge.length - design.construction.stairs.width),
                      }));
                      setMessage(`Stairs attached to the selected ${selectedEdge.label.toLowerCase()} edge.`);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Stair attachment failed.");
                    }
                  }}
                >Attach stairs</button>
              </div>
              {selectedEdge.length < design.construction.stairs.width && <small>Stair attachment unavailable: edge is shorter than the recorded stair width.</small>}
            </section>
          )}

          <div className="section-heading compact">
            <span>02</span><div><p>Railing edges</p><small>Attached edge remains open</small></div>
          </div>
          <div className="toggle-grid">
            {geometry.platformEdges.map((edge) => (
              <button
                key={edge.id}
                className={design.construction.railing.enabledEdges.includes(edge.id) ? "toggle active" : "toggle"}
                onClick={() => toggleRail(edge.id)}
                aria-pressed={design.construction.railing.enabledEdges.includes(edge.id)}
              >{edge.label}</button>
            ))}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={showFraming} onChange={(event) => setShowFraming(event.target.checked)} />
            Show framing intent
          </label>
          <div className="history-actions">
            <button
              disabled={history.past.length === 0}
              onClick={() => { dispatchHistory({ type: "undo" }); setMessage("Last design command undone."); }}
            >Undo</button>
            <button
              disabled={history.future.length === 0}
              onClick={() => { dispatchHistory({ type: "redo" }); setMessage("Design command restored."); }}
            >Redo</button>
          </div>

          <div className="section-heading compact">
            <span>03</span><div><p>Stairs &amp; landing</p><small>Explicit edge attachment</small></div>
          </div>
          <button
            className={design.construction.stairs.enabled ? "stair-toggle active" : "stair-toggle"}
            aria-pressed={design.construction.stairs.enabled}
            onClick={() => {
              try {
                const enabled = !design.construction.stairs.enabled;
                applyDesign(updateDesign(design, { stairEnabled: enabled }));
                setMessage(`Stairs ${enabled ? `added to ${design.construction.stairs.edgeId} with a railing opening` : "removed"}.`);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Stair update failed.");
              }
            }}
          >{design.construction.stairs.enabled ? "Remove stairs" : "Add stairs"}</button>
          {design.construction.stairs.enabled && (
            <>
              <label className="field full stair-edge-field">
                <span>Attachment edge</span>
                <select
                  value={design.construction.stairs.edgeId}
                  onChange={(event) => {
                    const edgeId = event.target.value as DeckEdgeId;
                    const edge = geometry.platformEdges.find((item) => item.id === edgeId);
                    if (!edge) return;
                    try {
                      applyDesign(updateDesign(design, {
                        stairEdgeId: edgeId,
                        stairOffset: Math.min(design.construction.stairs.offset, edge.length - design.construction.stairs.width),
                      }));
                      setMessage(`Stairs attached to the ${edge.label.toLowerCase()} edge.`);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Stair edge update failed.");
                    }
                  }}
                >
                  {geometry.platformEdges.map((edge) => (
                    <option key={edge.id} value={edge.id} disabled={edge.length < design.construction.stairs.width}>
                      {edge.label} · {formatFeetInches(edge.length)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-grid stair-fields">
                <DimensionField label="Stair offset" value={design.construction.stairs.offset} onCommit={(value) => applyNumber("stairOffset", value)} />
                <DimensionField label="Stair width" value={design.construction.stairs.width} onCommit={(value) => applyNumber("stairWidth", value)} />
                <DimensionField label="Tread depth" value={design.construction.stairs.treadDepth} onCommit={(value) => applyNumber("treadDepth", value)} />
                {design.construction.stairs.landingEnabled && (
                  <DimensionField label="Landing depth" value={design.construction.stairs.landingDepth} onCommit={(value) => applyNumber("landingDepth", value)} />
                )}
              </div>
              <label className="check-row landing-toggle">
                <input
                  type="checkbox"
                  checked={design.construction.stairs.landingEnabled}
                  onChange={(event) => {
                    try {
                      applyDesign(updateDesign(design, { landingEnabled: event.target.checked }));
                      setMessage(`Top landing ${event.target.checked ? "added" : "removed"}.`);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Landing update failed.");
                    }
                  }}
                />
                Include top landing
              </label>
            </>
          )}

          <div className="design-facts">
            <div><span>Schema</span><strong>DeckDesign v{design.schemaVersion}</strong></div>
            <div><span>Revision</span><strong>{design.metadata.revision}</strong></div>
            <div><span>Fingerprint</span><code>{fingerprint}</code></div>
          </div>
          <p className="status-message" aria-live="polite">{message}</p>
          <section className="design-notices" aria-label="Design checks">
            <div><span>Design checks</span><strong>{notices.length}</strong></div>
            <small>Prototype review triggers only — not a code or structural determination.</small>
            {notices.length === 0
              ? <p>No deterministic review flags for the recorded conceptual facts.</p>
              : notices.map((notice) => <p key={notice.id} className={notice.severity}>{notice.message}</p>)}
          </section>
        </aside>

        <section className="visual-area">
          <article className="view-card plan-card">
            <div className="card-title"><div><span>Measured plan</span><small>2D · live projection</small></div><strong>{formatFeetInches(design.platform.surfaceElevation)} high</strong></div>
            <PlanView
              design={design}
              geometry={geometry}
              showFraming={showFraming}
              snapIncrement={snapIncrement}
              onDimensionPreview={previewPlatformDimensions}
              onDimensionCommit={commitPlatformDimensions}
              onDimensionCancel={() => setPreviewDesign(null)}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={(edgeId) => {
                setSelectedEdgeId(edgeId);
                const edge = geometry.platformEdges.find((item) => item.id === edgeId);
                if (edge) setMessage(`${edge.label} edge selected for editing.`);
              }}
            />
          </article>
          <article className="view-card three-card">
            <div className="card-title">
              <div><span>Model view</span><small>3D · orbit, pan &amp; zoom</small></div>
              <div className="view-tools">
                <label className="quality-control">
                  <span className="sr-only">3D quality</span>
                  <select
                    aria-label="3D quality"
                    value={renderQuality}
                    onChange={(event) => {
                      const quality = event.target.value as RenderQuality;
                      setRenderQuality(quality);
                      setMessage(`3D quality set to ${quality}; design geometry and quantities are unchanged.`);
                    }}
                  >
                    <option value="economy">Economy</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <div className="camera-buttons">
                  {(["perspective", "top", "front"] as CameraPreset[]).map((item) => (
                    <button key={item} onClick={() => setCamera(item)} className={preset === item ? "active" : ""}>{item}</button>
                  ))}
                </div>
              </div>
            </div>
            <Suspense fallback={<div className="three-loading" role="status">Preparing interactive 3D view…</div>}>
              <ThreeView design={design} geometry={geometry} preset={preset} presetRequest={presetRequest} showFraming={showFraming} quality={renderQuality} />
            </Suspense>
          </article>
        </section>
      </div>

      <section className="quantity-section">
        <div className="quantity-heading">
          <div><p className="eyebrow">Deterministic projection</p><h2>Conceptual quantities</h2></div>
          <p>Geometry-derived only. No product matching, prices, labor, waste, margin, or engineering assumptions.</p>
        </div>
        <div className="quantity-grid">
          {quantities.map((line) => (
            <article key={line.id} className="quantity-card" title={line.explanation}>
              <span>{line.label}</span>
              <strong>{line.quantity.toLocaleString()} <small>{line.unit}</small></strong>
              <p>{line.explanation}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function DimensionField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="dimension-input">
        <input
          data-field={label}
          type="number"
          step="0.25"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { onCommit(draft); setDraft(String(value)); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
        <span>in</span>
      </div>
    </label>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
