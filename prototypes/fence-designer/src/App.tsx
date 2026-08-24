import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createHistory, pushHistory, redo, undo, type History } from "./history";
import {
  EMPTY_DESIGN, addPoint, deletePoint, feetAndInchesToMm, formatFeetInches, movePoint,
  pointById, pointRole, segmentLengthMm, setSegmentKind, setSegmentLengthMm, totalLengthMm,
  type FenceDesign,
} from "./model";
import { loadLocalDesign, saveLocalDesign } from "./storage";

type Selection = Readonly<{ type: "point" | "segment"; id: string }> | null;
type ViewBox = Readonly<{ x: number; y: number; width: number; height: number }>;
type Drag = Readonly<{ pointId: string; original: FenceDesign }> | null;

const DEFAULT_VIEW: ViewBox = Object.freeze({ x: -1_000, y: -1_000, width: 26_000, height: 16_000 });
const GRID_MM = 305;

function fittedView(design: FenceDesign): ViewBox {
  if (design.points.length === 0) return DEFAULT_VIEW;
  const xs = design.points.map(({ xMm }) => xMm);
  const ys = design.points.map(({ yMm }) => yMm);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(8_000, maxX - minX + 4_000);
  const height = Math.max(6_000, maxY - minY + 4_000);
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}

function nextNumericId(design: FenceDesign): number {
  const values = [...design.points.map(({ id }) => id), ...design.segments.map(({ id }) => id)]
    .map((id) => Number(id.match(/(\d+)$/)?.[1] ?? 0));
  return Math.max(0, ...values) + 1;
}

export default function App() {
  const [history, setHistory] = useState<History<FenceDesign>>(() => createHistory(EMPTY_DESIGN));
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<"draw" | "select">("draw");
  const [view, setView] = useState<ViewBox>(DEFAULT_VIEW);
  const [drag, setDrag] = useState<Drag>(null);
  const [notice, setNotice] = useState("Choose Draw, then tap the plan to place your first point.");
  const [feet, setFeet] = useState("0");
  const [inches, setInches] = useState("0");
  const svgRef = useRef<SVGSVGElement>(null);
  const nextId = useRef(1);
  const design = history.present;

  const selectedSegment = selection?.type === "segment" ? design.segments.find(({ id }) => id === selection.id) ?? null : null;
  const selectedPoint = selection?.type === "point" ? design.points.find(({ id }) => id === selection.id) ?? null : null;
  const totals = useMemo(() => ({ all: totalLengthMm(design), gate: design.segments.filter(({ kind }) => kind === "gate").reduce((sum, item) => sum + segmentLengthMm(design, item), 0) }), [design]);

  const commit = (next: FenceDesign, message: string) => {
    setHistory((current) => pushHistory(current, next));
    setNotice(message);
  };
  const toPlan = (clientX: number, clientY: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { xMm: 0, yMm: 0 };
    return {
      xMm: Math.round((view.x + (clientX - box.left) / box.width * view.width) / GRID_MM) * GRID_MM,
      yMm: Math.round((view.y + (clientY - box.top) / box.height * view.height) / GRID_MM) * GRID_MM,
    };
  };
  const addAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== "draw" || event.target !== event.currentTarget) return;
    const point = toPlan(event.clientX, event.clientY);
    const id = nextId.current++;
    const next = addPoint(design, { id: `point-${id}`, ...point }, `segment-${id}`);
    commit(next, next.points.length === 1 ? "Start point placed. Add another point to create a measured span." : "Measured span added.");
  };
  const selectSegment = (id: string) => {
    const segment = design.segments.find((item) => item.id === id);
    if (!segment) return;
    const totalInches = Math.round(segmentLengthMm(design, segment) / 25.4);
    setFeet(String(Math.floor(totalInches / 12)));
    setInches(String(totalInches % 12));
    setSelection({ type: "segment", id }); setMode("select"); setNotice("Span selected. Enter an exact length or mark the whole span as a gate.");
  };
  const startDrag = (event: ReactPointerEvent, pointId: string) => {
    event.stopPropagation();
    setSelection({ type: "point", id: pointId }); setMode("select"); setDrag({ pointId, original: design });
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
  };
  const dragPoint = (event: ReactPointerEvent) => {
    if (!drag) return;
    const location = toPlan(event.clientX, event.clientY);
    setHistory((current) => ({ ...current, present: movePoint(drag.original, drag.pointId, location.xMm, location.yMm) }));
  };
  const endDrag = () => {
    if (!drag) return;
    setHistory((current) => current.present.points.find(({ id }) => id === drag.pointId)?.xMm === drag.original.points.find(({ id }) => id === drag.pointId)?.xMm
      && current.present.points.find(({ id }) => id === drag.pointId)?.yMm === drag.original.points.find(({ id }) => id === drag.pointId)?.yMm
      ? { ...current, present: drag.original }
      : { past: [...current.past, drag.original], present: current.present, future: [] });
    setDrag(null); setNotice("Point moved. Connected measurements updated.");
  };
  const applyExactLength = () => {
    if (!selectedSegment) return;
    try {
      const length = feetAndInchesToMm(Number(feet), Number(inches));
      commit(setSegmentLengthMm(design, selectedSegment.id, length), `Span set to ${formatFeetInches(length)}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid length."); }
  };
  const removeSelection = () => {
    if (!selection) return;
    if (selection.type === "point") {
      commit(deletePoint(design, selection.id, `segment-${nextId.current++}`), "Point deleted. Remaining adjacent spans were reconnected.");
    } else {
      setNotice("Delete either endpoint to remove a span while keeping one connected path."); return;
    }
    setSelection(null);
  };
  const save = () => { saveLocalDesign(localStorage, design); setNotice("Saved in this browser only."); };
  const load = () => {
    try {
      const loaded = loadLocalDesign(localStorage);
      if (!loaded) { setNotice("No saved layout exists in this browser yet."); return; }
      setHistory(createHistory(loaded)); nextId.current = nextNumericId(loaded); setSelection(null); setView(fittedView(loaded)); setNotice("Saved local layout loaded.");
    } catch (error) { setNotice(error instanceof Error ? `Saved layout was not opened: ${error.message}` : "Saved layout was not opened."); }
  };

  return <main>
    <header className="app-header">
      <div><p className="eyebrow">McKenzie OS · isolated prototype</p><h1>Fence Visual Measure</h1><p>Draw the property-side path. Measurements stay local and contain no pricing or product rules.</p></div>
      <div className="total-card"><span>Total measured length</span><strong>{formatFeetInches(totals.all)}</strong><small>{design.segments.length} span{design.segments.length === 1 ? "" : "s"}{totals.gate ? ` · ${formatFeetInches(totals.gate)} gate intent` : ""}</small></div>
    </header>

    <nav className="toolbar" aria-label="Drawing controls">
      <div className="segmented"><button className={mode === "draw" ? "active" : ""} onClick={() => { setMode("draw"); setSelection(null); setNotice("Tap empty plan space to continue the connected fence path."); }}>＋ Draw</button><button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}>↖ Edit</button></div>
      <button disabled={history.past.length === 0} onClick={() => { setHistory(undo); setSelection(null); setNotice("Undid the last change."); }}>↶ Undo</button>
      <button disabled={history.future.length === 0} onClick={() => { setHistory(redo); setSelection(null); setNotice("Redid the change."); }}>↷ Redo</button>
      <button onClick={() => setView(fittedView(design))}>Fit plan</button>
      <span className="toolbar-spacer" />
      <button onClick={save}>Save local</button><button onClick={load}>Load local</button>
    </nav>

    <section className="workspace">
      <div className="canvas-shell">
        <div className="canvas-key"><span><i className="key-dot endpoint" /> Open endpoint</span><span><i className="key-dot corner" /> Corner</span><span><i className="key-line gate" /> Gate intent</span></div>
        <svg ref={svgRef} className={`plan-canvas ${mode}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={addAt} onPointerMove={dragPoint} onPointerUp={endDrag} onPointerCancel={endDrag} aria-label="Fence drawing plan">
          <defs><pattern id="grid" width={GRID_MM} height={GRID_MM} patternUnits="userSpaceOnUse"><path d={`M ${GRID_MM} 0 L 0 0 0 ${GRID_MM}`} fill="none" stroke="#d8ddd7" strokeWidth="18" /></pattern></defs>
          <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" pointerEvents="none" />
          {design.segments.map((segment) => {
            const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
            const midX = (start.xMm + end.xMm) / 2; const midY = (start.yMm + end.yMm) / 2;
            const selected = selection?.type === "segment" && selection.id === segment.id;
            return <g key={segment.id} className={`segment ${segment.kind}${selected ? " selected" : ""}`} onPointerDown={(event) => { event.stopPropagation(); selectSegment(segment.id); }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectSegment(segment.id); }}>
              <line className="segment-hit" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              <line className="segment-line" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              <g transform={`translate(${midX} ${midY})`} className="dimension"><rect x="-640" y="-260" width="1280" height="520" rx="180" /><text textAnchor="middle" dominantBaseline="central">{segment.kind === "gate" ? "GATE · " : ""}{formatFeetInches(segmentLengthMm(design, segment))}</text></g>
            </g>;
          })}
          {design.points.map((point) => {
            const role = pointRole(design, point.id); const selected = selection?.type === "point" && selection.id === point.id;
            return <g key={point.id} className={`point ${role.replace(" ", "-")}${selected ? " selected" : ""}`} transform={`translate(${point.xMm} ${point.yMm})`} onPointerDown={(event) => startDrag(event, point.id)} role="button" tabIndex={0} aria-label={`${role} ${point.id}`}>
              <circle className="point-hit" r="460" /><circle className="point-dot" r="190" />
            </g>;
          })}
        </svg>
        {design.points.length === 0 && <div className="empty-state"><strong>Start with one property point</strong><span>Choose Draw, then tap anywhere on the grid.</span></div>}
      </div>

      <aside className="inspector">
        <p className="eyebrow">Selection</p>
        {!selection && <div className="inspector-empty"><h2>No item selected</h2><p>Tap a span for exact length and gate intent. Tap or drag a point to edit the path.</p></div>}
        {selectedPoint && <div><h2>{pointRole(design, selectedPoint.id)}</h2><p className="coordinate">X {formatFeetInches(Math.abs(selectedPoint.xMm))} · Y {formatFeetInches(Math.abs(selectedPoint.yMm))}</p><p>Drag this point on the grid. Connected span lengths update immediately.</p><button className="danger" onClick={removeSelection}>Delete point</button></div>}
        {selectedSegment && <div><h2>{selectedSegment.kind === "gate" ? "Gate span" : "Fence span"}</h2><div className="length-readout">{formatFeetInches(segmentLengthMm(design, selectedSegment))}</div><div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="0" max="1000" value={feet} onChange={(event) => setFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={inches} onChange={(event) => setInches(event.target.value)} /></label></div><button className="primary wide" onClick={applyExactLength}>Apply exact length</button><button className="wide" onClick={() => commit(setSegmentKind(design, selectedSegment.id, selectedSegment.kind === "gate" ? "fence" : "gate"), selectedSegment.kind === "gate" ? "Span restored to fence intent." : "Whole span marked as gate intent only.")}>{selectedSegment.kind === "gate" ? "Mark as fence" : "Mark whole span as gate"}</button><small>Gate intent does not imply products, posts, hardware, or pricing.</small></div>}
        <div className="notice" role="status">{notice}</div>
      </aside>
    </section>
    <footer className="app-footer"><span>1 ft snap grid · integer millimeter geometry</span><span>Local browser storage only · schema v1 · revision {design.revision}</span></footer>
  </main>;
}
