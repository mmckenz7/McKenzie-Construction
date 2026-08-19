import { StrictMode, Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { deriveGeometry } from "./geometry";
import {
  DEFAULT_DESIGN,
  designFingerprint,
  normalizeDesign,
  stableDesignJson,
  updateDesign,
  type DeckDesign,
  type DeckEdgeId,
  type HouseAttachment,
  type HouseOpeningKind,
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
import { createHouseOpening, createHouseWall } from "./siteContext";
import "./styles.css";
import { V3App } from "./V3App";
import { migrateDeckDesignToV3, type DeckDesignV3 } from "./modelV3";
import { loadDeckDesignV3, saveDeckDesignV3 } from "./storageV3";

const STORAGE_KEY = "mckenzie-deck-designer:v2:current";
const LEGACY_STORAGE_KEY = "mckenzie-deck-designer:v1:current";
const ThreeView = lazy(async () => {
  const module = await import("./ThreeView");
  return { default: module.ThreeView };
});

function createLocalDesignId(): string {
  return typeof crypto.randomUUID === "function"
    ? `local-${crypto.randomUUID()}`
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadInitialDesign(): DeckDesign {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? normalizeDesign(JSON.parse(saved)) : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

function LegacyApp({ onOpenCornerEditor }: { onOpenCornerEditor: (design: DeckDesign) => void }) {
  const [history, dispatchHistory] = useReducer(
    designHistoryReducer,
    loadInitialDesign(),
    createHistory,
  );
  const [previewDesign, setPreviewDesign] = useState<DeckDesign | null>(null);
  const design = previewDesign ?? history.present;
  const applyDesign = (next: DeckDesign) => {
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
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
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

  const previewStairOffset = (offset: number) => {
    try {
      setPreviewDesign(updateDesign(history.present, { stairOffset: offset }));
    } catch {
      // The drag remains at the last valid position on the selected edge.
    }
  };

  const commitStairOffset = (offset: number) => {
    try {
      const next = updateDesign(history.present, { stairOffset: offset });
      setPreviewDesign(null);
      dispatchHistory({ type: "apply", design: next });
      setMessage(`Stairs moved to ${formatFeetInches(offset)} from the start of the selected edge.`);
    } catch (error) {
      setPreviewDesign(null);
      setMessage(error instanceof Error ? error.message : "Stair movement was not supported.");
    }
  };

  const applyNumber = (
    field: "width" | "projection" | "surfaceElevation" | "joistSpacing" | "cutoutWidth" | "cutoutDepth" | "stairOffset" | "stairWidth" | "treadDepth" | "landingDepth" | "gradeElevation",
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

  const selectedWall = design.siteContext.houseWalls.find((wall) => wall.id === selectedWallId)
    ?? design.siteContext.houseWalls[0];
  const selectedOpening = selectedWall.openings.find((opening) => opening.id === selectedOpeningId)
    ?? selectedWall.openings[0]
    ?? null;
  useEffect(() => {
    if (selectedWall.id !== selectedWallId) setSelectedWallId(selectedWall.id);
  }, [selectedWall.id, selectedWallId]);
  useEffect(() => {
    if (selectedOpening?.id !== selectedOpeningId) setSelectedOpeningId(selectedOpening?.id ?? null);
  }, [selectedOpening?.id, selectedOpeningId, selectedWall.id]);
  const updateSelectedWall = (update: Partial<DeckDesign["siteContext"]["houseWalls"][number]>) => {
    try {
      applyDesign(updateDesign(design, {
        houseWalls: design.siteContext.houseWalls.map((wall) => wall.id === selectedWall.id ? { ...wall, ...update } : wall),
      }));
      setMessage(`House wall ${selectedWall.id} updated from recorded conceptual facts.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "House wall update failed.");
    }
  };
  const addHouseOpening = (kind: HouseOpeningKind) => {
    try {
      const opening = createHouseOpening(selectedWall, kind);
      updateSelectedWall({ openings: [...selectedWall.openings, opening] });
      setSelectedOpeningId(opening.id);
      setMessage(`Conceptual ${kind} opening added to ${selectedWall.id}; field verification required.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "House opening update failed.");
    }
  };
  const updateSelectedOpening = (update: Partial<DeckDesign["siteContext"]["houseWalls"][number]["openings"][number]>) => {
    if (!selectedOpening) return;
    updateSelectedWall({
      openings: selectedWall.openings.map((opening) => opening.id === selectedOpening.id ? { ...opening, ...update } : opening),
    });
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
            <div><p>Start with a layout</p><small>Choose a simple starting point</small></div>
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
            <div><p>Deck size &amp; shape</p><small>Enter exact dimensions in inches</small></div>
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
          <button className="primary full-action corner-editor-launch" onClick={() => onOpenCornerEditor(design)}>Open flexible corner editor</button>
          <p className="section-help">Use this for stepped decks with more than one offset. It upgrades this local concept to the v3 polygon model.</p>
          <p className="section-help">Deck width runs left to right along the house. Distance from house controls how far the deck extends into the yard.</p>
          <div className="field-grid">
            <DimensionField label="Deck width" value={design.platform.width} onCommit={(value) => applyNumber("width", value)} />
            <DimensionField label="Distance from house" value={design.platform.projection} onCommit={(value) => applyNumber("projection", value)} />
            <DimensionField label="Deck height" value={design.platform.surfaceElevation} onCommit={(value) => applyNumber("surfaceElevation", value)} />
            <DimensionField label="Joist spacing" value={design.construction.framing.joistSpacing} onCommit={(value) => applyNumber("joistSpacing", value)} />
            {design.platform.kind === "l-shape" && (
              <>
                <DimensionField label="L-cutout width" value={design.platform.cutoutWidth} onCommit={(value) => applyNumber("cutoutWidth", value)} />
                <DimensionField label="L-cutout depth" value={design.platform.cutoutDepth} onCommit={(value) => applyNumber("cutoutDepth", value)} />
              </>
            )}
          </div>
          <label className="field full snap-field">
            <span>Drag step</span>
            <select value={snapIncrement} onChange={(event) => setSnapIncrement(Number(event.target.value))}>
              <option value="1">1 inch · fine</option>
              <option value="6">6 inches · standard</option>
              <option value="12">12 inches · coarse</option>
            </select>
            <small className="field-help">Controls how far plan handles move with each drag or arrow-key step.</small>
          </label>
          <label className="field full edge-select-field">
            <span>Select an edge to edit</span>
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
            <span>02</span><div><p>House &amp; ground</p><small>Optional site context</small></div>
          </div>
          <label className="field full">
            <span>House wall</span>
            <select
              aria-label="House wall selection"
              value={selectedWall.id}
              onChange={(event) => {
                setSelectedWallId(event.target.value);
                setSelectedOpeningId(null);
              }}
            >
              {design.siteContext.houseWalls.map((wall) => (
                <option key={wall.id} value={wall.id}>{wall.id} · {wall.attachment}</option>
              ))}
            </select>
          </label>
          <div className="house-wall-actions">
            <button
              disabled={design.siteContext.houseWalls.length >= 8}
              onClick={() => {
                try {
                  const wall = createHouseWall(design);
                  applyDesign(updateDesign(design, { houseWalls: [...design.siteContext.houseWalls, wall] }));
                  setSelectedWallId(wall.id);
                  setSelectedOpeningId(null);
                  setMessage(`${wall.id} added as conceptual site context; verify all coordinates in the field.`);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "House wall could not be added.");
                }
              }}
            >Add wall</button>
            <button
              disabled={design.siteContext.houseWalls.length === 1}
              onClick={() => {
                const remaining = design.siteContext.houseWalls.filter((wall) => wall.id !== selectedWall.id);
                applyDesign(updateDesign(design, { houseWalls: remaining }));
                setSelectedWallId(remaining[0]?.id ?? null);
                setSelectedOpeningId(null);
                setMessage(`${selectedWall.id} removed from conceptual site context.`);
              }}
            >Remove wall</button>
          </div>
          <p className="section-help house-help">Left/right positions run along the house. “Away” positions run outward into the yard.</p>
          <div className="field-grid">
            <DimensionField label="Ground height" value={design.siteContext.gradeElevation} onCommit={(value) => applyNumber("gradeElevation", value)} />
            <DimensionField label="Wall bottom height" value={selectedWall.baseElevation} onCommit={(value) => updateSelectedWall({ baseElevation: Number(value) })} />
            <DimensionField label="Wall height" value={selectedWall.height} onCommit={(value) => updateSelectedWall({ height: Number(value) })} />
            <DimensionField label="Wall start · left/right" value={selectedWall.start.x} onCommit={(value) => updateSelectedWall({ start: { ...selectedWall.start, x: Number(value) } })} />
            <DimensionField label="Wall start · away" value={selectedWall.start.z} onCommit={(value) => updateSelectedWall({ start: { ...selectedWall.start, z: Number(value) } })} />
            <DimensionField label="Wall end · left/right" value={selectedWall.end.x} onCommit={(value) => updateSelectedWall({ end: { ...selectedWall.end, x: Number(value) } })} />
            <DimensionField label="Wall end · away" value={selectedWall.end.z} onCommit={(value) => updateSelectedWall({ end: { ...selectedWall.end, z: Number(value) } })} />
          </div>
          <label className="field full house-attachment-field">
            <span>Deck-to-house connection</span>
            <select
              value={selectedWall.attachment}
              onChange={(event) => {
                const attachment = event.target.value as HouseAttachment;
                updateSelectedWall({ attachment });
                setMessage(`${selectedWall.id} attachment intent recorded as ${attachment}; no structural conclusion is implied.`);
              }}
            >
              <option value="unknown">Not sure — verify later</option>
              <option value="ledger">Ledger connection planned</option>
              <option value="non-ledger">Freestanding / no ledger</option>
            </select>
          </label>
          <div className="house-opening-actions">
            <button onClick={() => addHouseOpening("door")}>Add door</button>
            <button onClick={() => addHouseOpening("window")}>Add window</button>
          </div>
          {selectedOpening ? (
            <section className="house-opening-card" aria-label="House opening">
              <div><strong>{selectedOpening.kind}</strong><button onClick={() => {
                updateSelectedWall({ openings: selectedWall.openings.filter((opening) => opening.id !== selectedOpening.id) });
                setSelectedOpeningId(null);
                setMessage(`Conceptual house opening removed from ${selectedWall.id}.`);
              }}>Remove</button></div>
              <label className="field full">
                <span>Edit opening</span>
                <select aria-label="House opening selection" value={selectedOpening.id} onChange={(event) => setSelectedOpeningId(event.target.value)}>
                  {selectedWall.openings.map((opening) => (
                    <option key={opening.id} value={opening.id}>{opening.id} · {opening.kind}</option>
                  ))}
                </select>
              </label>
              <label className="field full">
                <span>Opening type</span>
                <select value={selectedOpening.kind} onChange={(event) => updateSelectedOpening({ kind: event.target.value as HouseOpeningKind })}>
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </select>
              </label>
              <div className="field-grid">
                <DimensionField label="Wall offset" value={selectedOpening.offset} onCommit={(value) => updateSelectedOpening({ offset: Number(value) })} />
                <DimensionField label="Opening width" value={selectedOpening.width} onCommit={(value) => updateSelectedOpening({ width: Number(value) })} />
                <DimensionField label="Sill height" value={selectedOpening.sillHeight} onCommit={(value) => updateSelectedOpening({ sillHeight: Number(value) })} />
                <DimensionField label="Opening height" value={selectedOpening.height} onCommit={(value) => updateSelectedOpening({ height: Number(value) })} />
              </div>
            </section>
          ) : <p className="house-opening-empty">No door or window recorded.</p>}

          <div className="section-heading compact">
            <span>03</span><div><p>Railing</p><small>Click every edge that needs railing</small></div>
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
            <span>04</span><div><p>Stairs &amp; landing</p><small>Choose where the stairs connect</small></div>
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
                <span>Stairs attach to</span>
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
              <p className="section-help stair-help">Stair position is measured from the beginning of the selected edge.</p>
              <div className="field-grid stair-fields">
                <DimensionField label="Stair position" value={design.construction.stairs.offset} onCommit={(value) => applyNumber("stairOffset", value)} />
                <DimensionField label="Stair width" value={design.construction.stairs.width} onCommit={(value) => applyNumber("stairWidth", value)} />
                <DimensionField label="Step depth" value={design.construction.stairs.treadDepth} onCommit={(value) => applyNumber("treadDepth", value)} />
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
              onStairOffsetPreview={previewStairOffset}
              onStairOffsetCommit={commitStairOffset}
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

function App() {
  const initial = useMemo(() => loadDeckDesignV3(localStorage), []);
  const [v3Design, setV3Design] = useState<DeckDesignV3 | null>(initial.design);
  const [v3Message, setV3Message] = useState(initial.message);
  if (v3Design) return <V3App initialDesign={v3Design} initialMessage={v3Message} />;
  return <LegacyApp onOpenCornerEditor={(legacy) => {
    try {
      const migrated = migrateDeckDesignToV3(legacy);
      saveDeckDesignV3(localStorage, migrated);
      setV3Message("Upgraded this local design to v3. Exact edge references are protected until you explicitly unlock outline editing.");
      setV3Design(migrated);
    } catch (error) {
      setV3Message(error instanceof Error ? error.message : "The corner editor could not be opened.");
    }
  }} />;
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
