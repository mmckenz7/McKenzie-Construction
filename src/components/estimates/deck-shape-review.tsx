"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  deckFieldDimensions,
  deckRailingGeometry,
  type DeckObservationItem,
} from "@/lib/deck-takeoff-v0";
import {
  insertOutlinePointOnNearestEdge,
  isValidDeckOutline,
  snapDeckOutlinePoint,
  type DeckOutlinePoint,
} from "@/lib/deck-prescriptive-plan";

export type FinalizedDeckShape = Readonly<{
  id: string;
  shapeRevision: number;
  projectKind: "replacement" | "new_construction";
  outline: readonly DeckOutlinePoint[];
  stairsPresent: boolean;
  source: "human_approved_site_shape";
  sourceVisitRevision: number;
  approvedAt: string;
}>;

const primary = "min-h-12 rounded-lg bg-blue-700 px-5 py-3 text-base font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "min-h-12 rounded-lg border-2 border-slate-400 bg-white px-4 py-3 text-base font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function edgeLength(a: DeckOutlinePoint, b: DeckOutlinePoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function shapeArea(points: readonly DeckOutlinePoint[]) {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

export function DeckShapeReview({
  visitItems,
  visitId,
  visitRevision,
  initialShape,
  disabled,
  onFinalize,
}: {
  visitItems: readonly DeckObservationItem[];
  visitId: string;
  visitRevision: number;
  initialShape: FinalizedDeckShape | null;
  disabled: boolean;
  onFinalize: (shape: FinalizedDeckShape) => void;
}) {
  const dimensions = useMemo(() => deckFieldDimensions(visitItems), [visitItems]);
  const geometry = useMemo(() => deckRailingGeometry(visitItems), [visitItems]);
  const length = dimensions.lengthFeet ?? 12;
  const width = dimensions.widthFeet ?? 12;
  const initialOutline = useMemo<DeckOutlinePoint[]>(
    () => [
      { x: 0, y: 0 },
      { x: length, y: 0 },
      { x: length, y: width },
      { x: 0, y: width },
    ],
    [length, width],
  );
  const [projectKind, setProjectKind] = useState<"replacement" | "new_construction">(initialShape?.projectKind ?? "replacement");
  const [stairsPresent, setStairsPresent] = useState<boolean | null>(initialShape?.stairsPresent ?? geometry.stairsPresent);
  const [outline, setOutline] = useState<DeckOutlinePoint[]>(initialShape ? [...initialShape.outline] : initialOutline);
  const [shapeRevision, setShapeRevision] = useState(initialShape?.shapeRevision ?? 0);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addPointMode, setAddPointMode] = useState(false);
  const [snapMode, setSnapMode] = useState<"angle" | "free">("angle");
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [edgeDraft, setEdgeDraft] = useState("");
  const [feedback, setFeedback] = useState(initialShape ? `Saved shape revision ${initialShape.shapeRevision} loaded.` : "Starting outline loaded from the completed site visit.");
  const svgRef = useRef<SVGSVGElement>(null);
  const automaticSuggestionStarted = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const maxX = Math.max(...outline.map((point) => point.x), length * 1.25, 1);
  const maxY = Math.max(...outline.map((point) => point.y), width * 1.25, 1);
  const drawingScale = Math.min(264 / maxX, 154 / maxY);
  const drawingOriginX = 28 + (264 - maxX * drawingScale) / 2;
  const drawingOriginY = 28 + (154 - maxY * drawingScale) / 2;
  const toSvg = (point: DeckOutlinePoint) => ({
    x: drawingOriginX + point.x * drawingScale,
    y: drawingOriginY + point.y * drawingScale,
  });
  const points = outline.map(toSvg);
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  const gridX = Array.from({ length: Math.floor(maxX * 2) + 1 }, (_, index) => index / 2);
  const gridY = Array.from({ length: Math.floor(maxY * 2) + 1 }, (_, index) => index / 2);

  async function loadPhotoSuggestion() {
    if (suggesting || initialShape || projectKind !== "replacement") return;
    setSuggesting(true);
    setFeedback("Reviewing saved photos for a general replacement footprint…");
    try {
      const response = await fetch(`/api/guided-site-visits/${encodeURIComponent(visitId)}/deck-shape-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), projectKind }),
      });
      const body = await response.json() as {
        success?: boolean;
        error?: string;
        usedAi?: boolean;
        outline?: DeckOutlinePoint[];
        photoCount?: number;
        explanation?: string;
      };
      if (!response.ok || !body.success || !body.outline || !isValidDeckOutline(body.outline))
        throw new Error(body.error || "The starting shape could not be prepared.");
      setOutline([...body.outline]);
      setSelectedEdge(null);
      setFeedback(`${body.usedAi ? `AI used ${body.photoCount ?? 0} saved photos for the general shape. ` : ""}${body.explanation ?? "Review every corner and measurement before saving."}`);
    } catch (error) {
      setOutline(initialOutline);
      setFeedback(`${error instanceof Error ? error.message : "Photo review was unavailable."} The verified field dimensions remain as the starting rectangle.`);
    } finally {
      setSuggesting(false);
    }
  }

  useEffect(() => {
    if (automaticSuggestionStarted.current || initialShape || projectKind !== "replacement") return;
    automaticSuggestionStarted.current = true;
    void loadPhotoSuggestion();
    // The first replacement visit gets one automatic suggestion. Manual retry remains available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShape, projectKind, visitId]);

  function clientPoint(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const drawingX = ((event.clientX - bounds.left) / bounds.width) * 320;
    const drawingY = ((event.clientY - bounds.top) / bounds.height) * 210;
    return {
      x: Math.max(0, Math.min(maxX, (drawingX - drawingOriginX) / drawingScale)),
      y: Math.max(0, Math.min(maxY, (drawingY - drawingOriginY) / drawingScale)),
    };
  }

  function movePoint(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragIndex === null || addPointMode) return;
    const candidate = clientPoint(event);
    if (!candidate) return;
    setOutline((current) => {
      const nextPoint = snapMode === "angle"
        ? snapDeckOutlinePoint(
          candidate,
          current[(dragIndex - 1 + current.length) % current.length],
          current[(dragIndex + 1) % current.length],
          0.5,
        )
        : {
          x: Math.round(candidate.x * 12) / 12,
          y: Math.round(candidate.y * 12) / 12,
        };
      const next = current.map((point, index) => index === dragIndex ? nextPoint : point);
      return isValidDeckOutline(next) ? next : current;
    });
  }

  function addPoint(event: ReactPointerEvent<SVGSVGElement>) {
    if (!addPointMode) return;
    const candidate = clientPoint(event);
    if (!candidate) return;
    const next = insertOutlinePointOnNearestEdge(outline, candidate, snapMode === "angle" ? 6 : 1);
    if (next === outline) {
      setFeedback("Tap closer to an outside edge to add a corner.");
      return;
    }
    setOutline([...next]);
    setFeedback(`Corner added. ${snapMode === "angle" ? "It will snap to the 6-inch grid and 45°/90° lines when moved." : "Free placement is on."}`);
  }

  function applyEdgeLength() {
    if (selectedEdge === null) return;
    const value = Number(edgeDraft);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      setFeedback("Enter an edge length greater than 0 and no more than 100 feet.");
      return;
    }
    setOutline((current) => {
      const start = current[selectedEdge];
      const endIndex = (selectedEdge + 1) % current.length;
      const end = current[endIndex];
      const currentLength = edgeLength(start, end);
      if (!currentLength) return current;
      const nextEnd = {
        x: start.x + ((end.x - start.x) / currentLength) * value,
        y: start.y + ((end.y - start.y) / currentLength) * value,
      };
      const next = current.map((point, index) => index === endIndex ? nextEnd : point);
      if (!isValidDeckOutline(next)) {
        setFeedback("That measurement would cross or collapse the outline.");
        return current;
      }
      setFeedback(`Edge ${selectedEdge + 1} updated to ${value} feet.`);
      return next;
    });
  }

  async function approveShape() {
    if (saving || disabled || stairsPresent === null || !isValidDeckOutline(outline)) return;
    setSaving(true);
    setFeedback("Saving the approved Deck shape…");
    try {
      const response = await fetch(`/api/guided-site-visits/${encodeURIComponent(visitId)}/deck-shape-revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedShapeRevision: shapeRevision,
          idempotencyKey: crypto.randomUUID(),
          projectKind,
          outline,
          stairsPresent,
        }),
      });
      const body = await response.json() as {
        success?: boolean;
        error?: string;
        shapeRevisionId?: string;
        shapeRevision?: number;
        outline?: DeckOutlinePoint[];
      };
      if (!response.ok || !body.success || !body.shapeRevisionId || !Number.isSafeInteger(body.shapeRevision))
        throw new Error(body.error || "The Deck shape could not be saved.");
      const saved: FinalizedDeckShape = {
        id: body.shapeRevisionId,
        shapeRevision: body.shapeRevision!,
        projectKind,
        outline: body.outline ?? outline,
        stairsPresent,
        source: "human_approved_site_shape",
        sourceVisitRevision: visitRevision,
        approvedAt: new Date().toISOString(),
      };
      setShapeRevision(saved.shapeRevision);
      setFeedback(`Shape revision ${saved.shapeRevision} saved. Opening structural planning.`);
      onFinalize(saved);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The Deck shape could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="deck-shape-review-title" className="rounded-2xl border-2 border-blue-700 bg-white p-4 shadow-sm sm:p-6">
    <p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Step 2 · Confirm the shape</p>
    <h2 id="deck-shape-review-title" className="mt-1 text-2xl font-black text-slate-950">Does this look like the deck?</h2>
    <p className="mt-2 text-sm leading-6 text-slate-700">Saved field measurements create the starting outline, and the site photos remain the visual reference. Correct only the footprint and stair presence here. Framing, code, materials and pricing come later.</p>

    <fieldset className="mt-4">
      <legend className="text-sm font-black text-slate-950">Project type</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={projectKind === "replacement"} className={projectKind === "replacement" ? primary : secondary} onClick={() => setProjectKind("replacement")}>Replacement</button>
        <button type="button" aria-pressed={projectKind === "new_construction"} className={projectKind === "new_construction" ? primary : secondary} onClick={() => { setProjectKind("new_construction"); setOutline(initialOutline); setFeedback("New construction starts from the field-entered dimensions. Existing photos remain site context only."); }}>New deck</button>
      </div>
    </fieldset>

    {projectKind === "replacement" && !initialShape ? <div className="mt-3 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950">
      <p className="font-black">Photo-assisted starting shape</p>
      <p className="mt-1 leading-6">AI may suggest the general existing footprint from saved photos. It never supplies exact dimensions or structural decisions.</p>
      <button type="button" className={`mt-2 w-full ${secondary}`} disabled={suggesting} onClick={() => void loadPhotoSuggestion()}>{suggesting ? "Reviewing saved photos…" : "Try the saved photos again"}</button>
    </div> : null}

    <div className="mt-4 rounded-xl border-2 border-slate-900 bg-slate-950 p-2">
      <svg
        ref={svgRef}
        viewBox="0 0 320 210"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        className="block w-full touch-none rounded-lg bg-white"
        onPointerMove={movePoint}
        onPointerUp={() => setDragIndex(null)}
        onPointerCancel={() => setDragIndex(null)}
        onPointerDown={addPoint}
      >
        <title id={titleId}>Editable bird&apos;s-eye deck outline</title>
        <desc id={descriptionId}>A top view of the proposed deck footprint with a six-inch grid, draggable corner points, measured edges, and default 45-degree and 90-degree snapping.</desc>
        <rect x="0" y="0" width="320" height="210" fill="#f8fafc" />
        {gridX.map((value) => {
          const x = toSvg({ x: value, y: 0 }).x;
          const major = Number.isInteger(value);
          return <line key={`grid-x-${value}`} x1={x} y1="24" x2={x} y2="198" stroke={major ? "#64748b" : "#94a3b8"} strokeWidth={major ? "1.1" : "0.7"} vectorEffect="non-scaling-stroke" />;
        })}
        {gridY.map((value) => {
          const y = toSvg({ x: 0, y: value }).y;
          const major = Number.isInteger(value);
          return <line key={`grid-y-${value}`} x1="16" y1={y} x2="304" y2={y} stroke={major ? "#64748b" : "#94a3b8"} strokeWidth={major ? "1.1" : "0.7"} vectorEffect="non-scaling-stroke" />;
        })}
        <text x="160" y="18" textAnchor="middle" fontSize="10" fontWeight="800" fill="#334155">HOUSE / BUILDING SIDE</text>
        <polygon points={polygon} fill="#bfdbfe" fillOpacity="0.58" stroke="#0f172a" strokeWidth="3" />
        {outline.map((point, index) => {
          const start = points[index];
          const end = points[(index + 1) % points.length];
          const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          return <g key={`edge-${index}`}>
            <text x={midpoint.x} y={midpoint.y - 7} textAnchor="middle" fontSize="10" fontWeight="900" fill="#0f172a" stroke="white" strokeWidth="3" paintOrder="stroke">{edgeLength(point, outline[(index + 1) % outline.length]).toFixed(1)} ft</text>
          </g>;
        })}
        {points.map((point, index) => <g key={`point-${index}`}>
          <circle
            cx={point.x}
            cy={point.y}
            r="22"
            fill="transparent"
            onPointerDown={(event) => {
              if (addPointMode) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragIndex(index);
              setFeedback(`Moving corner ${index + 1}.`);
            }}
          />
          <circle cx={point.x} cy={point.y} r="3.5" fill="#ea580c" stroke="#7c2d12" strokeWidth="1" pointerEvents="none" />
        </g>)}
        {stairsPresent ? <g aria-label="Stairs are present"><rect x="130" y="181" width="60" height="22" fill="#fef3c7" stroke="#92400e" strokeWidth="2" /><text x="160" y="196" textAnchor="middle" fontSize="10" fontWeight="900" fill="#78350f">STAIRS</text></g> : null}
      </svg>
    </div>

    <fieldset className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <legend className="px-1 text-sm font-black text-slate-950">Corner movement</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={snapMode === "angle" ? primary : secondary} aria-pressed={snapMode === "angle"} onClick={() => { setSnapMode("angle"); setFeedback("Snap is on: corners follow the 6-inch grid and 45°/90° lines."); }}>Snap 45° / 90°</button>
        <button type="button" className={snapMode === "free" ? primary : secondary} aria-pressed={snapMode === "free"} onClick={() => { setSnapMode("free"); setFeedback("Free placement is on. Corners move in one-inch increments."); }}>Free placement</button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-700">Snap mode is the default so nearby corners stay square or diagonal. Use Free placement only for an unusual angle.</p>
    </fieldset>

    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" className={addPointMode ? primary : secondary} aria-pressed={addPointMode} onClick={() => { setAddPointMode((current) => !current); setFeedback(addPointMode ? "Corner adding turned off." : "Tap an outside edge to add a bump-in or bump-out corner."); }}>{addPointMode ? "Done adding points" : "Add a corner"}</button>
      <button type="button" className={secondary} onClick={() => { setOutline(initialOutline); setSelectedEdge(null); setFeedback("Starting rectangle restored from field measurements."); }}>Reset outline</button>
    </div>

    <details className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Enter an exact edge measurement</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-bold text-slate-900">Edge<select className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" value={selectedEdge ?? ""} onChange={(event) => { const index = Number(event.target.value); setSelectedEdge(index); setEdgeDraft(edgeLength(outline[index], outline[(index + 1) % outline.length]).toFixed(2)); }}><option value="">Choose edge</option>{outline.map((_, index) => <option key={index} value={index}>Edge {index + 1}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-900">Length in feet<input className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" inputMode="decimal" value={edgeDraft} onChange={(event) => setEdgeDraft(event.target.value)} /></label>
        <button type="button" className={`${primary} self-end`} disabled={selectedEdge === null} onClick={applyEdgeLength}>Apply</button>
      </div>
    </details>

    <fieldset className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <legend className="px-1 text-sm font-black text-slate-950">Does this deck have stairs?</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={stairsPresent === true ? primary : secondary} aria-pressed={stairsPresent === true} onClick={() => setStairsPresent(true)}>Yes, stairs</button>
        <button type="button" className={stairsPresent === false ? primary : secondary} aria-pressed={stairsPresent === false} onClick={() => setStairsPresent(false)}>No stairs</button>
      </div>
    </fieldset>

    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
      <div className="rounded-lg bg-slate-100 p-2"><strong className="block text-slate-950">{outline.length}</strong><span className="text-slate-600">corners</span></div>
      <div className="rounded-lg bg-slate-100 p-2"><strong className="block text-slate-950">{shapeArea(outline).toFixed(0)} sq ft</strong><span className="text-slate-600">shape area</span></div>
      <div className="rounded-lg bg-slate-100 p-2"><strong className="block text-slate-950">{stairsPresent === null ? "Choose" : stairsPresent ? "Yes" : "No"}</strong><span className="text-slate-600">stairs</span></div>
    </div>
    <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-bold text-blue-950">{feedback}</p>
    <button type="button" className={`mt-4 w-full ${primary}`} disabled={disabled || saving || !isValidDeckOutline(outline) || stairsPresent === null} onClick={() => void approveShape()}>{saving ? "Saving approved shape…" : "Save this shape — continue to structure"}</button>
  </section>;
}
