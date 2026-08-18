"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  deckBlueprintVisitSeed,
  deckFieldDimensions,
  deckRailingGeometry,
  type DeckObservationItem,
} from "@/lib/deck-takeoff-v0";
import {
  closeDeckOutlineWithMeasuredWall,
  insertOutlinePointOnNearestEdge,
  isValidDeckOutline,
  moveDeckOutlineEdge,
  nearestDeckStairPlacement,
  snapDeckOutlinePoint,
  steadyGradeHeightAtPoint,
  type DeckGradeHeights,
  type DeckOutlinePoint,
  type DeckStairPlacement,
} from "@/lib/deck-prescriptive-plan";

export type FinalizedDeckShape = Readonly<{
  id: string;
  shapeRevision: number;
  projectKind: "replacement" | "new_construction";
  outline: readonly DeckOutlinePoint[];
  stairsPresent: boolean;
  stairPlacement: DeckStairPlacement | null;
  gradeHeights: DeckGradeHeights;
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
  const fieldSeed = useMemo(() => deckBlueprintVisitSeed(visitItems), [visitItems]);
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
  const defaultHeight = fieldSeed.heightFromGradeFeet ?? 8;
  const [gradeHeights, setGradeHeights] = useState<DeckGradeHeights>(initialShape?.gradeHeights ?? {
    houseLeftFeet: defaultHeight,
    houseRightFeet: defaultHeight,
    yardLeftFeet: defaultHeight,
    yardRightFeet: defaultHeight,
  });
  const [stairPlacement, setStairPlacement] = useState<DeckStairPlacement | null>(() =>
    initialShape?.stairPlacement ?? nearestDeckStairPlacement(
      initialShape?.outline ?? initialOutline,
      { x: length / 2, y: width },
      geometry.stairWidthFeet ?? 4,
      3,
    ),
  );
  const [shapeRevision, setShapeRevision] = useState(initialShape?.shapeRevision ?? 0);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragEdgeIndex, setDragEdgeIndex] = useState<number | null>(null);
  const [draggingStairs, setDraggingStairs] = useState(false);
  const [addPointMode, setAddPointMode] = useState(false);
  const [snapMode, setSnapMode] = useState<"smart" | "free">("smart");
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [edgeDraft, setEdgeDraft] = useState("");
  const [perimeterPoints, setPerimeterPoints] = useState<DeckOutlinePoint[] | null>(null);
  const [measurementStep, setMeasurementStep] = useState<number | null>(null);
  const [advancedEditing, setAdvancedEditing] = useState(false);
  const [feedback, setFeedback] = useState(initialShape ? `Saved shape revision ${initialShape.shapeRevision} loaded.` : "Starting outline loaded from the completed site visit.");
  const svgRef = useRef<SVGSVGElement>(null);
  const edgeDragRef = useRef<{
    edgeIndex: number;
    startPointer: DeckOutlinePoint;
    startOutline: readonly DeckOutlinePoint[];
  } | null>(null);
  const automaticSuggestionStarted = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const displayedOutline = perimeterPoints ?? outline;
  const maxX = Math.max(...displayedOutline.map((point) => point.x), length * 1.25, 1);
  const maxY = Math.max(...displayedOutline.map((point) => point.y), width * 1.25, 1);
  const outlineBounds = useMemo(() => ({
    minX: Math.min(...outline.map((point) => point.x)),
    maxX: Math.max(...outline.map((point) => point.x)),
    minY: Math.min(...outline.map((point) => point.y)),
    maxY: Math.max(...outline.map((point) => point.y)),
  }), [outline]);
  const drawingScale = Math.min(264 / maxX, 154 / maxY);
  const drawingOriginX = 28 + (264 - maxX * drawingScale) / 2;
  const drawingOriginY = 28 + (154 - maxY * drawingScale) / 2;
  const toSvg = useCallback((point: DeckOutlinePoint) => ({
    x: drawingOriginX + point.x * drawingScale,
    y: drawingOriginY + point.y * drawingScale,
  }), [drawingOriginX, drawingOriginY, drawingScale]);
  const points = displayedOutline.map(toSvg);
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  const gridX = Array.from({ length: Math.floor(maxX * 2) + 1 }, (_, index) => index / 2);
  const gridY = Array.from({ length: Math.floor(maxY * 2) + 1 }, (_, index) => index / 2);
  const stairGeometry = useMemo(() => {
    if (!stairsPresent || !stairPlacement || stairPlacement.edgeIndex >= outline.length) return null;
    const start = outline[stairPlacement.edgeIndex];
    const end = outline[(stairPlacement.edgeIndex + 1) % outline.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const edgeSize = Math.hypot(dx, dy);
    if (edgeSize < stairPlacement.widthFeet) return null;
    const tangent = { x: dx / edgeSize, y: dy / edgeSize };
    const outward = { x: dy / edgeSize, y: -dx / edgeSize };
    const center = {
      x: start.x + tangent.x * stairPlacement.offsetFeet,
      y: start.y + tangent.y * stairPlacement.offsetFeet,
    };
    const nearStart = { x: center.x - tangent.x * stairPlacement.widthFeet / 2, y: center.y - tangent.y * stairPlacement.widthFeet / 2 };
    const nearEnd = { x: center.x + tangent.x * stairPlacement.widthFeet / 2, y: center.y + tangent.y * stairPlacement.widthFeet / 2 };
    const farStart = { x: nearStart.x + outward.x * stairPlacement.projectionFeet, y: nearStart.y + outward.y * stairPlacement.projectionFeet };
    const farEnd = { x: nearEnd.x + outward.x * stairPlacement.projectionFeet, y: nearEnd.y + outward.y * stairPlacement.projectionFeet };
    return {
      center,
      points: [nearStart, nearEnd, farEnd, farStart].map(toSvg),
      riseFeet: steadyGradeHeightAtPoint(center, outlineBounds, gradeHeights),
    };
  }, [gradeHeights, outline, outlineBounds, stairPlacement, stairsPresent, toSvg]);

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
      const suggestedOutline = [...body.outline];
      setOutline(suggestedOutline);
      if (stairsPresent) {
        setStairPlacement(nearestDeckStairPlacement(
          suggestedOutline,
          { x: length / 2, y: width },
          stairPlacement?.widthFeet ?? geometry.stairWidthFeet ?? 4,
          stairPlacement?.projectionFeet ?? 3,
        ));
      }
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

  useEffect(() => {
    if (!stairsPresent || !stairPlacement || stairPlacement.edgeIndex >= outline.length) return;
    const start = outline[stairPlacement.edgeIndex];
    const end = outline[(stairPlacement.edgeIndex + 1) % outline.length];
    const edgeSize = edgeLength(start, end);
    if (edgeSize < stairPlacement.widthFeet) {
      const replacement = nearestDeckStairPlacement(
        outline,
        { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        stairPlacement.widthFeet,
        stairPlacement.projectionFeet,
      );
      if (replacement) setStairPlacement(replacement);
      return;
    }
    const offsetFeet = Math.max(
      stairPlacement.widthFeet / 2,
      Math.min(edgeSize - stairPlacement.widthFeet / 2, stairPlacement.offsetFeet),
    );
    if (Math.abs(offsetFeet - stairPlacement.offsetFeet) > 0.0001)
      setStairPlacement((current) => current ? { ...current, offsetFeet: Number(offsetFeet.toFixed(3)) } : current);
  }, [outline, stairPlacement, stairsPresent]);

  function clientPoint(event: Pick<ReactPointerEvent<SVGElement>, "clientX" | "clientY">) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const drawingX = ((event.clientX - bounds.left) / bounds.width) * 320;
    const drawingY = ((event.clientY - bounds.top) / bounds.height) * 210;
    return {
      x: Math.max(-50, Math.min(200, (drawingX - drawingOriginX) / drawingScale)),
      y: Math.max(-50, Math.min(200, (drawingY - drawingOriginY) / drawingScale)),
    };
  }

  function moveWholeEdge(edgeIndex: number, requestedDelta: number) {
    setOutline((current) => [...moveDeckOutlineEdge(current, edgeIndex, requestedDelta, snapMode === "smart")]);
  }

  function moveWall(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = edgeDragRef.current;
    if (dragEdgeIndex === null || !drag || addPointMode) return false;
    const candidate = clientPoint(event);
    if (!candidate) return true;
    const start = drag.startOutline[drag.edgeIndex];
    const end = drag.startOutline[(drag.edgeIndex + 1) % drag.startOutline.length];
    const edgeDx = end.x - start.x;
    const edgeDy = end.y - start.y;
    const edgeSize = Math.hypot(edgeDx, edgeDy);
    if (edgeSize < 0.25) return true;
    const normal = { x: -edgeDy / edgeSize, y: edgeDx / edgeSize };
    const requestedDelta =
      (candidate.x - drag.startPointer.x) * normal.x +
      (candidate.y - drag.startPointer.y) * normal.y;
    setOutline([...moveDeckOutlineEdge(drag.startOutline, drag.edgeIndex, requestedDelta, snapMode === "smart")]);
    return true;
  }

  function movePoint(event: ReactPointerEvent<SVGSVGElement>) {
    if (draggingStairs && stairsPresent && stairPlacement) {
      const candidate = clientPoint(event);
      if (!candidate) return;
      const next = nearestDeckStairPlacement(outline, candidate, stairPlacement.widthFeet, stairPlacement.projectionFeet);
      if (next) setStairPlacement(next);
      return;
    }
    if (moveWall(event)) return;
    if (dragIndex === null || addPointMode) return;
    const candidate = clientPoint(event);
    if (!candidate) return;
    setOutline((current) => {
      const nextPoint = snapMode === "smart"
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
    const next = insertOutlinePointOnNearestEdge(outline, candidate, snapMode === "smart" ? 6 : 1);
    if (next === outline) {
      setFeedback("Tap closer to an outside edge to add a corner.");
      return;
    }
    setOutline([...next]);
    setFeedback(`Corner added. ${snapMode === "smart" ? "Move it freely; it will snap only when it gets close to the grid or a 45°/90° line." : "Snap is off."}`);
  }

  function beginCanvasInteraction(event: ReactPointerEvent<SVGSVGElement>) {
    if (perimeterPoints) {
      const candidate = clientPoint(event);
      if (!candidate) return;
      const first = perimeterPoints[0];
      if (perimeterPoints.length >= 3 && Math.hypot(candidate.x - first.x, candidate.y - first.y) <= 24 / drawingScale) {
        if (!isValidDeckOutline(perimeterPoints)) {
          setFeedback("That perimeter crosses or collapses. Undo the last corner and try again.");
          return;
        }
        const completed = perimeterPoints.map((point) => ({ ...point }));
        setOutline(completed);
        setPerimeterPoints(null);
        setMeasurementStep(0);
        setSelectedEdge(0);
        setEdgeDraft(edgeLength(completed[0], completed[1]).toFixed(2));
        setFeedback("Perimeter closed. Now enter each wall measurement in order.");
        return;
      }
      if (perimeterPoints.length >= 24) {
        setFeedback("This outline already has the maximum of 24 corners.");
        return;
      }
      const previous = perimeterPoints[perimeterPoints.length - 1];
      const dx = candidate.x - previous.x;
      const dy = candidate.y - previous.y;
      if (Math.hypot(dx, dy) < 0.5) {
        setFeedback("Move at least 6 inches from the previous corner.");
        return;
      }
      const rawAngle = Math.atan2(dy, dx);
      const angleStep = Math.PI / 4;
      const snappedAngle = Math.round(rawAngle / angleStep) * angleStep;
      const angleDifference = Math.abs(Math.atan2(Math.sin(rawAngle - snappedAngle), Math.cos(rawAngle - snappedAngle)));
      const distance = Math.hypot(dx, dy);
      const next = angleDifference <= (12 * Math.PI) / 180
        ? { x: previous.x + Math.cos(snappedAngle) * distance, y: previous.y + Math.sin(snappedAngle) * distance }
        : candidate;
      const bounded = {
        x: Number(Math.max(0, Math.min(200, next.x)).toFixed(3)),
        y: Number(Math.max(0, Math.min(200, next.y)).toFixed(3)),
      };
      setPerimeterPoints((current) => current ? [...current, bounded] : current);
      setFeedback(`Corner ${perimeterPoints.length + 1} added. Keep walking around the outside, or tap the green starting point to close the deck.`);
      return;
    }
    if (addPointMode) {
      addPoint(event);
      return;
    }
    if (!advancedEditing) return;
    const candidate = clientPoint(event);
    if (!candidate) return;
    const nearest = outline
      .map((point, index) => ({ index, distance: Math.hypot(point.x - candidate.x, point.y - candidate.y) }))
      .sort((first, second) => first.distance - second.distance)[0];
    if (!nearest || nearest.distance > 24 / drawingScale) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    edgeDragRef.current = null;
    setDragEdgeIndex(null);
    setDragIndex(nearest.index);
    setFeedback(`Moving corner ${nearest.index + 1}. The nearest corner was selected.`);
  }

  function edgeName(index: number) {
    if (outline.length === 4) return ["House wall", "Right side", "Yard side", "Left side"][index] ?? `Wall ${index + 1}`;
    return `Wall ${String.fromCharCode(65 + index)}`;
  }

  function selectExactEdge(index: number) {
    setSelectedEdge(index);
    setEdgeDraft(edgeLength(outline[index], outline[(index + 1) % outline.length]).toFixed(2));
    setFeedback(`${edgeName(index)} selected. Enter its exact length below the drawing.`);
  }

  function startPerimeterWalk() {
    setPerimeterPoints([{ x: 0, y: 0 }]);
    setMeasurementStep(null);
    setSelectedEdge(null);
    setAdvancedEditing(false);
    setFeedback("Starting at the left house corner. Walk clockwise and tap every outside corner. Tap the green starting point when you get back to the house.");
  }

  function useStartingOutline() {
    setPerimeterPoints(null);
    setMeasurementStep(0);
    selectExactEdge(0);
    setFeedback("Starting outline selected. Enter each wall measurement in order.");
  }

  function updateGradeHeight(key: keyof DeckGradeHeights, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 50) return;
    setGradeHeights((current) => ({ ...current, [key]: value }));
  }

  function applyEdgeLength() {
    if (selectedEdge === null) return;
    const value = Number(edgeDraft);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      setFeedback("Enter an edge length greater than 0 and no more than 100 feet.");
      return;
    }
    const current = outline;

    if (measurementStep === null) {
      const start = current[selectedEdge];
      const endIndex = (selectedEdge + 1) % current.length;
      const end = current[endIndex];
      const currentLength = edgeLength(start, end);
      if (!currentLength) return;
      const nextEnd = {
        x: start.x + ((end.x - start.x) / currentLength) * value,
        y: start.y + ((end.y - start.y) / currentLength) * value,
      };
      const next = current.map((point, index) => index === endIndex ? nextEnd : point);
      if (!isValidDeckOutline(next)) {
        setFeedback("That measurement would cross or collapse the outline.");
        return;
      }
      setOutline(next);
      setFeedback(`${edgeName(selectedEdge)} updated to ${value} feet.`);
      return;
    }

    const start = current[selectedEdge];
    const endIndex = (selectedEdge + 1) % current.length;
    const end = current[endIndex];
    const currentLength = edgeLength(start, end);
    if (!currentLength) return;
    let next: DeckOutlinePoint[];

    if (selectedEdge === current.length - 1) {
      const resolved = closeDeckOutlineWithMeasuredWall(current, value);
      if (!resolved) {
        setFeedback("Those wall lengths cannot meet at the house corner. Recheck the last two measurements or adjust the rough corner direction.");
        return;
      }
      next = [...resolved];
    } else {
      const nextPoint = {
        x: start.x + ((end.x - start.x) / currentLength) * value,
        y: start.y + ((end.y - start.y) / currentLength) * value,
      };
      next = current.map((point, index) => index === endIndex ? nextPoint : point);
    }
    if (!isValidDeckOutline(next)) {
      setFeedback("That measurement would cross or collapse the outline. Check the previous wall direction.");
      return;
    }
    setOutline(next);
    const nextStep = measurementStep === null ? null : measurementStep + 1;
    if (nextStep !== null && nextStep < next.length) {
      setMeasurementStep(nextStep);
      setSelectedEdge(nextStep);
      setEdgeDraft(edgeLength(next[nextStep], next[(nextStep + 1) % next.length]).toFixed(2));
      setFeedback(`${edgeName(selectedEdge)} saved at ${value} feet. Measure wall ${nextStep + 1} next.`);
    } else {
      setMeasurementStep(null);
      setSelectedEdge(null);
      setEdgeDraft("");
      setFeedback("All wall measurements are entered. Review the shape and stairs, then save it.");
    }
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
          stairPlacement: stairsPresent ? stairPlacement : null,
          gradeHeights,
        }),
      });
      const body = await response.json() as {
        success?: boolean;
        error?: string;
        shapeRevisionId?: string;
        shapeRevision?: number;
        outline?: DeckOutlinePoint[];
        stairPlacement?: DeckStairPlacement | null;
        gradeHeights?: DeckGradeHeights;
      };
      if (!response.ok || !body.success || !body.shapeRevisionId || !Number.isSafeInteger(body.shapeRevision))
        throw new Error(body.error || "The Deck shape could not be saved.");
      const saved: FinalizedDeckShape = {
        id: body.shapeRevisionId,
        shapeRevision: body.shapeRevision!,
        projectKind,
        outline: body.outline ?? outline,
        stairsPresent,
        stairPlacement: body.stairPlacement ?? (stairsPresent ? stairPlacement : null),
        gradeHeights: body.gradeHeights ?? gradeHeights,
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
        <button type="button" aria-pressed={projectKind === "new_construction"} className={projectKind === "new_construction" ? primary : secondary} onClick={() => {
          setProjectKind("new_construction");
          setOutline(initialOutline);
          setStairPlacement(nearestDeckStairPlacement(initialOutline, { x: length / 2, y: width }, geometry.stairWidthFeet ?? 4, 3));
          setFeedback("New construction starts from the field-entered dimensions. Existing photos remain site context only.");
        }}>New deck</button>
      </div>
    </fieldset>

    {projectKind === "replacement" && !initialShape ? <div className="mt-3 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950">
      <p className="font-black">Photo-assisted starting shape</p>
      <p className="mt-1 leading-6">AI may suggest the general existing footprint from saved photos. It never supplies exact dimensions or structural decisions.</p>
      <button type="button" className={`mt-2 w-full ${secondary}`} disabled={suggesting} onClick={() => void loadPhotoSuggestion()}>{suggesting ? "Reviewing saved photos…" : "Try the saved photos again"}</button>
    </div> : null}

    <div className="mt-4 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-4">
      <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-800">Simple perimeter walk</p>
      <h3 className="mt-1 text-xl font-black text-slate-950">Start at the left house corner</h3>
      <p className="mt-2 text-sm leading-6 text-slate-800">Walk clockwise. Tap each corner roughly, then tap the green starting point when you return to the house. The app will ask for every exact wall measurement next.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" className={primary} onClick={startPerimeterWalk}>Draw perimeter from the house</button>
        <button type="button" className={secondary} onClick={useStartingOutline}>Use this starting outline</button>
      </div>
      {perimeterPoints ? <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm font-bold text-slate-900">
        <span>{perimeterPoints.length === 1 ? "Starting point placed" : `${perimeterPoints.length} corners placed`}</span>
        <button type="button" className="min-h-11 rounded-lg border-2 border-slate-400 px-3 font-black" disabled={perimeterPoints.length <= 1} onClick={() => {
          setPerimeterPoints((current) => current && current.length > 1 ? current.slice(0, -1) : current);
          setFeedback("Last corner removed.");
        }}>Undo corner</button>
      </div> : null}
    </div>

    <div className="mt-4 rounded-xl border-2 border-slate-900 bg-slate-950 p-2">
      <svg
        ref={svgRef}
        viewBox="0 0 320 210"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        className="block w-full touch-none rounded-lg bg-white"
        onPointerMove={movePoint}
        onPointerUp={() => { setDragIndex(null); setDragEdgeIndex(null); setDraggingStairs(false); edgeDragRef.current = null; }}
        onPointerCancel={() => { setDragIndex(null); setDragEdgeIndex(null); setDraggingStairs(false); edgeDragRef.current = null; }}
        onPointerDown={beginCanvasInteraction}
      >
        <title id={titleId}>Editable bird&apos;s-eye deck outline</title>
        <desc id={descriptionId}>A top view of the proposed deck footprint with a six-inch grid, nearest-corner dragging, whole-wall sliders, editable measured walls, movable stairs, and four grade-height indicators.</desc>
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
        {perimeterPoints
          ? <polyline points={polygon} fill="none" stroke="#0f172a" strokeWidth="3" strokeDasharray="7 4" />
          : <polygon points={polygon} fill="#bfdbfe" fillOpacity="0.58" stroke="#0f172a" strokeWidth="3" />}
        {!perimeterPoints ? outline.map((point, index) => {
          const start = points[index];
          const end = points[(index + 1) % points.length];
          const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          const svgEdgeSize = Math.hypot(end.x - start.x, end.y - start.y) || 1;
          const normal = { x: -(end.y - start.y) / svgEdgeSize, y: (end.x - start.x) / svgEdgeSize };
          const slider = { x: midpoint.x + normal.x * 10, y: midpoint.y + normal.y * 10 };
          return <g key={`edge-${index}`}>
            <g
              role="button"
              tabIndex={0}
              aria-label={`Edit ${edgeName(index)}, currently ${edgeLength(point, outline[(index + 1) % outline.length]).toFixed(1)} feet`}
              onPointerDown={(event) => { event.stopPropagation(); selectExactEdge(index); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectExactEdge(index); } }}
            >
              <rect x={midpoint.x - 34} y={midpoint.y - 18} width="68" height="18" rx="5" fill={selectedEdge === index ? "#dcfce7" : "white"} stroke={selectedEdge === index ? "#047857" : "#0f172a"} strokeWidth={selectedEdge === index ? "2.5" : "1.5"} />
              <text x={midpoint.x} y={midpoint.y - 10} textAnchor="middle" fontSize="7" fontWeight="800" fill="#334155">{edgeName(index)}</text>
              <text x={midpoint.x} y={midpoint.y - 3} textAnchor="middle" fontSize="8" fontWeight="950" fill="#020617">{edgeLength(point, outline[(index + 1) % outline.length]).toFixed(1)} ft · tap</text>
            </g>
            {advancedEditing ? <circle
              cx={slider.x}
              cy={slider.y}
              r="24"
              fill="transparent"
              role="slider"
              tabIndex={0}
              aria-label={`Move wall ${index + 1}; both corners move together`}
              onPointerDown={(event) => {
                if (addPointMode) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragIndex(null);
                setDragEdgeIndex(index);
                const startPointer = clientPoint(event);
                if (!startPointer) return;
                edgeDragRef.current = { edgeIndex: index, startPointer, startOutline: outline.map((point) => ({ ...point })) };
                setFeedback(`Moving wall ${index + 1}. Both corner points stay together.`);
              }}
              onKeyDown={(event) => {
                if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
                event.preventDefault();
                const desired = event.key === "ArrowUp" ? { x: 0, y: -0.5 }
                  : event.key === "ArrowDown" ? { x: 0, y: 0.5 }
                    : event.key === "ArrowLeft" ? { x: -0.5, y: 0 }
                      : { x: 0.5, y: 0 };
                moveWholeEdge(index, desired.x * normal.x + desired.y * normal.y);
                setFeedback(`Wall ${index + 1} moved 6 inches. Both corner points stayed together.`);
              }}
            /> : null}
            {advancedEditing ? <line
              x1={slider.x - normal.x * 5}
              y1={slider.y - normal.y * 5}
              x2={slider.x + normal.x * 5}
              y2={slider.y + normal.y * 5}
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
              pointerEvents="none"
            /> : null}
          </g>;
        }) : null}
        {points.map((point, index) => <g key={`point-${index}`} pointerEvents="none">
          <circle cx={point.x} cy={point.y} r={perimeterPoints && index === 0 ? 8 : 6} fill="white" stroke="#0f172a" strokeWidth="1.5" />
          <circle cx={point.x} cy={point.y} r={perimeterPoints && index === 0 ? 5 : 3} fill={perimeterPoints && index === 0 ? "#16a34a" : "#f97316"} stroke={perimeterPoints && index === 0 ? "#14532d" : "#7c2d12"} strokeWidth="1" />
          {perimeterPoints ? <text x={point.x} y={point.y - 9} textAnchor="middle" fontSize="7" fontWeight="950" fill="#020617" stroke="white" strokeWidth="3" paintOrder="stroke">{index === 0 ? "START" : index + 1}</text> : null}
        </g>)}
        {!perimeterPoints && stairGeometry ? <g
          aria-label={`Movable stairs; estimated height ${stairGeometry.riseFeet.toFixed(1)} feet`}
          role="slider"
          tabIndex={0}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraggingStairs(true);
            setDragIndex(null);
            setDragEdgeIndex(null);
            setFeedback("Moving stairs. Drag them to any outside deck wall.");
          }}
        >
          <polygon points={stairGeometry.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="#fde68a" stroke="#78350f" strokeWidth="3" />
          <text x={toSvg(stairGeometry.center).x} y={toSvg(stairGeometry.center).y + 4} textAnchor="middle" fontSize="8" fontWeight="950" fill="#451a03">STAIRS · {stairGeometry.riseFeet.toFixed(1)} ft</text>
        </g> : null}
        {!perimeterPoints ? ([
          ["HL", { x: outlineBounds.minX, y: outlineBounds.minY }, gradeHeights.houseLeftFeet],
          ["HR", { x: outlineBounds.maxX, y: outlineBounds.minY }, gradeHeights.houseRightFeet],
          ["YL", { x: outlineBounds.minX, y: outlineBounds.maxY }, gradeHeights.yardLeftFeet],
          ["YR", { x: outlineBounds.maxX, y: outlineBounds.maxY }, gradeHeights.yardRightFeet],
        ] as const).map(([label, point, height]) => {
          const base = toSvg(point);
          const marker = {
            x: base.x + (label.endsWith("L") ? -11 : 11),
            y: base.y + (label.startsWith("H") ? -11 : 11),
          };
          return <g key={`height-${label}`} pointerEvents="none">
            <circle cx={marker.x} cy={marker.y} r="8" fill="#0f172a" stroke="white" strokeWidth="2" />
            <text x={marker.x} y={marker.y + 2.5} textAnchor="middle" fontSize="5.5" fontWeight="950" fill="white">{label}</text>
            <text x={marker.x} y={marker.y + (label.startsWith("H") ? -11 : 16)} textAnchor="middle" fontSize="7" fontWeight="950" fill="#020617" stroke="white" strokeWidth="3" paintOrder="stroke">{height.toFixed(1)} ft</text>
          </g>;
        }) : null}
      </svg>
    </div>

    <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm font-bold text-blue-950">{perimeterPoints ? "Tap the next outside corner. When you return to the house, tap the green START point to close the shape." : "Tap any wall label to edit that exact measurement."}</p>

    {measurementStep !== null && selectedEdge !== null ? <div className="mt-3 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-4">
      <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-800">Wall {measurementStep + 1} of {outline.length}</p>
      <h3 className="mt-1 text-lg font-black text-slate-950">Measure {edgeName(selectedEdge)}</h3>
      <p className="mt-1 text-sm text-slate-700">Enter the real tape measurement for the highlighted segment.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="text-sm font-bold text-slate-950">Exact length (ft)<input autoFocus className="mt-1 min-h-12 w-full rounded-lg border-2 border-emerald-700 bg-white px-3 text-lg font-black" inputMode="decimal" value={edgeDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEdgeDraft(event.target.value)} /></label>
        <button type="button" className={`${primary} self-end`} onClick={applyEdgeLength}>{measurementStep + 1 === outline.length ? "Save final wall" : "Save and measure next wall"}</button>
      </div>
    </div> : null}

    <details className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3" open={advancedEditing} onToggle={(event) => setAdvancedEditing(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Optional fine adjustments</summary>
    <fieldset className="mt-2 rounded-lg border border-slate-300 bg-white p-3">
      <legend className="px-1 text-sm font-black text-slate-950">Corner movement</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={snapMode === "smart" ? primary : secondary} aria-pressed={snapMode === "smart"} onClick={() => { setSnapMode("smart"); setFeedback("Smart snap is on. Drag freely; it catches only when you are close to the grid or a 45°/90° line."); }}>Smart snap</button>
        <button type="button" className={snapMode === "free" ? primary : secondary} aria-pressed={snapMode === "free"} onClick={() => { setSnapMode("free"); setFeedback("Snap is off. Corners move freely in one-inch increments."); }}>Snap off</button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-700">Smart snap is the default. Move anywhere; the corner becomes magnetic only near a grid line or a straight, 45°, or 90° angle.</p>
    </fieldset>

    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" className={addPointMode ? primary : secondary} aria-pressed={addPointMode} onClick={() => { setAddPointMode((current) => !current); setFeedback(addPointMode ? "Corner adding turned off." : "Tap an outside edge to add a bump-in or bump-out corner."); }}>{addPointMode ? "Done adding points" : "Add a corner"}</button>
      <button type="button" className={secondary} onClick={() => {
        setOutline(initialOutline);
        setStairPlacement(nearestDeckStairPlacement(initialOutline, { x: length / 2, y: width }, geometry.stairWidthFeet ?? 4, 3));
        setSelectedEdge(null);
        setFeedback("Starting rectangle restored from field measurements.");
      }}>Reset outline</button>
    </div>

    <details open={selectedEdge !== null} className="mt-3 rounded-lg border-2 border-blue-400 bg-blue-50 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Edit an exact wall measurement</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-bold text-slate-900">Wall<select className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" value={selectedEdge ?? ""} onChange={(event) => {
          if (!event.target.value) { setSelectedEdge(null); setEdgeDraft(""); return; }
          selectExactEdge(Number(event.target.value));
        }}><option value="">Tap a wall above or choose one</option>{outline.map((_, index) => <option key={index} value={index}>{edgeName(index)}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-900">Exact wall length (ft)<input className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" inputMode="decimal" value={edgeDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEdgeDraft(event.target.value)} /></label>
        <button type="button" className={`${primary} self-end`} disabled={selectedEdge === null} onClick={applyEdgeLength}>Apply</button>
      </div>
    </details>
    </details>

    <fieldset className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <legend className="px-1 text-sm font-black text-slate-950">Does this deck have stairs?</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={stairsPresent === true ? primary : secondary} aria-pressed={stairsPresent === true} onClick={() => {
          setStairsPresent(true);
          if (!stairPlacement) setStairPlacement(nearestDeckStairPlacement(outline, { x: length / 2, y: width }, geometry.stairWidthFeet ?? 4, 3));
        }}>Yes, stairs</button>
        <button type="button" className={stairsPresent === false ? primary : secondary} aria-pressed={stairsPresent === false} onClick={() => setStairsPresent(false)}>No stairs</button>
      </div>
      {stairsPresent && stairPlacement ? <div className="mt-3 grid gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 sm:grid-cols-3">
        <label className="text-sm font-bold text-slate-950">Stair wall<select className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" value={stairPlacement.edgeIndex} onChange={(event) => {
          const edgeIndex = Number(event.target.value);
          const candidate = nearestDeckStairPlacement(outline, {
            x: (outline[edgeIndex].x + outline[(edgeIndex + 1) % outline.length].x) / 2,
            y: (outline[edgeIndex].y + outline[(edgeIndex + 1) % outline.length].y) / 2,
          }, stairPlacement.widthFeet, stairPlacement.projectionFeet);
          if (candidate) setStairPlacement(candidate);
        }}>{outline.map((_, index) => <option key={index} value={index}>{edgeName(index)}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-950">Stair width (ft)<input className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" inputMode="decimal" value={stairPlacement.widthFeet} onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
          const widthFeet = Number(event.target.value);
          if (!Number.isFinite(widthFeet) || widthFeet < 2 || widthFeet > 12) return;
          const candidate = nearestDeckStairPlacement(outline, stairGeometry?.center ?? outline[0], widthFeet, stairPlacement.projectionFeet);
          if (candidate) setStairPlacement(candidate);
        }} /></label>
        <label className="text-sm font-bold text-slate-950">Distance from wall start (ft)<input className="mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3" inputMode="decimal" value={stairPlacement.offsetFeet} onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
          const offsetFeet = Number(event.target.value);
          if (!Number.isFinite(offsetFeet)) return;
          const start = outline[stairPlacement.edgeIndex];
          const end = outline[(stairPlacement.edgeIndex + 1) % outline.length];
          const edgeSize = edgeLength(start, end);
          setStairPlacement((current) => current ? { ...current, offsetFeet: Math.max(current.widthFeet / 2, Math.min(edgeSize - current.widthFeet / 2, offsetFeet)) } : current);
        }} /></label>
        <p className="sm:col-span-3 text-sm font-bold text-amber-950">Drag the stair box on the drawing or enter its wall, width, and position here. Estimated stair height: {stairGeometry?.riseFeet.toFixed(2) ?? "—"} ft.</p>
      </div> : null}
    </fieldset>

    <fieldset className="mt-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3">
      <legend className="px-1 text-sm font-black text-emerald-950">Deck height above grade</legend>
      <p className="mt-1 text-sm leading-6 text-emerald-950">Enter the four deck-to-ground heights. The drawing assumes one steady grade plane between them and estimates the stair height at its location.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {([
          ["houseLeftFeet", "House · left"],
          ["houseRightFeet", "House · right"],
          ["yardLeftFeet", "Off house · left"],
          ["yardRightFeet", "Off house · right"],
        ] as const).map(([key, label]) => <label key={key} className="text-sm font-bold text-slate-950">{label} (ft)<input className="mt-1 min-h-12 w-full rounded-lg border-2 border-emerald-700 bg-white px-3 text-base font-black" inputMode="decimal" value={gradeHeights[key]} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateGradeHeight(key, event.target.value)} /></label>)}
      </div>
      <p className="mt-3 rounded-lg bg-white p-3 text-xs font-bold leading-5 text-slate-800">Estimating assumption only: the ground is treated as a steady plane between HL, HR, YL, and YR. Confirm unusual dips, humps, or landings separately.</p>
    </fieldset>

    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
      <div className="rounded-lg bg-slate-100 p-2"><strong className="block text-slate-950">{outline.length}</strong><span className="text-slate-600">corners</span></div>
      <div className="rounded-lg bg-slate-100 p-2"><strong className="block text-slate-950">{shapeArea(outline).toFixed(0)} sq ft</strong><span className="text-slate-600">shape area</span></div>
      <div className="rounded-lg bg-slate-100 p-2"><strong className="block text-slate-950">{stairsPresent === null ? "Choose" : stairsPresent ? "Yes" : "No"}</strong><span className="text-slate-600">stairs</span></div>
    </div>
    <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-bold text-blue-950">{feedback}</p>
    <button type="button" className={`mt-4 w-full ${primary}`} disabled={disabled || saving || !isValidDeckOutline(outline) || stairsPresent === null || (stairsPresent && !stairGeometry)} onClick={() => void approveShape()}>{saving ? "Saving approved shape…" : "Save this shape — continue to structure"}</button>
  </section>;
}
