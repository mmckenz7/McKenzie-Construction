"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createHistory, pushHistory, redo, undo, type History } from "./history";
import {
  EMPTY_DESIGN, addPoint, closestPointOnHouseEdge, deletePoint, feetAndInchesToMm, formatFeetInches, insertGateAtPoint, isPointOnHouseEdge, movePoint, movePointWithLockedFollowing,
  pointById, pointRole, removeHouseReference, segmentLengthMm, setGateType, setHouseReference, setSegmentKind, setSegmentLengthKeepingEndMm, setSegmentLengthMm, snapPlanPosition, snapRunEndpoint, snapToHouseEdge, solvePathBetweenFixedEndsMm, totalLengthMm,
  type FenceDesign, type GateType,
} from "./model";
import { loadLocalDesign, saveLocalDesign } from "./storage";
import { panView, zoomViewAt, type ViewBox } from "./view";

type Selection = Readonly<{ type: "point" | "segment"; id: string } | { type: "house" }> | null;
type Drag = Readonly<{ pointId: string; original: FenceDesign }> | null;
type Mode = "draw" | "select" | "pan" | "close";
type PlanPointer = Readonly<{ clientX: number; clientY: number }>;
type NavigationGesture = Readonly<{
  original: ViewBox;
  startCenter: PlanPointer;
  startDistance: number | null;
}> | null;

const DEFAULT_VIEW: ViewBox = Object.freeze({ x: -1_000, y: -1_000, width: 26_000, height: 16_000 });
const GRID_MM = 305;

function fittedView(design: FenceDesign): ViewBox {
  if (design.points.length === 0 && !design.house) return DEFAULT_VIEW;
  const xs = [...design.points.map(({ xMm }) => xMm), ...(design.house ? [design.house.xMm, design.house.xMm + design.house.lengthMm] : [])];
  const ys = [...design.points.map(({ yMm }) => yMm), ...(design.house ? [design.house.yMm, design.house.yMm + design.house.widthMm] : [])];
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
  const [mode, setMode] = useState<Mode>("draw");
  const [view, setView] = useState<ViewBox>(DEFAULT_VIEW);
  const [drag, setDrag] = useState<Drag>(null);
  const [notice, setNotice] = useState("Choose Draw, then tap the plan to place your first point.");
  const [feet, setFeet] = useState("0");
  const [inches, setInches] = useState("0");
  const [houseFeet, setHouseFeet] = useState("");
  const [houseInches, setHouseInches] = useState("0");
  const [houseWidthFeet, setHouseWidthFeet] = useState("");
  const [houseWidthInches, setHouseWidthInches] = useState("0");
  const [gateEditorOpen, setGateEditorOpen] = useState(false);
  const [gateType, setGateTypeChoice] = useState<GateType>("single");
  const [gateFeet, setGateFeet] = useState("");
  const [gateInches, setGateInches] = useState("0");
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [lengthLockEnabled, setLengthLockEnabled] = useState(true);
  const [previewPoint, setPreviewPoint] = useState<Readonly<{ xMm: number; yMm: number }> | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const nextId = useRef(1);
  const activePointers = useRef(new Map<number, PlanPointer>());
  const navigationGesture = useRef<NavigationGesture>(null);
  const navigationWasActive = useRef(false);
  const design = history.present;

  const selectedSegment = selection?.type === "segment" ? design.segments.find(({ id }) => id === selection.id) ?? null : null;
  const selectedPoint = selection?.type === "point" ? design.points.find(({ id }) => id === selection.id) ?? null : null;
  const houseSelected = selection?.type === "house";
  const totals = useMemo(() => ({ all: totalLengthMm(design), gate: design.segments.filter(({ kind }) => kind === "gate").reduce((sum, item) => sum + segmentLengthMm(design, item), 0) }), [design]);

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    const containWheelZoom = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation();
      const box = canvas.getBoundingClientRect();
      const focusX = (event.clientX - box.left) / box.width; const focusY = (event.clientY - box.top) / box.height;
      setView((current) => zoomViewAt(current, Math.exp(event.deltaY * 0.0015), focusX, focusY));
    };
    canvas.addEventListener("wheel", containWheelZoom, { passive: false });
    return () => canvas.removeEventListener("wheel", containWheelZoom);
  }, []);

  useEffect(() => {
    const cancelTool = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (drag) setHistory((current) => ({ ...current, present: drag.original }));
      setDrag(null); setMode("select"); setSelection(null); setGateEditorOpen(false); setPreviewPoint(null);
      activePointers.current.clear(); navigationGesture.current = null; navigationWasActive.current = false; setIsNavigating(false);
      setNotice("Current tool canceled. Choose Draw, Edit, or Pan when ready.");
    };
    window.addEventListener("keydown", cancelTool);
    return () => window.removeEventListener("keydown", cancelTool);
  }, [drag]);

  const commit = (next: FenceDesign, message: string) => {
    setHistory((current) => pushHistory(current, next));
    setNotice(message);
  };
  const toPlanRaw = (clientX: number, clientY: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { xMm: 0, yMm: 0 };
    const x = view.x + (clientX - box.left) / box.width * view.width;
    const y = view.y + (clientY - box.top) / box.height * view.height;
    return { xMm: Math.round(x), yMm: Math.round(y) };
  };
  const toPlan = (clientX: number, clientY: number) => {
    const raw = toPlanRaw(clientX, clientY);
    const houseConnection = snapToHouseEdge(raw.xMm, raw.yMm, design.house);
    return houseConnection ?? snapPlanPosition(raw.xMm, raw.yMm, snapEnabled, null, GRID_MM);
  };
  const nextPointAt = (clientX: number, clientY: number) => {
    const candidate = toPlan(clientX, clientY);
    const anchor = design.points.at(-1);
    if (!anchor || !snapEnabled) return candidate;
    const house = design.house;
    const onHouseEdge = house && (
      ((candidate.xMm === house.xMm || candidate.xMm === house.xMm + house.lengthMm) && candidate.yMm >= house.yMm && candidate.yMm <= house.yMm + house.widthMm)
      || ((candidate.yMm === house.yMm || candidate.yMm === house.yMm + house.widthMm) && candidate.xMm >= house.xMm && candidate.xMm <= house.xMm + house.lengthMm)
    );
    return onHouseEdge ? candidate : snapRunEndpoint(anchor, candidate, true);
  };
  const addAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === "close") { closeAt(event); return; }
    if (mode !== "draw" || event.target !== event.currentTarget) return;
    const point = nextPointAt(event.clientX, event.clientY);
    const id = nextId.current++;
    const next = addPoint(design, { id: `point-${id}`, ...point }, `segment-${id}`);
    commit(next, next.points.length === 1 ? "Start point placed. Add another point to create a measured span." : "Measured span added.");
    setPreviewPoint(point);
  };
  const closeAt = (event: ReactPointerEvent<SVGElement>) => {
    if (mode !== "close") return;
    try {
      if (!design.house) throw new RangeError("Add the measured house footprint before closing the path.");
      if (design.segments.length < 2) throw new RangeError("Draw at least two measured runs before closing to the house.");
      if (!isPointOnHouseEdge(design.points[0], design.house)) throw new RangeError("The first fence point must connect to the house. Move it onto a house edge, then try closure again.");
      const raw = toPlanRaw(event.clientX, event.clientY);
      const target = closestPointOnHouseEdge(design.house, raw.xMm, raw.yMm);
      const next = solvePathBetweenFixedEndsMm(design, target);
      commit(next, "Path closed to the house. Both connections and every measured run stayed fixed; the flexible angles were redistributed.");
      setMode("select"); setSelection({ type: "point", id: next.points.at(-1)!.id }); setPreviewPoint(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The path could not close to that house connection."); }
  };
  const zoomAt = (scale: number, clientX?: number, clientY?: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    const focusX = box && clientX !== undefined ? (clientX - box.left) / box.width : 0.5;
    const focusY = box && clientY !== undefined ? (clientY - box.top) / box.height : 0.5;
    setView((current) => zoomViewAt(current, scale, focusX, focusY));
  };
  const pointerCenter = (pointers: PlanPointer[]) => ({
    clientX: pointers.reduce((sum, pointer) => sum + pointer.clientX, 0) / pointers.length,
    clientY: pointers.reduce((sum, pointer) => sum + pointer.clientY, 0) / pointers.length,
  });
  const pointerDistance = (pointers: PlanPointer[]) => Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
  const startNavigation = (event: ReactPointerEvent<SVGSVGElement>) => {
    const temporaryPan = event.metaKey;
    const touchCandidate = event.pointerType === "touch";
    if (mode !== "pan" && !temporaryPan && !touchCandidate) { addAt(event); return; }
    event.preventDefault();
    activePointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointers = [...activePointers.current.values()];
    if (touchCandidate && mode !== "pan" && pointers.length < 2) {
      navigationGesture.current = null; navigationWasActive.current = false; return;
    }
    navigationGesture.current = {
      original: view,
      startCenter: pointerCenter(pointers),
      startDistance: pointers.length >= 2 ? pointerDistance(pointers.slice(0, 2)) : null,
    };
    navigationWasActive.current = true;
    setIsNavigating(true);
  };
  const moveNavigation = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!activePointers.current.has(event.pointerId) || !navigationGesture.current) return;
    activePointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const box = event.currentTarget.getBoundingClientRect();
    const pointers = [...activePointers.current.values()];
    const currentCenter = pointerCenter(pointers);
    const gesture = navigationGesture.current;
    if (pointers.length >= 2 && gesture.startDistance) {
      const zoomed = zoomViewAt(
        gesture.original,
        gesture.startDistance / pointerDistance(pointers.slice(0, 2)),
        (gesture.startCenter.clientX - box.left) / box.width,
        (gesture.startCenter.clientY - box.top) / box.height,
      );
      setView(panView(zoomed, currentCenter.clientX - gesture.startCenter.clientX, currentCenter.clientY - gesture.startCenter.clientY, box.width, box.height));
      return;
    }
    setView(panView(gesture.original, currentCenter.clientX - gesture.startCenter.clientX, currentCenter.clientY - gesture.startCenter.clientY, box.width, box.height));
  };
  const endNavigation = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (activePointers.current.has(event.pointerId)) {
      const pendingTap = event.type === "pointerup" && event.pointerType === "touch" && !navigationWasActive.current && activePointers.current.size === 1;
      activePointers.current.clear(); navigationGesture.current = null; navigationWasActive.current = false; setIsNavigating(false);
      if (pendingTap) addAt(event);
      return;
    }
    endDrag();
  };
  const selectSegment = (id: string) => {
    const segment = design.segments.find((item) => item.id === id);
    if (!segment) return;
    const totalInches = Math.round(segmentLengthMm(design, segment) / 25.4);
    setFeet(String(Math.floor(totalInches / 12)));
    setInches(String(totalInches % 12));
    setGateEditorOpen(false); setSelection({ type: "segment", id }); setMode("select"); setNotice("Span selected. Enter an exact length or edit its gate intent.");
  };
  const startDrag = (event: ReactPointerEvent, pointId: string) => {
    if (mode === "pan" || mode === "close" || event.metaKey) return;
    event.stopPropagation();
    setGateEditorOpen(false); setSelection({ type: "point", id: pointId }); setMode("select"); setDrag({ pointId, original: design });
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
  };
  const dragPoint = (event: ReactPointerEvent) => {
    if (!drag) return;
    let location = toPlan(event.clientX, event.clientY);
    const pointIndex = drag.original.points.findIndex(({ id }) => id === drag.pointId);
    if (lengthLockEnabled && snapEnabled && pointIndex > 0) location = snapRunEndpoint(drag.original.points[pointIndex - 1], location, true);
    const present = lengthLockEnabled
      ? movePointWithLockedFollowing(drag.original, drag.pointId, location.xMm, location.yMm)
      : movePoint(drag.original, drag.pointId, location.xMm, location.yMm);
    setHistory((current) => ({ ...current, present }));
  };
  const moveCanvasPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointers.current.has(event.pointerId)) { moveNavigation(event); return; }
    if (drag) { dragPoint(event); return; }
    if (mode === "draw") setPreviewPoint(nextPointAt(event.clientX, event.clientY));
  };
  const endDrag = () => {
    if (!drag) return;
    setHistory((current) => current.present.points.find(({ id }) => id === drag.pointId)?.xMm === drag.original.points.find(({ id }) => id === drag.pointId)?.xMm
      && current.present.points.find(({ id }) => id === drag.pointId)?.yMm === drag.original.points.find(({ id }) => id === drag.pointId)?.yMm
      ? { ...current, present: drag.original }
      : { past: [...current.past, drag.original], present: current.present, future: [] });
    setDrag(null); setNotice(lengthLockEnabled ? "Angle adjusted. Locked lengths stayed fixed and the following path moved with the point." : "Point moved. Connected measurements updated.");
  };
  const applyExactLength = () => {
    if (!selectedSegment) return;
    try {
      const length = feetAndInchesToMm(Number(feet), Number(inches));
      const end = pointById(design, selectedSegment.toPointId);
      const house = design.house;
      const endOnHouse = Boolean(house && isPointOnHouseEdge(end, house));
      const anchoredAtBothEnds = Boolean(house && design.points.length > 2 && isPointOnHouseEdge(design.points[0], house) && isPointOnHouseEdge(design.points.at(-1)!, house));
      const next = anchoredAtBothEnds
        ? solvePathBetweenFixedEndsMm(design, design.points.at(-1)!, { segmentId: selectedSegment.id, lengthMm: length })
        : endOnHouse ? setSegmentLengthKeepingEndMm(design, selectedSegment.id, length, lengthLockEnabled) : setSegmentLengthMm(design, selectedSegment.id, length);
      commit(next, anchoredAtBothEnds
        ? `Span set to ${formatFeetInches(length)}. Both house connections and the other measured runs stayed fixed while the angles adjusted.`
        : endOnHouse ? `Span set to ${formatFeetInches(length)} while the house connection stayed fixed.` : `Span set to ${formatFeetInches(length)}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid length."); }
  };
  const addGate = () => {
    if (!selectedPoint) return;
    try {
      const width = feetAndInchesToMm(Number(gateFeet), Number(gateInches));
      const id = nextId.current;
      const next = insertGateAtPoint(design, selectedPoint.id, width, gateType, `point-${id}`, `segment-${id}`);
      nextId.current += 1;
      const anchorIndex = next.points.findIndex(({ id: pointId }) => pointId === selectedPoint.id);
      const gate = next.segments[anchorIndex];
      commit(next, `${gateType === "double" ? "Double" : "Single"} gate added with a total opening of ${formatFeetInches(width)}.`);
      const totalInches = Math.round(width / 25.4);
      setFeet(String(Math.floor(totalInches / 12))); setInches(String(totalInches % 12));
      setGateFeet(""); setGateInches("0"); setGateEditorOpen(false); setSelection(gate ? { type: "segment", id: gate.id } : null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid total gate width."); }
  };
  const selectHouse = () => {
    if (design.house) {
      const totalInches = Math.round(design.house.lengthMm / 25.4);
      const widthInches = Math.round(design.house.widthMm / 25.4);
      setHouseFeet(String(Math.floor(totalInches / 12))); setHouseInches(String(totalInches % 12));
      setHouseWidthFeet(String(Math.floor(widthInches / 12))); setHouseWidthInches(String(widthInches % 12));
    }
    setGateEditorOpen(false); setSelection({ type: "house" }); setMode("select"); setNotice(design.house ? "House reference selected." : "Enter the measured house-wall length to add it.");
  };
  const applyHouseLength = () => {
    try {
      const length = feetAndInchesToMm(Number(houseFeet), Number(houseInches));
      const width = feetAndInchesToMm(Number(houseWidthFeet), Number(houseWidthInches));
      const next = setHouseReference(design, length, width);
      commit(next, `House footprint set to ${formatFeetInches(length)} × ${formatFeetInches(width)}.`); setView(fittedView(next));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid house length."); }
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
      setHistory(createHistory(loaded)); nextId.current = nextNumericId(loaded); setSelection(null); setGateEditorOpen(false); setView(fittedView(loaded)); setNotice("Saved local layout loaded.");
    } catch (error) { setNotice(error instanceof Error ? `Saved layout was not opened: ${error.message}` : "Saved layout was not opened."); }
  };

  return <main className="fence-designer">
    <header className="app-header">
      <div><p className="eyebrow">McKenzie OS · isolated prototype</p><h1>Fence Visual Measure</h1><p>Draw the property-side path. Measurements stay local and contain no pricing or product rules.</p></div>
      <div className="total-card"><span>Total measured length</span><strong>{formatFeetInches(totals.all)}</strong><small>{design.segments.length} span{design.segments.length === 1 ? "" : "s"}{totals.gate ? ` · ${formatFeetInches(totals.gate)} gate intent` : ""}</small></div>
    </header>

    <nav className="toolbar" aria-label="Drawing controls">
      <div className="segmented"><button className={mode === "draw" ? "active" : ""} onClick={() => { setMode("draw"); setSelection(null); setNotice("Tap empty plan space to continue the connected fence path."); }}>＋ Draw</button><button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}>↖ Edit</button><button className={mode === "pan" ? "active" : ""} onClick={() => { setMode("pan"); setSelection(null); setNotice("Drag the plan to move around. Pinch with two fingers to zoom."); }}>✋ Pan</button></div>
      <button disabled={history.past.length === 0} onClick={() => { setHistory(undo); setSelection(null); setNotice("Undid the last change."); }}>↶ Undo</button>
      <button disabled={history.future.length === 0} onClick={() => { setHistory(redo); setSelection(null); setNotice("Redid the change."); }}>↷ Redo</button>
      <div className="zoom-controls" aria-label="Plan zoom"><button aria-label="Zoom out" onClick={() => zoomAt(1.25)}>−</button><span>{Math.round(DEFAULT_VIEW.width / view.width * 100)}%</span><button aria-label="Zoom in" onClick={() => zoomAt(0.8)}>＋</button></div>
      <button onClick={() => setView(fittedView(design))}>Fit plan</button>
      <button className={houseSelected ? "active-tool" : ""} onClick={selectHouse}>{design.house ? "⌂ House" : "＋ House"}</button>
      <button disabled={!design.house || design.segments.length < 2} className={mode === "close" ? "active-tool" : ""} onClick={() => { setMode("close"); setSelection(null); setPreviewPoint(null); setNotice("Tap the second connection on the house. Closure will keep all measured runs fixed and redistribute only the angles."); }}>⇥ Close to house</button>
      <button aria-pressed={snapEnabled} className={snapEnabled ? "active-tool" : ""} onClick={() => { setSnapEnabled((current) => !current); setPreviewPoint(null); setNotice(snapEnabled ? "Free angle is on. Runs now follow the measured geometry without angle assumptions." : "45°/90° angle assist is on."); }}>{snapEnabled ? "⌁ 45°/90° assist" : "◌ Free angle"}</button>
      <button aria-pressed={lengthLockEnabled} className={lengthLockEnabled ? "active-tool" : ""} onClick={() => { setLengthLockEnabled((current) => !current); setNotice(lengthLockEnabled ? "Length lock is off. Dragging a point can now change connected measurements." : "Length lock is on. Dragging adjusts the angle while preserving the incoming and following measurements."); }}>{lengthLockEnabled ? "🔒 Lengths" : "🔓 Lengths"}</button>
      <span className="toolbar-spacer" />
      <button onClick={save}>Save local</button><button onClick={load}>Load local</button>
    </nav>

    <section className="workspace">
      <div className="canvas-shell">
        <div className="canvas-key"><span><i className="key-dot endpoint" /> Open endpoint</span><span><i className="key-dot corner" /> Corner</span><span><i className="key-line preview" /> Live run</span><span><i className="key-line gate" /> Gate intent</span></div>
        <svg ref={svgRef} className={`plan-canvas ${mode}${isNavigating ? " navigating" : ""}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={startNavigation} onPointerMove={moveCanvasPointer} onPointerLeave={() => { if (!drag && !isNavigating) setPreviewPoint(null); }} onPointerUp={endNavigation} onPointerCancel={endNavigation} aria-label="Fence drawing plan">
          <defs><pattern id="grid" width={GRID_MM} height={GRID_MM} patternUnits="userSpaceOnUse"><path d={`M ${GRID_MM} 0 L 0 0 0 ${GRID_MM}`} fill="none" stroke="#d8ddd7" strokeWidth="18" /></pattern></defs>
          <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" pointerEvents="none" />
          {design.house && <g className={`house-reference${houseSelected ? " selected" : ""}`} role="button" tabIndex={0} aria-label={`House footprint ${formatFeetInches(design.house.lengthMm)} by ${formatFeetInches(design.house.widthMm)}`} onPointerDown={(event) => { if (mode === "close") { event.stopPropagation(); closeAt(event); } else if (mode !== "pan" && !event.metaKey) { event.stopPropagation(); selectHouse(); } }}>
            <rect className="house-hit" x={design.house.xMm} y={design.house.yMm} width={design.house.lengthMm} height={design.house.widthMm} />
            <rect className="house-footprint" x={design.house.xMm} y={design.house.yMm} width={design.house.lengthMm} height={design.house.widthMm} />
            <g transform={`translate(${design.house.xMm + design.house.lengthMm / 2} ${design.house.yMm + design.house.widthMm / 2})`} className="house-label"><rect x="-1050" y="-300" width="2100" height="600" rx="180" /><text textAnchor="middle" dominantBaseline="central">HOUSE · {formatFeetInches(design.house.lengthMm)} × {formatFeetInches(design.house.widthMm)}</text></g>
          </g>}
          {design.segments.map((segment) => {
            const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
            const midX = (start.xMm + end.xMm) / 2; const midY = (start.yMm + end.yMm) / 2;
            const selected = selection?.type === "segment" && selection.id === segment.id;
            return <g key={segment.id} className={`segment ${segment.kind}${selected ? " selected" : ""}`} onPointerDown={(event) => { if (mode !== "pan" && mode !== "close" && !event.metaKey) { event.stopPropagation(); selectSegment(segment.id); } }} role="button" tabIndex={0} onKeyDown={(event) => { if (mode !== "pan" && mode !== "close" && (event.key === "Enter" || event.key === " ")) selectSegment(segment.id); }}>
              <line className="segment-hit" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              <line className="segment-line" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              <g transform={`translate(${midX} ${midY})`} className="dimension"><rect x="-760" y="-260" width="1520" height="520" rx="180" /><text textAnchor="middle" dominantBaseline="central">{segment.kind === "gate" ? `${segment.gateType === "double" ? "DOUBLE" : "SINGLE"} GATE · ` : ""}{formatFeetInches(segmentLengthMm(design, segment))}</text></g>
            </g>;
          })}
          {mode === "draw" && previewPoint && design.points.at(-1) && (() => {
            const start = design.points.at(-1)!;
            const length = Math.round(Math.hypot(previewPoint.xMm - start.xMm, previewPoint.yMm - start.yMm));
            const midX = (start.xMm + previewPoint.xMm) / 2; const midY = (start.yMm + previewPoint.yMm) / 2;
            return <g className="run-preview" pointerEvents="none" role="img" aria-label={`Live run ${formatFeetInches(length)}${snapEnabled ? ", snap on" : ", snap off"}`}>
              <line x1={start.xMm} y1={start.yMm} x2={previewPoint.xMm} y2={previewPoint.yMm} />
              <circle cx={previewPoint.xMm} cy={previewPoint.yMm} r="155" />
              <g transform={`translate(${midX} ${midY})`} className="preview-dimension"><rect x="-780" y="-285" width="1560" height="570" rx="190" /><text textAnchor="middle" dominantBaseline="central">{snapEnabled ? "SNAP · " : ""}{formatFeetInches(length)}</text></g>
            </g>;
          })()}
          {design.points.map((point) => {
            const role = pointRole(design, point.id); const selected = selection?.type === "point" && selection.id === point.id;
            return <g key={point.id} className={`point ${role.replace(" ", "-")}${selected ? " selected" : ""}`} transform={`translate(${point.xMm} ${point.yMm})`} onPointerDown={(event) => startDrag(event, point.id)} role="button" tabIndex={0} aria-label={`${role} ${point.id}`}>
              <circle className="point-hit" r="460" /><circle className="point-dot" r="190" />
            </g>;
          })}
        </svg>
        {design.points.length === 0 && !design.house && <div className="empty-state"><strong>Start with one property point</strong><span>Choose Draw, then tap anywhere on the grid.</span></div>}
      </div>

      <aside className="inspector">
        <p className="eyebrow">Selection</p>
        {!selection && <div className="inspector-empty"><h2>No item selected</h2><p>Tap a span for exact length and gate intent. Tap or drag a point to edit the path.</p></div>}
        {houseSelected && <div><h2>House footprint</h2><p>{design.house ? "This measured footprint is visual context only and is excluded from fence totals." : "Add an optional measured house footprint before drawing the fence."}</p><h3 className="field-heading">House length</h3><div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="1" max="1000" placeholder="Required" value={houseFeet} onChange={(event) => setHouseFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={houseInches} onChange={(event) => setHouseInches(event.target.value)} /></label></div><h3 className="field-heading">House width</h3><div className="exact-grid"><label><span>Feet</span><input aria-label="Width feet" inputMode="numeric" type="number" min="1" max="1000" placeholder="Required" value={houseWidthFeet} onChange={(event) => setHouseWidthFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Width inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={houseWidthInches} onChange={(event) => setHouseWidthInches(event.target.value)} /></label></div><button className="primary wide" onClick={applyHouseLength}>{design.house ? "Update house footprint" : "Add house footprint"}</button>{design.house && <button className="danger wide" onClick={() => { commit(removeHouseReference(design), "House footprint removed."); setSelection(null); }}>Remove house footprint</button>}<small>House-edge connections stay active in free-angle mode. The optional angle assist affects only non-house points. This footprint is not a survey or building record.</small></div>}
        {selectedPoint && <div><h2>{pointRole(design, selectedPoint.id)}</h2><p className="coordinate">X {formatFeetInches(Math.abs(selectedPoint.xMm))} · Y {formatFeetInches(Math.abs(selectedPoint.yMm))}</p><p>{lengthLockEnabled ? "Drag to adjust the angle. The incoming length stays fixed and every following point moves with it." : "Drag this point freely; connected span lengths will change."}</p>{design.house && design.segments.length >= 2 && selectedPoint.id === design.points.at(-1)?.id && <button className="primary wide" onClick={() => { setMode("close"); setSelection(null); setPreviewPoint(null); setNotice("Tap the second connection on the house. Closure will keep all measured runs fixed and redistribute only the angles."); }}>⇥ Close this path to house</button>}<button className="primary wide" onClick={() => { setGateEditorOpen((current) => !current); setNotice("Choose single or double, then enter the total gate opening width."); }}>{gateEditorOpen ? "Cancel add gate" : "＋ Add gate"}</button>{gateEditorOpen && <div className="gate-editor"><label><span>Gate style</span><select aria-label="Gate style" value={gateType} onChange={(event) => setGateTypeChoice(event.target.value as GateType)}><option value="single">Single gate</option><option value="double">Double gate</option></select></label><h3 className="field-heading">Total gate width</h3><div className="exact-grid"><label><span>Feet</span><input aria-label="Gate width feet" inputMode="numeric" type="number" min="0" max="1000" placeholder="Required" value={gateFeet} onChange={(event) => setGateFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Gate width inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={gateInches} onChange={(event) => setGateInches(event.target.value)} /></label></div><button className="primary wide" onClick={addGate}>Place gate from this point</button><small>The total width is the full opening. A double gate is recorded as two-leaf intent only.</small></div>}<button className="danger wide" onClick={removeSelection}>Delete point</button></div>}
        {selectedSegment && <div><h2>{selectedSegment.kind === "gate" ? `${selectedSegment.gateType === "double" ? "Double" : "Single"} gate` : "Fence span"}</h2><div className="length-readout">{formatFeetInches(segmentLengthMm(design, selectedSegment))}</div>{selectedSegment.kind === "gate" && <label className="select-field"><span>Gate style</span><select value={selectedSegment.gateType ?? "single"} onChange={(event) => commit(setGateType(design, selectedSegment.id, event.target.value as GateType), "Gate style updated.")}><option value="single">Single gate</option><option value="double">Double gate</option></select></label>}<div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="0" max="1000" value={feet} onChange={(event) => setFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={inches} onChange={(event) => setInches(event.target.value)} /></label></div><button className="primary wide" onClick={applyExactLength}>Apply exact length</button><button className="wide" onClick={() => commit(setSegmentKind(design, selectedSegment.id, selectedSegment.kind === "gate" ? "fence" : "gate"), selectedSegment.kind === "gate" ? "Span restored to fence intent." : "Whole span marked as a single gate.")}>{selectedSegment.kind === "gate" ? "Mark as fence" : "Mark whole span as single gate"}</button><small>Gate intent does not imply products, posts, hardware, or pricing.</small></div>}
        <div className="notice" role="status">{notice}</div>
      </aside>
    </section>
    <footer className="app-footer"><span>{snapEnabled ? "45°/90° angle assist" : "Free angle · exact lengths take priority"} · house anchors stay active · Esc cancels</span><span>Close to house flexes all angles · local only · revision {design.revision}</span></footer>
  </main>;
}
