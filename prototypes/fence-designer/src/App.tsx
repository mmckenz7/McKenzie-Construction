"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createHistory, pushHistory, redo, undo, type History } from "./history";
import { calibrateBackgroundTransform, fittedBackgroundTransform, moveBackgroundTransform, rotateBackgroundTransform, straightenBackgroundFromHouseCorners, type PlanPosition, type ReferenceBackground } from "./background";
import {
  EMPTY_DESIGN, addPoint, closestPointOnHouseEdge, deletePoint, feetAndInchesToMm, fenceLineCount, fencePathForPoint, formatFeetInches, gateOffsetFromReferenceMm, insertGateOnSegment, isPointAttached, isPointOnHouseEdge, movePoint, movePointWithLockedFollowing,
  pointById, pointRole, removeHouseReference, segmentLengthMm, setGateType, setHouseReference, setHouseReferenceAt, setSegmentKind, setSegmentLengthKeepingEndMm, setSegmentLengthMm, snapPlanPosition, snapRunEndpoint, snapToFenceRun, snapToHouseEdge, solvePathBetweenFixedEndsMm, startFenceLine, totalLengthMm,
  type FenceDesign, type GateReferencePost, type GateType,
} from "./model";
import { acquireBestGps, formatGpsAccuracy, gpsOriginAt, projectGpsFix, projectGpsLeg, type GpsFix, type GpsOrigin } from "./gps";
import { propertyReferenceLinks, type PropertyReferenceLinks } from "./property-reference";
import { captureReferenceDisplay, rasterizeReferenceBlob, readReferenceImageFromClipboard, referenceImageErrorMessage, type RasterizedReferenceImage } from "./reference-image";
import { parseRunCommand, quickGateTarget, runEndpoint, type ParsedRunCommand } from "./run-command";
import { loadLocalDesign, loadLocalReference, saveLocalDesign, saveLocalReference } from "./storage";
import { calculateBlackAluminumTakeoff, calculateTreatedPinePrivacyTakeoff, formatBlackAluminumTakeoffText, formatTreatedPinePrivacyTakeoffText, takeoffPostReasonLabel, type TakeoffPostReason } from "./takeoff";
import { panView, placeDimensionLabels, zoomViewAt, type ViewBox } from "./view";

type Selection = Readonly<{ type: "point" | "segment"; id: string } | { type: "house" }> | null;
type Drag = Readonly<{ pointId: string; original: FenceDesign }> | null;
type Mode = "draw" | "select" | "pan" | "close" | "new-line" | "calibrate" | "trace-house";
type ReferenceProvider = keyof PropertyReferenceLinks;
type TakeoffMaterial = "black-aluminum" | "treated-pine-privacy";
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
  const [gateOffsetFeet, setGateOffsetFeet] = useState("0");
  const [gateOffsetInches, setGateOffsetInches] = useState("0");
  const [gateReferencePost, setGateReferencePost] = useState<GateReferencePost>("post-a");
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [lengthLockEnabled, setLengthLockEnabled] = useState(true);
  const [previewPoint, setPreviewPoint] = useState<Readonly<{ xMm: number; yMm: number }> | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [closurePathPointId, setClosurePathPointId] = useState<string | null>(null);
  const [siteWalkActive, setSiteWalkActive] = useState(false);
  const [gpsOrigin, setGpsOrigin] = useState<GpsOrigin | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsSecondsRemaining, setGpsSecondsRemaining] = useState<number | null>(null);
  const [nextGpsStartsLine, setNextGpsStartsLine] = useState(false);
  const [lastWalkSegmentId, setLastWalkSegmentId] = useState<string | null>(null);
  const [walkFeet, setWalkFeet] = useState("");
  const [walkInches, setWalkInches] = useState("0");
  const [walkLengthConfirmed, setWalkLengthConfirmed] = useState(true);
  const [commandDockOpen, setCommandDockOpen] = useState(false);
  const [commandInput, setCommandInput] = useState("");
  const [commandLog, setCommandLog] = useState<readonly string[]>([]);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [takeoffPanelOpen, setTakeoffPanelOpen] = useState(false);
  const [takeoffViewEnabled, setTakeoffViewEnabled] = useState(false);
  const [takeoffMaterial, setTakeoffMaterial] = useState<TakeoffMaterial>("black-aluminum");
  const [takeoffConfirmedRevision, setTakeoffConfirmedRevision] = useState<number | null>(null);
  const [kgisAddress, setKgisAddress] = useState("");
  const [referenceBackground, setReferenceBackground] = useState<ReferenceBackground | null>(null);
  const [referenceBusy, setReferenceBusy] = useState<"capture" | "paste" | "upload" | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<readonly PlanPosition[]>([]);
  const [houseTracePoints, setHouseTracePoints] = useState<readonly PlanPosition[]>([]);
  const [calibrationFeet, setCalibrationFeet] = useState("");
  const [calibrationInches, setCalibrationInches] = useState("0");
  const [layers, setLayers] = useState({ reference: true, grid: true, house: true, dimensions: true });
  const [dimensionSideOverrides, setDimensionSideOverrides] = useState<Readonly<Record<string, 1 | -1>>>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const gpsRequestId = useRef(0);
  const lastGpsFix = useRef<GpsFix | null>(null);
  const gpsAbortController = useRef<AbortController | null>(null);
  const activePointers = useRef(new Map<number, PlanPointer>());
  const navigationGesture = useRef<NavigationGesture>(null);
  const navigationWasActive = useRef(false);
  const design = history.present;
  const takeoffReady = design.segments.length > 0 && takeoffConfirmedRevision === design.revision;
  const walkNeedsExactLength = siteWalkActive && snapEnabled && lastWalkSegmentId !== null && !walkLengthConfirmed;

  useEffect(() => () => gpsAbortController.current?.abort(), []);

  const selectedSegment = selection?.type === "segment" ? design.segments.find(({ id }) => id === selection.id) ?? null : null;
  const selectedGatePreviousFence = selectedSegment?.kind === "gate" ? design.segments.find(({ toPointId, kind }) => toPointId === selectedSegment.fromPointId && kind === "fence") ?? null : null;
  const selectedGateOffsetMm = selectedGatePreviousFence ? segmentLengthMm(design, selectedGatePreviousFence) : 0;
  const selectedPoint = selection?.type === "point" ? design.points.find(({ id }) => id === selection.id) ?? null : null;
  const selectedPointPath = selectedPoint ? fencePathForPoint(design, selectedPoint.id) : null;
  const openEndpoint = (point: Readonly<{ id: string }>) => !design.segments.some(({ fromPointId }) => fromPointId === point.id);
  const selectedOpenEndpoint = selectedPoint && openEndpoint(selectedPoint) ? selectedPoint : null;
  const latestOpenEndpoint = [...design.points].reverse().find(openEndpoint) ?? null;
  const extensionAnchor = selectedOpenEndpoint ?? latestOpenEndpoint;
  const incomingToAnchor = extensionAnchor ? design.segments.find(({ toPointId }) => toPointId === extensionAnchor.id) ?? null : null;
  const quickGateSegment = quickGateTarget(design, selectedSegment?.id ?? null, extensionAnchor?.id ?? null);
  const incomingBearing = incomingToAnchor && extensionAnchor
    ? (() => { const start = pointById(design, incomingToAnchor.fromPointId); return Math.atan2(extensionAnchor.yMm - start.yMm, extensionAnchor.xMm - start.xMm); })()
    : null;
  const commandPreview: Readonly<{ command: ParsedRunCommand; endpoint: Readonly<{ xMm: number; yMm: number }> }> | Readonly<{ error: string }> | null = (() => {
    if (!commandInput.trim() || !extensionAnchor) return null;
    try {
      const command = parseRunCommand(commandInput, incomingBearing);
      return Object.freeze({ command, endpoint: runEndpoint(extensionAnchor, command) });
    } catch (error) { return Object.freeze({ error: error instanceof Error ? error.message : "That run instruction was not understood." }); }
  })();
  const houseSelected = selection?.type === "house";
  const totals = useMemo(() => ({ all: totalLengthMm(design), gate: design.segments.filter(({ kind }) => kind === "gate").reduce((sum, item) => sum + segmentLengthMm(design, item), 0) }), [design]);
  const blackAluminumTakeoff = useMemo(() => calculateBlackAluminumTakeoff(design), [design]);
  const treatedPineTakeoff = useMemo(() => calculateTreatedPinePrivacyTakeoff(design), [design]);
  const activeTakeoffLayout = takeoffMaterial === "black-aluminum" ? blackAluminumTakeoff.layout : treatedPineTakeoff.layout;
  const takeoffPanelRuns = useMemo(() => {
    const runs = new Map<number, typeof activeTakeoffLayout.panels>();
    activeTakeoffLayout.panels.forEach((panel) => runs.set(panel.runIndex, Object.freeze([...(runs.get(panel.runIndex) ?? []), panel])));
    return [...runs.entries()].sort(([first], [second]) => first - second);
  }, [activeTakeoffLayout]);
  const takeoffPostDecisions = useMemo(() => {
    const counts = new Map<TakeoffPostReason, number>();
    activeTakeoffLayout.posts.forEach(({ reason }) => counts.set(reason, (counts.get(reason) ?? 0) + 1));
    return [...counts.entries()];
  }, [activeTakeoffLayout]);
  const activePath = extensionAnchor ? fencePathForPoint(design, extensionAnchor.id) : null;
  const liveRunLengthMm = mode === "draw" && previewPoint && extensionAnchor
    ? Math.round(Math.hypot(previewPoint.xMm - extensionAnchor.xMm, previewPoint.yMm - extensionAnchor.yMm))
    : null;
  const dimensionScale = view.width / DEFAULT_VIEW.width;
  const dimensionPositions = useMemo(() => new Map(placeDimensionLabels(design.segments.map((segment) => {
    const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
    const label = formatFeetInches(segmentLengthMm(design, segment));
    const text = segment.kind === "gate" ? `${segment.gateType === "double" ? "DOUBLE" : "SINGLE"} GATE · ${label}` : label;
    return { id: segment.id, start, end, widthMm: Math.max(1_520, text.length * 180) * dimensionScale, heightMm: 520 * dimensionScale, preferredSide: dimensionSideOverrides[segment.id], fixedSide: dimensionSideOverrides[segment.id] !== undefined };
  }), 700 * dimensionScale, 170 * dimensionScale, {
    bounds: view,
    boundsPaddingMm: 260 * dimensionScale,
    avoidSegments: design.segments.map((segment) => ({ id: segment.id, start: pointById(design, segment.fromPointId), end: pointById(design, segment.toPointId) })),
  }).map((placement) => [placement.id, placement.position])), [design, dimensionScale, dimensionSideOverrides, view]);

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
      gpsRequestId.current += 1;
      setDrag(null); setMode("select"); setSelection(null); setGateEditorOpen(false); setCommandDockOpen(false); setCommandInput(""); setPreviewPoint(null); setClosurePathPointId(null); setSiteWalkActive(false); setGpsBusy(false); setNextGpsStartsLine(false); setCalibrationPoints([]); setHouseTracePoints([]);
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
  const placementAt = (clientX: number, clientY: number, excludePointId?: string) => {
    const raw = toPlanRaw(clientX, clientY);
    const houseConnection = snapToHouseEdge(raw.xMm, raw.yMm, design.house);
    if (houseConnection) return { point: houseConnection, connection: "house" as const };
    const fenceConnection = snapToFenceRun(design, raw.xMm, raw.yMm, 460, excludePointId);
    if (fenceConnection) return { point: { xMm: fenceConnection.xMm, yMm: fenceConnection.yMm }, connection: "fence" as const };
    return { point: snapPlanPosition(raw.xMm, raw.yMm, snapEnabled, null, GRID_MM), connection: null };
  };
  const nextPointAt = (clientX: number, clientY: number) => {
    const anchor = extensionAnchor;
    const raw = toPlanRaw(clientX, clientY);
    const houseConnection = snapToHouseEdge(raw.xMm, raw.yMm, design.house);
    if (houseConnection) return houseConnection;
    const fenceConnection = snapToFenceRun(design, raw.xMm, raw.yMm, 460, anchor?.id);
    if (fenceConnection) return { xMm: fenceConnection.xMm, yMm: fenceConnection.yMm };
    const placement = { xMm: Math.round(raw.xMm), yMm: Math.round(raw.yMm) };
    if (!anchor || !snapEnabled) return placement;
    const activePoints = fencePathForPoint(design, anchor.id).points;
    const previous = activePoints.length > 1 ? activePoints.at(-2) : null;
    const referenceBearing = previous ? Math.atan2(anchor.yMm - previous.yMm, anchor.xMm - previous.xMm) : 0;
    return snapRunEndpoint(anchor, placement, true, 45, referenceBearing);
  };
  const calibrateAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!referenceBackground) { setMode("select"); setNotice("Upload a reference image before calibrating it."); return; }
    if (referenceBackground.locked) { setMode("select"); setNotice("Unlock the reference image before calibrating it."); return; }
    const point = toPlanRaw(event.clientX, event.clientY);
    if (calibrationPoints.length === 0) {
      setCalibrationPoints([point]); setNotice("First calibration point marked. Tap the second point on the same known distance."); return;
    }
    try {
      const knownDistanceMm = feetAndInchesToMm(Number(calibrationFeet), Number(calibrationInches));
      const transform = calibrateBackgroundTransform(referenceBackground.transform, calibrationPoints[0], point, knownDistanceMm);
      setReferenceBackground({ ...referenceBackground, transform });
      setCalibrationPoints([]); setMode("select"); setNotice(`Reference image calibrated to ${formatFeetInches(knownDistanceMm)}. Fence measurements were not changed.`);
    } catch (error) { setCalibrationPoints([]); setMode("select"); setNotice(error instanceof Error ? error.message : "The reference image could not be calibrated."); }
  };
  const traceHouseAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!referenceBackground || referenceBackground.locked) { setHouseTracePoints([]); setMode("select"); setNotice("Unlock a captured reference image before tracing the house."); return; }
    const points = [...houseTracePoints, toPlanRaw(event.clientX, event.clientY)];
    if (points.length < 4) {
      setHouseTracePoints(points);
      setNotice(points.length === 1 ? "First corner marked. Mark the adjacent corner along the wall that should become horizontal." : `House corner ${points.length} marked. Continue around the footprint.`);
      return;
    }
    try {
      const result = straightenBackgroundFromHouseCorners(referenceBackground.transform, points);
      const next = setHouseReferenceAt(design, result.house.xMm, result.house.yMm, result.house.lengthMm, result.house.widthMm);
      setReferenceBackground({ ...referenceBackground, transform: result.transform });
      commit(next, `House traced at ${formatFeetInches(result.house.lengthMm)} × ${formatFeetInches(result.house.widthMm)}. The reference and grid are now square to the first wall.`);
      setHouseFeet(String(Math.floor(Math.round(result.house.lengthMm / 25.4) / 12))); setHouseInches(String(Math.round(result.house.lengthMm / 25.4) % 12));
      setHouseWidthFeet(String(Math.floor(Math.round(result.house.widthMm / 25.4) / 12))); setHouseWidthInches(String(Math.round(result.house.widthMm / 25.4) % 12));
      setHouseTracePoints([]); setMode("select"); setSelection({ type: "house" }); setView(fittedView(next));
    } catch (error) { setHouseTracePoints([]); setMode("select"); setNotice(error instanceof Error ? error.message : "The house footprint could not be straightened."); }
  };
  const addAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === "trace-house") { traceHouseAt(event); return; }
    if (mode === "calibrate") { calibrateAt(event); return; }
    if (mode === "close") { closeAt(event); return; }
    if (mode === "new-line") {
      const point = placementAt(event.clientX, event.clientY).point;
      const id = nextId.current++;
      const next = startFenceLine(design, { id: `point-${id}`, ...point });
      commit(next, "Separate fence line started. Draw now continues from this new point.");
      setMode("draw"); setSelection({ type: "point", id: `point-${id}` }); setPreviewPoint(point);
      return;
    }
    if (mode !== "draw") return;
    const point = nextPointAt(event.clientX, event.clientY);
    const anchor = extensionAnchor;
    if (anchor && point.xMm === anchor.xMm && point.yMm === anchor.yMm) { setNotice("Choose a different location for the next fence point."); return; }
    const id = nextId.current++;
    const next = addPoint(design, { id: `point-${id}`, ...point }, `segment-${id}`, anchor?.id ?? null);
    commit(next, next.points.length === 1 ? "Start point placed. Add another point to create a measured span." : "Measured span added.");
    setSelection({ type: "point", id: `point-${id}` }); setPreviewPoint(point);
    if (commandDockOpen) window.setTimeout(() => setMode("select"), 250);
  };

  const applyRunCommand = () => {
    if (!extensionAnchor) {
      setMode("draw"); setSelection(null); setNotice("Tap the plan once to place the starting point, then enter the first precise run."); return;
    }
    if (!commandPreview || "error" in commandPreview) {
      setNotice(commandPreview && "error" in commandPreview ? commandPreview.error : "Describe the next run before applying it."); return;
    }
    try {
      const id = nextId.current++;
      const pointId = `point-${id}`;
      const next = addPoint(design, { id: pointId, ...commandPreview.endpoint }, `segment-${id}`, extensionAnchor.id);
      commit(next, `Precise run added: ${commandPreview.command.summary}.`);
      setCommandLog((current) => Object.freeze([...current.slice(-3), commandPreview.command.summary]));
      setCommandInput(""); setSelection({ type: "point", id: pointId }); setMode("select"); setPreviewPoint(null); setView(fittedView(next));
    } catch (error) { setNotice(error instanceof Error ? error.message : "The precise run could not be added."); }
  };
  const closeAt = (event: ReactPointerEvent<SVGElement>) => {
    if (mode !== "close") return;
    try {
      if (!design.house) throw new RangeError("Add the measured house footprint before closing the path.");
      const pathPointId = closurePathPointId ?? design.points.at(-1)?.id;
      if (!pathPointId) throw new RangeError("Draw a fence line before closing it.");
      const path = fencePathForPoint(design, pathPointId);
      if (path.segments.length < 2) throw new RangeError("Draw at least two measured runs before closing to the house.");
      if (!isPointOnHouseEdge(path.points[0], design.house)) throw new RangeError("The first point of this fence line must connect to the house. Move it onto a house edge, then try closure again.");
      const raw = toPlanRaw(event.clientX, event.clientY);
      const target = closestPointOnHouseEdge(design.house, raw.xMm, raw.yMm);
      const next = solvePathBetweenFixedEndsMm(design, target, undefined, pathPointId);
      commit(next, "Path closed to the house. Both connections and every measured run stayed fixed; the flexible angles were redistributed.");
      setMode("select"); setSelection({ type: "point", id: path.points.at(-1)!.id }); setPreviewPoint(null); setClosurePathPointId(null);
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
  const selectSegment = (id: string, selectedAt?: Readonly<{ xMm: number; yMm: number }>) => {
    const segment = design.segments.find((item) => item.id === id);
    if (!segment) return;
    const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
    const dx = end.xMm - start.xMm; const dy = end.yMm - start.yMm;
    const squaredLength = dx ** 2 + dy ** 2;
    const ratio = selectedAt && squaredLength > 0 ? ((selectedAt.xMm - start.xMm) * dx + (selectedAt.yMm - start.yMm) * dy) / squaredLength : 0.5;
    const runLength = segmentLengthMm(design, segment);
    const distanceFromPostA = runLength * Math.max(0, Math.min(1, ratio));
    const referencePost: GateReferencePost = distanceFromPostA <= runLength / 2 ? "post-a" : "post-b";
    const gateOffsetInchesFromReference = Math.round((referencePost === "post-a" ? distanceFromPostA : runLength - distanceFromPostA) / 25.4);
    setGateReferencePost(referencePost);
    setGateOffsetFeet(String(Math.floor(gateOffsetInchesFromReference / 12)));
    setGateOffsetInches(String(gateOffsetInchesFromReference % 12));
    const totalInches = Math.round(runLength / 25.4);
    setFeet(String(Math.floor(totalInches / 12)));
    setInches(String(totalInches % 12));
    setGateEditorOpen(false); setSelection({ type: "segment", id }); setMode("select"); setNotice("Span selected. Enter an exact length or edit its gate intent.");
  };
  const startDrag = (event: ReactPointerEvent, pointId: string) => {
    if (mode === "pan" || mode === "close" || mode === "draw" || mode === "new-line" || mode === "calibrate" || mode === "trace-house" || event.metaKey) return;
    event.stopPropagation();
    setGateEditorOpen(false); setSelection({ type: "point", id: pointId }); setMode("select"); setDrag({ pointId, original: design });
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
  };
  const dragPoint = (event: ReactPointerEvent) => {
    if (!drag) return;
    const placement = placementAt(event.clientX, event.clientY, drag.pointId);
    let location = placement.point;
    const path = fencePathForPoint(drag.original, drag.pointId);
    const pointIndex = path.points.findIndex(({ id }) => id === drag.pointId);
    if (lengthLockEnabled && snapEnabled && !placement.connection && pointIndex > 0) {
      const anchor = path.points[pointIndex - 1];
      const referenceStart = pointIndex > 1 ? path.points[pointIndex - 2] : null;
      const referenceBearing = referenceStart ? Math.atan2(anchor.yMm - referenceStart.yMm, anchor.xMm - referenceStart.xMm) : 0;
      location = snapRunEndpoint(anchor, location, true, 45, referenceBearing);
    }
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
      const result = editSegmentToExactLength(selectedSegment.id, feet, inches);
      commit(result.next, result.anchoredAtBothEnds
        ? `Span set to ${formatFeetInches(result.length)}. Both line connections and the other measured runs stayed fixed while the angles adjusted.`
        : result.endOnFixedConnection ? `Span set to ${formatFeetInches(result.length)} while its connection stayed fixed.` : `Span set to ${formatFeetInches(result.length)}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid length."); }
  };
  const addGate = () => {
    if (!selectedSegment || selectedSegment.kind !== "fence") return;
    try {
      const width = feetAndInchesToMm(Number(gateFeet), Number(gateInches));
      const runLength = segmentLengthMm(design, selectedSegment);
      const distanceFromReference = feetAndInchesToMm(Number(gateOffsetFeet), Number(gateOffsetInches));
      const offsetFromStart = gateOffsetFromReferenceMm(runLength, width, distanceFromReference, gateReferencePost);
      const id = nextId.current; const gateSegmentId = `segment-${id + 2}`;
      const next = insertGateOnSegment(design, selectedSegment.id, width, offsetFromStart, gateType, `point-${id}`, `point-${id + 1}`, gateSegmentId, `segment-${id + 3}`);
      nextId.current += 4;
      const gate = next.segments.find(({ id: segmentId }) => segmentId === gateSegmentId)
        ?? next.segments.find(({ kind, fromPointId, toPointId }) => kind === "gate" && (fromPointId === selectedSegment.fromPointId || toPointId === selectedSegment.toPointId));
      commit(next, `${gateType === "double" ? "Double" : "Single"} gate placed ${formatFeetInches(distanceFromReference)} from ${gateReferencePost === "post-a" ? "Post A" : "Post B"}. The fence line stayed straight.`);
      const totalInches = Math.round(width / 25.4);
      setFeet(String(Math.floor(totalInches / 12))); setInches(String(totalInches % 12));
      setGateFeet(""); setGateInches("0"); setGateEditorOpen(false); setSelection(gate ? { type: "segment", id: gate.id } : null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid total gate width."); }
  };
  const editSegmentToExactLength = (segmentId: string, exactFeet: string, exactInches: string) => {
    const segment = design.segments.find(({ id }) => id === segmentId);
    if (!segment) throw new TypeError("That measured run no longer exists.");
    const length = feetAndInchesToMm(Number(exactFeet), Number(exactInches));
    const end = pointById(design, segment.toPointId);
    const path = fencePathForPoint(design, segment.fromPointId);
    const endOnFixedConnection = isPointAttached(design, end.id);
    const anchoredAtBothEnds = path.points.length >= 2 && isPointAttached(design, path.points[0].id) && isPointAttached(design, path.points.at(-1)!.id);
    const next = anchoredAtBothEnds
      ? solvePathBetweenFixedEndsMm(design, path.points.at(-1)!, { segmentId, lengthMm: length })
      : endOnFixedConnection ? setSegmentLengthKeepingEndMm(design, segmentId, length, lengthLockEnabled) : setSegmentLengthMm(design, segmentId, length);
    return { next, length, anchoredAtBothEnds, endOnFixedConnection };
  };
  const cancelGpsLock = (message = "GPS lock canceled. Tap again when you are ready.") => {
    gpsRequestId.current += 1;
    gpsAbortController.current?.abort(); gpsAbortController.current = null;
    setGpsBusy(false); setGpsSecondsRemaining(null); setNotice(message);
  };
  const markGpsPoint = async () => {
    const requestId = ++gpsRequestId.current;
    const controller = new AbortController();
    gpsAbortController.current?.abort(); gpsAbortController.current = controller;
    setGpsBusy(true); setGpsSecondsRemaining(20); setNotice("Acquiring the best available GPS lock for up to 20 seconds… Tap Cancel GPS lock if Safari does not respond.");
    const countdown = window.setInterval(() => setGpsSecondsRemaining((remaining) => remaining === null ? null : Math.max(0, remaining - 1)), 1_000);
    const hardStop = window.setTimeout(() => controller.abort(), 22_000);
    try {
      const previousGpsFix = lastGpsFix.current;
      const fix = await acquireBestGps(navigator.geolocation, {
        previousFix: previousGpsFix,
        signal: controller.signal,
        onSample: (bestFix) => {
          if (requestId !== gpsRequestId.current) return;
          setGpsAccuracyMeters(bestFix.accuracyMeters);
          setNotice(`GPS lock improving… best reading ${formatGpsAccuracy(bestFix.accuracyMeters)}. Stand still with open sky; this will wait up to 20 seconds.`);
        },
      });
      if (requestId !== gpsRequestId.current) return;
      lastGpsFix.current = fix;
      setGpsAccuracyMeters(fix.accuracyMeters);
      if (!gpsOrigin) {
        const existingAnchor = design.points.at(-1);
        const anchor = existingAnchor ?? { xMm: 2_000, yMm: 2_000 };
        const origin = gpsOriginAt(fix, anchor.xMm, anchor.yMm);
        setGpsOrigin(origin);
        if (existingAnchor) {
          setNotice(`GPS aligned to the last fence point with ${formatGpsAccuracy(fix.accuracyMeters)} reported accuracy. Walk to the next corner and mark it.`);
          return;
        }
        const id = nextId.current++;
        const next = startFenceLine(design, { id: `point-${id}`, xMm: anchor.xMm, yMm: anchor.yMm });
        commit(next, `Starting GPS point marked with ${formatGpsAccuracy(fix.accuracyMeters)} reported accuracy.`);
        setSelection(null); setView(fittedView(next));
        return;
      }
      const activeAnchor = design.points.at(-1);
      let point = previousGpsFix && activeAnchor
        ? projectGpsLeg(previousGpsFix, activeAnchor, fix)
        : projectGpsFix(gpsOrigin, fix);
      let connection: "house" | "fence" | null = null;
      const connectionToleranceMm = Math.max(460, Math.min(3_000, Math.round(fix.accuracyMeters * 1_000)));
      const houseConnection = snapToHouseEdge(point.xMm, point.yMm, design.house, connectionToleranceMm);
      const fenceConnection = houseConnection ? null : snapToFenceRun(design, point.xMm, point.yMm, connectionToleranceMm, nextGpsStartsLine ? undefined : activeAnchor?.id);
      if (houseConnection) { point = houseConnection; connection = "house"; }
      else if (fenceConnection) { point = { xMm: fenceConnection.xMm, yMm: fenceConnection.yMm }; connection = "fence"; }
      else if (activeAnchor && snapEnabled && !nextGpsStartsLine) {
        const activePoints = fencePathForPoint(design, activeAnchor.id).points;
        const previous = activePoints.length > 1 ? activePoints.at(-2) : null;
        const referenceBearing = previous ? Math.atan2(activeAnchor.yMm - previous.yMm, activeAnchor.xMm - previous.xMm) : 0;
        point = snapRunEndpoint(activeAnchor, point, true, 90, referenceBearing);
      }
      if (activeAnchor && !nextGpsStartsLine && point.xMm === activeAnchor.xMm && point.yMm === activeAnchor.yMm) throw new RangeError("This GPS fix is at the last point. Walk to the next corner and try again.");
      const id = nextId.current++;
      const pointId = `point-${id}`; const segmentId = `segment-${id}`;
      const next = nextGpsStartsLine ? startFenceLine(design, { id: pointId, ...point }) : addPoint(design, { id: pointId, ...point }, segmentId);
      commit(next, `${nextGpsStartsLine ? "Separate GPS fence line started" : "GPS point marked"}${connection ? ` and attached to the ${connection === "house" ? "house" : "nearest fence run"}` : ""}. Reported phone accuracy: ${formatGpsAccuracy(fix.accuracyMeters)}.`);
      setNextGpsStartsLine(false); setSelection(null); setView(fittedView(next));
      const addedSegment = next.segments.find(({ id: candidateId }) => candidateId === segmentId);
      if (addedSegment) {
        const totalInches = Math.round(segmentLengthMm(next, addedSegment) / 25.4);
        setLastWalkSegmentId(segmentId); setWalkFeet(String(Math.floor(totalInches / 12))); setWalkInches(String(totalInches % 12)); setWalkLengthConfirmed(false);
      } else { setLastWalkSegmentId(null); setWalkLengthConfirmed(true); }
    } catch (error) {
      if (requestId === gpsRequestId.current) setNotice(error instanceof Error ? error.message : "The GPS point could not be marked.");
    } finally {
      window.clearInterval(countdown); window.clearTimeout(hardStop);
      if (gpsAbortController.current === controller) gpsAbortController.current = null;
      if (requestId === gpsRequestId.current) { setGpsBusy(false); setGpsSecondsRemaining(null); }
    }
  };
  const applyWalkLength = () => {
    if (!lastWalkSegmentId) return;
    try {
      const result = editSegmentToExactLength(lastWalkSegmentId, walkFeet, walkInches);
      commit(result.next, `Last GPS run corrected to the field measurement ${formatFeetInches(result.length)}. The entered measurement is now authoritative.`);
      setWalkLengthConfirmed(true); setView(fittedView(result.next));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid field measurement."); }
  };
  const toggleSiteWalk = () => {
    if (siteWalkActive) {
      cancelGpsLock("Site Walk finished. GPS coordinates were converted to local plan geometry only."); setSiteWalkActive(false); setNextGpsStartsLine(false);
    } else {
      setSiteWalkActive(true); setPropertyPanelOpen(false); setTakeoffPanelOpen(false); setMode("select"); setPreviewPoint(null); setSelection(null); setNotice(gpsOrigin ? "Site Walk ready. Walk to the next corner and mark it." : design.points.length ? "Stand at the last drawn point and set the GPS reference." : "Stand at the first fence point and mark the starting GPS position.");
    }
  };
  const openPropertyReference = (provider: ReferenceProvider) => {
    try {
      const links = propertyReferenceLinks(kgisAddress);
      window.open(links[provider], "_blank", "noopener,noreferrer");
      setNotice(provider === "acres"
        ? "Opened Acres. Search the address there, then return with a permitted area-map image or use it beside Fence Measure as a reference."
        : provider === "kgis"
          ? "Opened the official KGIS aerial/property map. Treat its parcel and building lines as reference only."
          : "Opened Google Maps at the address for visual reference. Google imagery is not imported into Fence Measure.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid property address."); }
  };
  const applyReferenceImage = (image: RasterizedReferenceImage, name: string, message: string) => {
    setReferenceBackground({ src: image.src, name, transform: fittedBackgroundTransform(image.widthPx, image.heightPx, view), opacity: 0.58, locked: false });
    setLayers((current) => ({ ...current, reference: true })); setMode("select"); setCalibrationPoints([]); setNotice(message);
  };
  const loadReferenceImage = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setNotice("Choose a PNG, JPEG, or WebP image. For a PDF survey, save the relevant page as an image first."); return; }
    if (file.size > 15 * 1024 * 1024) { setNotice("Choose a reference image smaller than 15 MB."); return; }
    setReferenceBusy("upload");
    try { applyReferenceImage(await rasterizeReferenceBlob(file), file.name, "Reference image loaded locally. Enter a known distance, then pick two points to calibrate it before tracing."); }
    catch (error) { setNotice(referenceImageErrorMessage(error, "upload")); }
    finally { setReferenceBusy(null); }
  };
  const pasteReferenceImage = async () => {
    setReferenceBusy("paste"); setNotice("Reading an image from the clipboard…");
    try { applyReferenceImage(await readReferenceImageFromClipboard(navigator.clipboard), "Pasted map capture", "Clipboard image pasted without saving a device file. Calibrate it before tracing."); }
    catch (error) { setNotice(referenceImageErrorMessage(error, "paste")); }
    finally { setReferenceBusy(null); }
  };
  const captureMapTab = async () => {
    setReferenceBusy("capture"); setNotice("Choose the Acres or KGIS tab in the browser’s sharing window.");
    try { applyReferenceImage(await captureReferenceDisplay(navigator.mediaDevices), "Captured map tab", "Map tab captured locally without saving a device file. Calibrate it before tracing."); }
    catch (error) { setNotice(referenceImageErrorMessage(error, "capture")); }
    finally { setReferenceBusy(null); }
  };
  const startCalibration = () => {
    if (!referenceBackground) { setNotice("Upload a reference image first."); return; }
    if (referenceBackground.locked) { setNotice("Unlock the reference image before calibrating it."); return; }
    try {
      const distance = feetAndInchesToMm(Number(calibrationFeet), Number(calibrationInches));
      setCalibrationPoints([]); setMode("calibrate"); setSelection(null); setPreviewPoint(null);
      setNotice(`Calibration ready for ${formatFeetInches(distance)}. Tap the first point on the known distance.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid calibration distance."); }
  };
  const startHouseTrace = () => {
    if (!referenceBackground) { setNotice("Capture or upload a property image first."); return; }
    if (referenceBackground.locked) { setNotice("Unlock the reference image before tracing the house."); return; }
    if (design.points.length) { setNotice("Straighten the property image before drawing fence points so existing measurements are never moved out of alignment."); return; }
    setHouseTracePoints([]); setCalibrationPoints([]); setMode("trace-house"); setSelection(null); setPreviewPoint(null);
    setNotice("Tap one house corner, then the adjacent corner along the wall that should become horizontal. Continue around all four corners.");
  };
  const nudgeReference = (dxMm: number, dyMm: number) => {
    if (!referenceBackground || referenceBackground.locked) return;
    setReferenceBackground({ ...referenceBackground, transform: moveBackgroundTransform(referenceBackground.transform, dxMm, dyMm) });
  };
  const fitReference = () => {
    if (!referenceBackground || referenceBackground.locked) return;
    const image = new Image();
    image.onload = () => setReferenceBackground((current) => current ? { ...current, transform: fittedBackgroundTransform(image.naturalWidth, image.naturalHeight, view) } : current);
    image.src = referenceBackground.src;
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
  const save = () => {
    try { saveLocalDesign(localStorage, design); saveLocalReference(localStorage, referenceBackground); setNotice(referenceBackground ? "Fence layout and compressed reference image saved in this browser only." : "Fence layout saved in this browser only."); }
    catch (error) { setNotice(error instanceof Error ? `Local save failed: ${error.message}` : "Local save failed. The reference image may be too large for this browser."); }
  };
  const load = () => {
    try {
      const loaded = loadLocalDesign(localStorage);
      if (!loaded) { setNotice("No saved layout exists in this browser yet."); return; }
      const loadedReference = loadLocalReference(localStorage);
      cancelGpsLock(); lastGpsFix.current = null; setGpsOrigin(null); setGpsAccuracyMeters(null); setLastWalkSegmentId(null); setWalkLengthConfirmed(true); setSiteWalkActive(false);
      setHistory(createHistory(loaded)); setReferenceBackground(loadedReference); nextId.current = nextNumericId(loaded); setSelection(null); setGateEditorOpen(false); setClosurePathPointId(null); setMode("select"); setView(fittedView(loaded)); setNotice(loadedReference ? "Saved fence layout and reference image loaded. Start Site Walk at the last point to align a new GPS session." : "Saved local layout loaded. Start Site Walk at the last point to align a new GPS session.");
    } catch (error) { setNotice(error instanceof Error ? `Saved layout was not opened: ${error.message}` : "Saved layout was not opened."); }
  };
  const copyTakeoff = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new RangeError("This browser cannot copy the takeoff. Select and copy the audit details manually.");
      const isAluminum = takeoffMaterial === "black-aluminum";
      await navigator.clipboard.writeText(isAluminum ? formatBlackAluminumTakeoffText(blackAluminumTakeoff) : formatTreatedPinePrivacyTakeoffText(treatedPineTakeoff));
      setNotice(`Preliminary ${isAluminum ? "Black Aluminum" : "Treated Pine Privacy"} takeoff copied. It contains measurements and counts only—no pricing or products.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The takeoff could not be copied."); }
  };

  return <main className={`fence-designer${siteWalkActive ? " site-walk-active" : ""}`}>
    <header className="app-header">
      <div><p className="eyebrow">McKenzie OS · isolated prototype</p><h1>Fence Visual Measure</h1><p>Draw perimeter and divider lines, then review a preliminary material takeoff. No pricing is included.</p></div>
      <div className="total-card"><span>Total measured length</span><strong>{formatFeetInches(totals.all)}</strong><small>{design.segments.length} span{design.segments.length === 1 ? "" : "s"} · {fenceLineCount(design)} fence line{fenceLineCount(design) === 1 ? "" : "s"}{totals.gate ? ` · ${formatFeetInches(totals.gate)} gate intent` : ""}</small></div>
    </header>

    <nav className="toolbar" aria-label="Drawing controls">
      <div className="segmented"><button className={mode === "draw" ? "active" : ""} onClick={() => { setMode("draw"); if (!selectedOpenEndpoint) setSelection(null); setClosurePathPointId(null); setNotice(selectedOpenEndpoint ? "Draw continues from the selected endpoint. Tap an odd-angle location, then return to Quick layout for the next exact run." : "Draw continues from the latest open endpoint. Use Start separate line to begin somewhere else."); }}>＋ Draw</button><button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}>↖ Edit</button><button className={mode === "pan" ? "active" : ""} onClick={() => { setMode("pan"); setSelection(null); setNotice("Drag the plan to move around. Pinch with two fingers to zoom."); }}>✋ Pan</button></div>
      <button className={mode === "new-line" ? "active-tool" : ""} onClick={() => { setMode("new-line"); setSelection(null); setClosurePathPointId(null); setPreviewPoint(null); setNotice("Tap anywhere to start a separate fence line. Tap near an existing run to connect partway along it."); }}>＋ Separate line</button>
      <button disabled={history.past.length === 0} onClick={() => { setHistory(undo); setSelection(null); setNotice("Undid the last change."); }}>↶ Undo</button>
      <button disabled={history.future.length === 0} onClick={() => { setHistory(redo); setSelection(null); setNotice("Redid the change."); }}>↷ Redo</button>
      <div className="zoom-controls" aria-label="Plan zoom"><button aria-label="Zoom out" onClick={() => zoomAt(1.25)}>−</button><span>{Math.round(DEFAULT_VIEW.width / view.width * 100)}%</span><button aria-label="Zoom in" onClick={() => zoomAt(0.8)}>＋</button></div>
      <button onClick={() => setView(fittedView(design))}>Fit plan</button>
      <button className={houseSelected ? "active-tool" : ""} onClick={selectHouse}>{design.house ? "⌂ House" : "＋ House"}</button>
      <button disabled={!design.house || !activePath || activePath.segments.length < 2} className={mode === "close" ? "active-tool" : ""} onClick={() => { setMode("close"); setSelection(null); setClosurePathPointId(extensionAnchor?.id ?? null); setPreviewPoint(null); setNotice("Tap the second connection on the house. Closure will keep this line's measured runs fixed and redistribute only its angles."); }}>⇥ Close to house</button>
      <button aria-pressed={snapEnabled} className={snapEnabled ? "active-tool" : ""} onClick={() => { setSnapEnabled((current) => !current); setPreviewPoint(null); setNotice(snapEnabled ? "Free angle is on. Runs now follow the measured geometry without angle assumptions." : "45°/90° angle assist is on and uses the previous fence segment as its reference."); }}>{snapEnabled ? "⌁ Relative 45°/90°" : "◌ Free angle"}</button>
      <button aria-pressed={layers.grid} className={layers.grid ? "active-tool" : ""} onClick={() => { setLayers((current) => ({ ...current, grid: !current.grid })); setNotice(layers.grid ? "Plan grid hidden." : "Plan grid shown."); }}>{layers.grid ? "▦ Grid on" : "▦ Grid off"}</button>
      <button aria-pressed={lengthLockEnabled} className={lengthLockEnabled ? "active-tool" : ""} onClick={() => { setLengthLockEnabled((current) => !current); setNotice(lengthLockEnabled ? "Length lock is off. Dragging a point can now change connected measurements." : "Length lock is on. Dragging adjusts the angle while preserving the incoming and following measurements."); }}>{lengthLockEnabled ? "🔒 Lengths" : "🔓 Lengths"}</button>
      <button aria-pressed={commandDockOpen} className={commandDockOpen ? "active-tool" : ""} onClick={() => { setCommandDockOpen((current) => !current); setMode("select"); setPreviewPoint(null); setNotice(commandDockOpen ? "Quick layout closed." : "Quick layout uses the selected open endpoint. Type an exact run or tap Draw for an odd angle."); }}>⌨ Quick layout</button>
      <button aria-pressed={propertyPanelOpen} className={propertyPanelOpen ? "active-tool" : ""} onClick={() => setPropertyPanelOpen((current) => !current)}>⌖ Property</button>
      <button aria-pressed={takeoffPanelOpen} className={takeoffPanelOpen ? "active-tool" : ""} onClick={() => setTakeoffPanelOpen((current) => !current)}>▦ Materials</button>
      <span className="toolbar-spacer" />
      <button onClick={save}>Save local</button><button onClick={load}>Load local</button>
    </nav>

    {(siteWalkActive || propertyPanelOpen || takeoffPanelOpen) && <section className="field-panels" aria-label="Fence planning tools">
      {siteWalkActive && <div className="field-panel site-walk-panel">
        <div className="field-panel-heading"><div><p className="eyebrow">Site walk</p><h2>Mark the point where you are standing</h2></div>{gpsAccuracyMeters !== null && <span aria-live="polite" className={`accuracy-chip${gpsAccuracyMeters <= 5 ? " good" : ""}`}>{formatGpsAccuracy(gpsAccuracyMeters)} GPS</span>}</div>
        <p>{!gpsOrigin ? (design.points.length ? "Stand at the last drawn point first. This aligns GPS to the existing plan without adding a duplicate point." : "Stand at the first fence point. Your first mark creates the local plan origin.") : nextGpsStartsLine ? "Walk to the starting point for the separate fence line, then mark it." : "Walk to the next corner or connection, stand still, then mark it."}</p>
        <div className="field-actions">
          <button className="primary mark-location" disabled={walkNeedsExactLength} onClick={() => gpsBusy ? cancelGpsLock() : void markGpsPoint()}>{gpsBusy ? `Cancel GPS lock${gpsSecondsRemaining !== null ? ` · ${gpsSecondsRemaining}s` : ""}` : walkNeedsExactLength ? "Enter exact length below" : !gpsOrigin && design.points.length ? "Set GPS reference here" : nextGpsStartsLine ? "Mark separate-line start" : design.points.length ? "Mark next fence point" : "Mark starting point"}</button>
          <button aria-pressed={snapEnabled} className={snapEnabled ? "active-tool" : ""} onClick={() => { setSnapEnabled((current) => !current); setNotice(snapEnabled ? "Site Walk is using free GPS angles." : "90° corners are on. GPS chooses the rough direction; each new leg aligns straight or square to the previous leg and requires an exact length."); }}>{snapEnabled ? "□ 90° corners on" : "◌ Free GPS angles"}</button>
          <button disabled={gpsBusy || !gpsOrigin || walkNeedsExactLength} className={nextGpsStartsLine ? "active-tool" : ""} onClick={() => { setNextGpsStartsLine((current) => !current); setNotice(nextGpsStartsLine ? "Separate-line start canceled." : "The next GPS mark will start a separate fence line instead of continuing the last one."); }}>{nextGpsStartsLine ? "Cancel separate line" : "＋ Separate line next"}</button>
          <button className="finish-site-walk" onClick={toggleSiteWalk}>End site walk</button>
        </div>
        <div className="walk-status" role="status">{notice}</div>
        {lastWalkSegmentId && design.segments.some(({ id }) => id === lastWalkSegmentId) && <div className="walk-length-editor">
          <div><strong>Correct the last GPS run</strong><span>Enter the tape, wheel, or laser measurement.</span></div>
          <div className="exact-grid"><label><span>Feet</span><input aria-label="Site walk exact feet" inputMode="numeric" type="number" min="0" max="1000" value={walkFeet} onChange={(event) => setWalkFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Site walk exact inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={walkInches} onChange={(event) => setWalkInches(event.target.value)} /></label></div>
          <button className="primary" onClick={applyWalkLength}>{walkLengthConfirmed ? "Exact length applied" : "Use exact length"}</button>
        </div>}
        <small>The phone samples GPS for up to 20 seconds, accepts an early lock at ±16 ft or better, and rejects readings worse than approximately ±49 ft. GPS establishes approximate shape only. Exact entered lengths remain authoritative; no latitude or longitude is saved in the design.</small>
      </div>}
      {propertyPanelOpen && <div className="field-panel property-panel">
        <div className="field-panel-heading"><div><p className="eyebrow">Free property reference</p><h2>Open the map, then capture it here</h2></div><span className="reference-chip">Reference only</span></div>
        <p>Open Acres Plus or KGIS, position the property and turn on the layers you need. Return here and capture that browser tab, or paste a copied screenshot. No image file has to be saved on your device.</p>
        <div className="property-lookup"><label><span>Property address</span><input value={kgisAddress} onChange={(event) => setKgisAddress(event.target.value)} placeholder="Street address" autoComplete="street-address" /></label><div className="reference-links"><button onClick={() => openPropertyReference("acres")}>Open Acres ↗</button><button onClick={() => openPropertyReference("kgis")}>Open KGIS ↗</button><button onClick={() => openPropertyReference("googleMaps")}>Open Google ↗</button></div></div>
        <div className="reference-workflow">
          <input ref={referenceFileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void loadReferenceImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <div className="reference-capture-actions">
            <button className="primary" disabled={referenceBusy !== null} onClick={() => void captureMapTab()}>{referenceBusy === "capture" ? "Choose the map tab…" : referenceBackground ? "Recapture map tab" : "Capture map tab"}</button>
            <button disabled={referenceBusy !== null} onClick={() => void pasteReferenceImage()}>{referenceBusy === "paste" ? "Reading clipboard…" : "Paste image"}</button>
            <button disabled={referenceBusy !== null} onClick={() => referenceFileRef.current?.click()}>{referenceBusy === "upload" ? "Loading file…" : "Upload file"}</button>
          </div>
          <div className="capture-help"><strong>Desktop test flow</strong><span><b>Capture map tab:</b> choose the open Acres or KGIS tab in the browser picker.</span><span><b>Paste image:</b> copy a screenshot, return here, and paste it directly. On Mac use Control–Shift–Command–4; on Windows use Windows–Shift–S.</span></div>
          {referenceBackground && <div className="reference-upload"><span title={referenceBackground.name}>Using: {referenceBackground.name}</span></div>}
          {referenceBackground && <>
            <div className="layer-controls" aria-label="Visible plan layers">
              <strong>Visible layers</strong>
              {(["reference", "grid", "house", "dimensions"] as const).map((layer) => <label key={layer}><input type="checkbox" checked={layers[layer]} onChange={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))} /><span>{layer === "reference" ? "Reference image" : layer === "dimensions" ? "Measurements" : `${layer[0].toUpperCase()}${layer.slice(1)}`}</span></label>)}
            </div>
            <div className="reference-adjustments">
              <label><span>Image opacity · {Math.round(referenceBackground.opacity * 100)}%</span><input type="range" min="10" max="100" value={Math.round(referenceBackground.opacity * 100)} onChange={(event) => setReferenceBackground({ ...referenceBackground, opacity: Number(event.target.value) / 100 })} /></label>
              <label><span>Rotation</span><input aria-label="Reference rotation degrees" type="number" step="1" value={referenceBackground.transform.rotationDegrees} disabled={referenceBackground.locked} onChange={(event) => setReferenceBackground({ ...referenceBackground, transform: rotateBackgroundTransform(referenceBackground.transform, Number(event.target.value)) })} /></label>
              <div className="reference-position"><span>Move image</span><div><button aria-label="Move reference left" disabled={referenceBackground.locked} onClick={() => nudgeReference(-305, 0)}>←</button><button aria-label="Move reference up" disabled={referenceBackground.locked} onClick={() => nudgeReference(0, -305)}>↑</button><button aria-label="Move reference down" disabled={referenceBackground.locked} onClick={() => nudgeReference(0, 305)}>↓</button><button aria-label="Move reference right" disabled={referenceBackground.locked} onClick={() => nudgeReference(305, 0)}>→</button></div></div>
            </div>
            <div className="calibration-editor">
              <div><strong>Set image scale</strong><span>Enter one known real-world distance, then tap its two endpoints on the image.</span></div>
              <div className="exact-grid"><label><span>Feet</span><input aria-label="Calibration feet" inputMode="numeric" type="number" min="0" max="1000" placeholder="Required" value={calibrationFeet} onChange={(event) => setCalibrationFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Calibration inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={calibrationInches} onChange={(event) => setCalibrationInches(event.target.value)} /></label></div>
              <button className={mode === "calibrate" ? "active-tool" : "primary"} disabled={referenceBackground.locked} onClick={startCalibration}>{mode === "calibrate" ? "Pick calibration points…" : "Pick two points"}</button>
            </div>
            <div className="house-trace-editor">
              <div><strong>Straighten from the house</strong><span>After calibration, mark four house corners. The first wall becomes horizontal and creates the house footprint.</span></div>
              <button className={mode === "trace-house" ? "active-tool" : "primary"} disabled={referenceBackground.locked || design.points.length > 0} onClick={() => { if (mode === "trace-house") { setHouseTracePoints([]); setMode("select"); setNotice("House tracing canceled."); } else startHouseTrace(); }}>{mode === "trace-house" ? `Cancel tracing · ${houseTracePoints.length}/4` : "Trace 4 house corners"}</button>
              {design.points.length > 0 && <small>Available before fence points are drawn so straightening cannot misalign existing measurements.</small>}
            </div>
            <div className="reference-actions"><button disabled={referenceBackground.locked} onClick={fitReference}>Fit image to view</button><button aria-pressed={referenceBackground.locked} className={referenceBackground.locked ? "active-tool" : ""} onClick={() => setReferenceBackground({ ...referenceBackground, locked: !referenceBackground.locked })}>{referenceBackground.locked ? "🔒 Image locked" : "🔓 Lock image"}</button><button className="danger" onClick={() => { setReferenceBackground(null); saveLocalReference(localStorage, null); setCalibrationPoints([]); setHouseTracePoints([]); if (mode === "calibrate" || mode === "trace-house") setMode("select"); setNotice("Local reference image removed. Fence measurements were not changed."); }}>Remove image</button></div>
          </>}
        </div>
        <small>Reference imagery and GIS lines are not a boundary survey. Google stays a separate viewer. Captured images never leave this browser, are compressed for local use, and are saved with Save local so the design can be reopened on this same device. They are never included in fence totals.</small>
      </div>}
      {takeoffPanelOpen && <div className="field-panel takeoff-panel">
        <div className="field-panel-heading"><div><p className="eyebrow">Material takeoff V0</p><h2>{takeoffReady ? (takeoffMaterial === "black-aluminum" ? "Black Aluminum" : "Treated Pine Privacy") : "Confirm the measured layout"}</h2></div><div className="takeoff-heading-actions">{takeoffReady && <label className="takeoff-material"><span>Fence type</span><select aria-label="Fence material takeoff" value={takeoffMaterial} onChange={(event) => { setTakeoffMaterial(event.target.value as TakeoffMaterial); setTakeoffViewEnabled(false); setNotice("Material takeoff changed. The confirmed drawing and all line rules stayed exactly the same."); }}><option value="black-aluminum">Black aluminum</option><option value="treated-pine-privacy">Treated pine privacy</option></select></label>}<span className="reference-chip">No pricing</span>{takeoffReady && <><button onClick={() => void copyTakeoff()}>Copy takeoff</button><button aria-pressed={takeoffViewEnabled} className={takeoffViewEnabled ? "active-tool" : ""} onClick={() => { setTakeoffViewEnabled((current) => !current); setNotice(takeoffViewEnabled ? "Takeoff markers hidden." : "Takeoff markers show each eight-foot bay and post decision on the plan."); }}>{takeoffViewEnabled ? "Hide plan takeoff" : "Show takeoff on plan"}</button></>}</div></div>
        {!takeoffReady ? <div className="takeoff-confirm"><strong>{design.segments.length ? (takeoffConfirmedRevision === null ? "Drawing comes first" : "The drawing changed") : "Draw the fence first"}</strong><span>{design.segments.length ? "Confirm the measured lines when the layout is ready. Fence type only changes the material calculation afterward." : "Use the same Draw, Edit, gate, closure, snap, and exact-length tools for every fence type."}</span><button className="primary" disabled={design.segments.length === 0} onClick={() => { setTakeoffConfirmedRevision(design.revision); setTakeoffViewEnabled(false); setNotice("Measured layout confirmed for takeoff. Choose a fence type; the drawing and line rules will not change."); }}>Confirm layout for takeoff</button></div> : <>
        {takeoffMaterial === "black-aluminum" ? <>
          <p>Calculated directly from the measured fence and gate runs using 8-foot panels.</p>
          <div className="takeoff-summary"><article><span>Fence footage</span><strong>{formatFeetInches(blackAluminumTakeoff.fenceLengthMm)}</strong></article><article><span>8′ panels · fence + gates</span><strong>{blackAluminumTakeoff.panelCount}</strong><small>{blackAluminumTakeoff.fencePanelCount} fence · {blackAluminumTakeoff.gatePanelCount} gate fabrication</small></article><article><span>Single gates</span><strong>{blackAluminumTakeoff.singleGates}</strong></article><article><span>Double gates</span><strong>{blackAluminumTakeoff.doubleGates}</strong></article></div>
          <div className="takeoff-columns"><section><h3>Posts</h3><dl><div><dt>End posts</dt><dd>{blackAluminumTakeoff.endPosts}</dd></div><div><dt>Corner posts</dt><dd>{blackAluminumTakeoff.cornerPosts}</dd></div><div><dt>Run posts</dt><dd>{blackAluminumTakeoff.linePosts}</dd></div></dl></section><section><h3>Gate hardware</h3><dl><div><dt>Hinges</dt><dd>{blackAluminumTakeoff.hinges}</dd></div><div><dt>Latches</dt><dd>{blackAluminumTakeoff.latches}</dd></div><div><dt>Center drop poles</dt><dd>{blackAluminumTakeoff.centerDropPoles}</dd></div></dl></section><section><h3>Gate openings</h3>{blackAluminumTakeoff.gateOpenings.length ? <dl>{blackAluminumTakeoff.gateOpenings.map((gate) => <div key={`${gate.gateType}-${gate.widthMm}`}><dt>{gate.gateType === "double" ? "Double" : "Single"} · {formatFeetInches(gate.widthMm)}</dt><dd>{gate.count}</dd></div>)}</dl> : <p className="takeoff-empty">No gates marked.</p>}</section></div>
        </> : <>
          <p>6-foot treated-pine privacy with touching 6-inch pickets, three rails per 8-foot maximum bay, and 10% waste on all lumber.</p>
          <div className="takeoff-summary"><article><span>1×6×6 pickets</span><strong>{treatedPineTakeoff.picketsWithWaste}</strong><small>{treatedPineTakeoff.installedPickets} installed · {treatedPineTakeoff.picketWasteAllowance} waste</small></article><article><span>2×4×8 lumber</span><strong>{treatedPineTakeoff.twoByFoursWithWaste}</strong><small>{treatedPineTakeoff.fenceRailPieces} rails · {treatedPineTakeoff.gateFramePieces} gate frame · {treatedPineTakeoff.twoByFourWasteAllowance} waste</small></article><article><span>4×4 posts</span><strong>{treatedPineTakeoff.fourByFoursWithWaste}</strong><small>{treatedPineTakeoff.installedPosts} installed · {treatedPineTakeoff.postWasteAllowance} waste</small></article><article><span>50 lb concrete</span><strong>{treatedPineTakeoff.concreteBags}</strong><small>one bag per installed hole</small></article></div>
          <div className="takeoff-columns"><section><h3>Installed material</h3><dl><div><dt>Fence pickets</dt><dd>{treatedPineTakeoff.fencePickets}</dd></div><div><dt>Gate pickets</dt><dd>{treatedPineTakeoff.gatePickets}</dd></div><div><dt>Picket screws</dt><dd>{treatedPineTakeoff.picketScrews}</dd></div><div><dt>Rail-to-post structural screws</dt><dd>{treatedPineTakeoff.railToPostStructuralScrews}</dd></div><div><dt>Gate-frame structural screws</dt><dd>{treatedPineTakeoff.gateFrameStructuralScrews}</dd></div></dl></section><section><h3>Gate hardware</h3><dl><div><dt>Hinges · 2 per leaf</dt><dd>{treatedPineTakeoff.hinges}</dd></div><div><dt>Latches</dt><dd>{treatedPineTakeoff.latches}</dd></div><div><dt>Double-gate drop rods</dt><dd>{treatedPineTakeoff.dropRods}</dd></div><div><dt>Mounting fasteners</dt><dd>Included</dd></div></dl></section><section><h3>Gate openings</h3>{treatedPineTakeoff.gateOpenings.length ? <dl>{treatedPineTakeoff.gateOpenings.map((gate) => <div key={`${gate.gateType}-${gate.widthMm}`}><dt>{gate.gateType === "double" ? "Double" : "Single"} · {formatFeetInches(gate.widthMm)}</dt><dd>{gate.count}</dd></div>)}</dl> : <p className="takeoff-empty">No gates marked.</p>}</section></div>
        </>}
        <details className="takeoff-audit">
          <summary>Review {takeoffMaterial === "black-aluminum" ? "panel" : "bay"} and post decisions</summary>
          <div className="takeoff-audit-grid">
            <section><h3>{takeoffMaterial === "black-aluminum" ? "Panel" : "Post bay"} layout</h3>{takeoffPanelRuns.length ? <ol>{takeoffPanelRuns.map(([runIndex, panels]) => <li key={runIndex}><strong>Run {runIndex + 1}</strong><span>{panels.map((panel) => `${formatFeetInches(panel.lengthMm)}${panel.cut ? " partial" : " full"}`).join(" + ")}</span></li>)}</ol> : <p className="takeoff-empty">Draw a fence run to calculate the layout.</p>}</section>
            {takeoffMaterial === "black-aluminum" && <section><h3>Gate fabrication cut plan</h3>{blackAluminumTakeoff.gateFabricationPanels.length ? <ol>{blackAluminumTakeoff.gateFabricationPanels.map((panel, panelIndex) => <li key={panel.id}><strong>Gate panel {panelIndex + 1} · {formatFeetInches(panel.usedMm)} used</strong><span>{panel.pieces.map((piece) => `${piece.gateType === "double" ? `Double leaf ${piece.pieceIndex + 1}/${piece.pieceCount}` : "Single gate"} ${formatFeetInches(piece.widthMm)}`).join(" + ")} · {formatFeetInches(panel.wasteMm)} waste</span></li>)}</ol> : <p className="takeoff-empty">Add a gate to calculate fabrication cuts.</p>}</section>}
            <section><h3>Why each post is counted</h3>{takeoffPostDecisions.length ? <dl>{takeoffPostDecisions.map(([reason, count]) => <div key={reason}><dt>{takeoffPostReasonLabel(reason)}</dt><dd>{count}</dd></div>)}</dl> : <p className="takeoff-empty">No posts calculated.</p>}</section>
          </div>
          <p>Run numbers match the R labels on the plan. Each layout interval is no longer than 8 feet. The selected fence type determines which materials are installed in that interval.</p>
        </details>
        {(takeoffMaterial === "black-aluminum" ? blackAluminumTakeoff.warnings : treatedPineTakeoff.warnings).map((warning) => <div className="takeoff-warning" role="status" key={warning}>{warning}</div>)}
        <small>{takeoffMaterial === "black-aluminum" ? "Panels round up separately for each uninterrupted straight fence run. Gate material and fence panels are optimized separately. Every non-corner gate side uses an end post; a true corner post may also serve as the gate post." : "Pickets are counted across each uninterrupted fence run and each gate leaf, then rounded up with 10% waste. Each fence bay uses three 2×4 rails. A single gate uses five 2×4 frame pieces; a double uses ten. All posts are treated 4×4s with one 50 lb concrete bag per installed hole. Picket screws are two per picket at each of three rails. Preliminary structural defaults use 12 screws per bay and 12 per gate leaf; hardware mounting fasteners are included with the hardware item."} This takeoff is derived only and is not saved into the measurement geometry.</small>
        </>}
      </div>}
    </section>}

    <section className="workspace">
      <div className="canvas-shell">
        {commandDockOpen && mode !== "draw" && <section className="command-dock" aria-label="Quick layout command dock">
          <div className="command-dock-heading"><div><p className="eyebrow">Quick layout</p><strong>{extensionAnchor ? selectedOpenEndpoint ? "Continuing from selected endpoint" : "Continuing from latest endpoint" : "Place a starting point"}</strong></div><button aria-label="Close Quick layout" onClick={() => setCommandDockOpen(false)}>×</button></div>
          {commandLog.length > 0 && <ol className="command-log" aria-label="Applied run commands">{commandLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol>}
          <form className="command-entry" onSubmit={(event) => { event.preventDefault(); applyRunCommand(); }}>
            <label><span>Describe the next run</span><input aria-label="Describe the next run" value={commandInput} onChange={(event) => setCommandInput(event.target.value)} placeholder={incomingBearing === null ? "Example: south 20 ft" : "Example: right 90, 40 ft"} /></label>
            <button className="primary" type="submit">{extensionAnchor ? "Add run" : "Tap start"}</button>
          </form>
          <div className="command-suggestions" aria-label="Run command examples">
            {(incomingBearing === null ? ["South 20 ft", "East 20 ft"] : ["Straight 20 ft", "Right 90, 20 ft", "Left 90, 20 ft"]).map((example) => <button type="button" key={example} onClick={() => setCommandInput(example)}>{example}</button>)}
          </div>
          <div className={`command-preview-message${commandPreview && "error" in commandPreview ? " error" : ""}`} role="status">
            {!extensionAnchor ? "Tap Draw and place the start on the plan. Quick layout will continue from it." : !commandInput.trim() ? "Type a run, or tap Draw to eyeball an odd angle. Selecting another open endpoint changes where commands continue." : commandPreview && "error" in commandPreview ? commandPreview.error : commandPreview ? `Preview: ${commandPreview.command.summary}` : ""}
          </div>
          <div className="command-secondary-actions">
            <button type="button" onClick={() => { setMode("draw"); setNotice(extensionAnchor ? "Tap the plan to eyeball the next point from this endpoint." : "Tap the plan to place the starting point."); }}>＋ Eyeball next point</button>
            <button type="button" disabled={!quickGateSegment} onClick={() => { if (!quickGateSegment) return; const selectedTarget = selectedSegment?.id === quickGateSegment.id; selectSegment(quickGateSegment.id); setGateEditorOpen(true); setCommandDockOpen(false); setNotice(`Gate placement opened for the ${selectedTarget ? "selected" : "last completed"} run. Enter its width and exact distance from marked Post A or Post B.`); }}>＋ Gate on {selectedSegment?.kind === "fence" ? "selected" : "last"} run</button>
            <button type="button" disabled={!design.house || !activePath || activePath.segments.length < 2} onClick={() => { setCommandDockOpen(false); setMode("close"); setSelection(null); setClosurePathPointId(extensionAnchor?.id ?? null); setNotice("Tap the intended connection on the house. Measured runs stay fixed while flexible angles close."); }}>⇥ Close to house</button>
          </div>
        </section>}
        <div className="canvas-key"><span><i className="key-dot endpoint" /> Open endpoint</span><span><i className="key-dot attached" /> Connected endpoint</span><span><i className="key-dot corner" /> Corner</span><span><i className="key-line preview" /> Live run</span><span><i className="key-line gate" /> Gate intent</span>{takeoffReady && takeoffViewEnabled && <><span><i className="key-post end" /> End post</span><span><i className="key-post corner" /> Corner post</span><span><i className="key-post line" /> Run post</span><span><i className="key-panel cut" /> Cut panel</span></>}</div>
        {takeoffReady && takeoffViewEnabled && <div className="sr-only" role="status" aria-live="polite">{takeoffMaterial === "black-aluminum" ? "Black Aluminum" : "Treated Pine Privacy"} takeoff view. {activeTakeoffLayout.panels.length} material bays and {activeTakeoffLayout.posts.length} installed posts shown.</div>}
        {liveRunLengthMm !== null && liveRunLengthMm > 0 && <div className="live-measurement" role="status" aria-live="polite"><span>Current run</span><strong>{formatFeetInches(liveRunLengthMm)}</strong><small>{snapEnabled ? "45°/90° assist" : "Free angle"} · click to place</small></div>}
        <svg ref={svgRef} className={`plan-canvas ${mode}${isNavigating ? " navigating" : ""}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={startNavigation} onPointerMove={moveCanvasPointer} onPointerLeave={() => { if (!drag && !isNavigating) setPreviewPoint(null); }} onPointerUp={endNavigation} onPointerCancel={endNavigation} aria-label="Fence drawing plan">
          <defs><pattern id="grid" width={GRID_MM} height={GRID_MM} patternUnits="userSpaceOnUse"><path d={`M ${GRID_MM} 0 L 0 0 0 ${GRID_MM}`} fill="none" stroke="#d8ddd7" strokeWidth="18" /></pattern></defs>
          {referenceBackground && layers.reference && (() => {
            const transform = referenceBackground.transform;
            const centerX = transform.xMm + transform.widthMm / 2; const centerY = transform.yMm + transform.heightMm / 2;
            return <image className="reference-image" href={referenceBackground.src} x={transform.xMm} y={transform.yMm} width={transform.widthMm} height={transform.heightMm} opacity={referenceBackground.opacity} preserveAspectRatio="none" transform={`rotate(${transform.rotationDegrees} ${centerX} ${centerY})`} pointerEvents="none" aria-label={`Local reference image ${referenceBackground.name}`} />;
          })()}
          {layers.grid && <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" pointerEvents="none" />}
          {design.house && layers.house && <g className={`house-reference${houseSelected ? " selected" : ""}`} role="button" tabIndex={0} aria-label={`House footprint ${formatFeetInches(design.house.lengthMm)} by ${formatFeetInches(design.house.widthMm)}`} onPointerDown={(event) => { if (mode === "close") { event.stopPropagation(); closeAt(event); } else if (mode !== "pan" && mode !== "new-line" && mode !== "calibrate" && mode !== "trace-house" && !event.metaKey) { event.stopPropagation(); selectHouse(); } }}>
            <rect className="house-hit" x={design.house.xMm} y={design.house.yMm} width={design.house.lengthMm} height={design.house.widthMm} />
            <rect className="house-footprint" x={design.house.xMm} y={design.house.yMm} width={design.house.lengthMm} height={design.house.widthMm} />
            <g transform={`translate(${design.house.xMm + design.house.lengthMm / 2} ${design.house.yMm + design.house.widthMm / 2})`} className="house-label"><rect x="-1050" y="-300" width="2100" height="600" rx="180" /><text textAnchor="middle" dominantBaseline="central">HOUSE · {formatFeetInches(design.house.lengthMm)} × {formatFeetInches(design.house.widthMm)}</text></g>
          </g>}
          {design.segments.map((segment) => {
            const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
            const midX = (start.xMm + end.xMm) / 2; const midY = (start.yMm + end.yMm) / 2;
            const selected = selection?.type === "segment" && selection.id === segment.id;
            const label = formatFeetInches(segmentLengthMm(design, segment));
            const dimensionText = segment.kind === "gate" ? `${segment.gateType === "double" ? "DOUBLE" : "SINGLE"} GATE · ${label}` : label;
            const dimensionPosition = dimensionPositions.get(segment.id) ?? { xMm: midX, yMm: midY };
            const dimensionWidth = Math.max(1_520, dimensionText.length * 180) * dimensionScale;
            return <g key={segment.id} className={`segment ${segment.kind}${selected ? " selected" : ""}`} onPointerDown={(event) => { if (mode === "select" && !event.metaKey) { event.stopPropagation(); selectSegment(segment.id, toPlanRaw(event.clientX, event.clientY)); } }} role="button" tabIndex={0} onKeyDown={(event) => { if (mode === "select" && (event.key === "Enter" || event.key === " ")) selectSegment(segment.id); }}>
              <line className="segment-hit" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              <line className="segment-line" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              {selected && segment.kind === "fence" && gateEditorOpen && <g className="gate-reference-posts" pointerEvents="none" aria-label="Gate reference posts">
                <g transform={`translate(${start.xMm} ${start.yMm})`}><circle r={330 * dimensionScale} /><text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 300 * dimensionScale }}>A</text></g>
                <g transform={`translate(${end.xMm} ${end.yMm})`}><circle r={330 * dimensionScale} /><text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 300 * dimensionScale }}>B</text></g>
              </g>}
              {layers.dimensions && <g className="dimension"><line className="dimension-leader" x1={midX} y1={midY} x2={dimensionPosition.xMm} y2={dimensionPosition.yMm} style={{ strokeWidth: 26 * dimensionScale }} /><g transform={`translate(${dimensionPosition.xMm} ${dimensionPosition.yMm})`}><rect x={-dimensionWidth / 2} y={-260 * dimensionScale} width={dimensionWidth} height={520 * dimensionScale} rx={180 * dimensionScale} style={{ strokeWidth: 28 * dimensionScale }} /><text textAnchor="middle" dominantBaseline="central" style={{ fontSize: (segment.kind === "gate" ? 270 : 310) * dimensionScale }}>{dimensionText}</text></g></g>}
            </g>;
          })}
          {commandDockOpen && commandPreview && !("error" in commandPreview) && extensionAnchor && <g className="command-run-preview" pointerEvents="none" role="img" aria-label={`Precise run preview ${commandPreview.command.summary}`}>
            <line x1={extensionAnchor.xMm} y1={extensionAnchor.yMm} x2={commandPreview.endpoint.xMm} y2={commandPreview.endpoint.yMm} />
            <circle cx={commandPreview.endpoint.xMm} cy={commandPreview.endpoint.yMm} r={175 * dimensionScale} />
          </g>}
          {takeoffReady && takeoffViewEnabled && <g className="takeoff-plan" pointerEvents="none" aria-label={`${takeoffMaterial === "black-aluminum" ? "Black Aluminum" : "Treated Pine Privacy"} takeoff markers`}>
            {activeTakeoffLayout.panels.map((panel) => {
              const midX = (panel.start.xMm + panel.end.xMm) / 2; const midY = (panel.start.yMm + panel.end.yMm) / 2;
              const dx = panel.end.xMm - panel.start.xMm; const dy = panel.end.yMm - panel.start.yMm; const magnitude = Math.max(1, Math.hypot(dx, dy));
              const side = panel.panelIndex % 2 === 0 ? 1 : -1; const offset = 390 * dimensionScale * side;
              const labelX = midX - dy / magnitude * offset; const labelY = midY + dx / magnitude * offset;
              const label = `R${panel.runIndex + 1}·${panel.cut ? "CUT" : `P${panel.panelIndex + 1}`} · ${formatFeetInches(panel.lengthMm)}`;
              const labelWidth = Math.max(1_250, label.length * 165) * dimensionScale;
              return <g key={panel.id} className={`takeoff-panel${panel.cut ? " cut" : ""}`} role="img" aria-label={`${panel.cut ? "Cut" : "Full"} panel ${panel.panelIndex + 1}, ${formatFeetInches(panel.lengthMm)}`}>
                <title>{`${panel.cut ? "Cut panel" : `Panel ${panel.panelIndex + 1}`} · ${formatFeetInches(panel.lengthMm)}`}</title>
                <line x1={panel.start.xMm} y1={panel.start.yMm} x2={panel.end.xMm} y2={panel.end.yMm} style={{ strokeWidth: 74 * dimensionScale }} />
                <g className="takeoff-panel-label" transform={`translate(${labelX} ${labelY})`}><rect x={-labelWidth / 2} y={-210 * dimensionScale} width={labelWidth} height={420 * dimensionScale} rx={130 * dimensionScale} style={{ strokeWidth: 24 * dimensionScale }} /><text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 230 * dimensionScale }}>{label}</text></g>
              </g>;
            })}
            {activeTakeoffLayout.posts.map((post) => {
              const postName = post.kind === "end" ? "End post" : post.kind === "corner" ? "Corner post" : "Run post"; const postReason = takeoffPostReasonLabel(post.reason);
              return <g key={post.id} className={`takeoff-post ${post.kind}`} transform={`translate(${post.xMm} ${post.yMm})`} role="img" aria-label={`${postName}, ${postReason}`}>
                <title>{`${postName} · ${postReason}`}</title><circle r={285 * dimensionScale} style={{ strokeWidth: 66 * dimensionScale }} /><text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 245 * dimensionScale }}>{post.kind === "end" ? "E" : post.kind === "corner" ? "C" : "R"}</text>
              </g>;
            })}
          </g>}
          {mode === "draw" && previewPoint && extensionAnchor && (() => {
            const start = extensionAnchor;
            const length = Math.round(Math.hypot(previewPoint.xMm - start.xMm, previewPoint.yMm - start.yMm));
            return <g className="run-preview" pointerEvents="none" role="img" aria-label={`Live run ${formatFeetInches(length)}${snapEnabled ? ", snap on" : ", snap off"}`}>
              <line x1={start.xMm} y1={start.yMm} x2={previewPoint.xMm} y2={previewPoint.yMm} />
              <circle cx={previewPoint.xMm} cy={previewPoint.yMm} r={155 * dimensionScale} />
            </g>;
          })()}
          {design.points.map((point) => {
            const role = pointRole(design, point.id); const selected = selection?.type === "point" && selection.id === point.id;
            return <g key={point.id} className={`point ${role.replace(" ", "-")}${selected ? " selected" : ""}`} transform={`translate(${point.xMm} ${point.yMm})`} onPointerDown={(event) => startDrag(event, point.id)} role="button" tabIndex={0} aria-label={`${role} ${point.id}`}>
              <circle className="point-hit" r={460 * dimensionScale} /><circle className="point-dot" r={190 * dimensionScale} style={{ strokeWidth: (selected ? 75 : 100) * dimensionScale }} />
            </g>;
          })}
          {mode === "calibrate" && calibrationPoints.map((point, index) => <g key={`${point.xMm}-${point.yMm}-${index}`} className="calibration-point" transform={`translate(${point.xMm} ${point.yMm})`} pointerEvents="none"><circle r="230" /><line x1="-380" y1="0" x2="380" y2="0" /><line x1="0" y1="-380" x2="0" y2="380" /><text y="-470" textAnchor="middle">{index + 1}</text></g>)}
          {mode === "trace-house" && <g className="house-trace" pointerEvents="none">
            {houseTracePoints.length > 1 && <polyline points={houseTracePoints.map(({ xMm, yMm }) => `${xMm},${yMm}`).join(" ")} />}
            {houseTracePoints.map((point, index) => <g key={`${point.xMm}-${point.yMm}-${index}`} transform={`translate(${point.xMm} ${point.yMm})`}><circle r="250" /><text y="-470" textAnchor="middle">{index + 1}</text></g>)}
          </g>}
        </svg>
        {design.points.length === 0 && !design.house && !referenceBackground && <div className="empty-state"><strong>Start with one property point</strong><span>Choose Draw, then tap anywhere on the grid.</span></div>}
      </div>

      <aside className={`inspector${selection ? " has-selection" : ""}`}>
        <p className="eyebrow">Selection</p>
        {!selection && <div className="inspector-empty"><h2>No item selected</h2><p>Tap a span for exact length and gate intent. Tap or drag a point to edit the path.</p></div>}
        {houseSelected && <div><h2>House footprint</h2><p>{design.house ? "This measured footprint is visual context only and is excluded from fence totals." : "Add an optional measured house footprint before drawing the fence."}</p><h3 className="field-heading">House length</h3><div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="1" max="1000" placeholder="Required" value={houseFeet} onChange={(event) => setHouseFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={houseInches} onChange={(event) => setHouseInches(event.target.value)} /></label></div><h3 className="field-heading">House width</h3><div className="exact-grid"><label><span>Feet</span><input aria-label="Width feet" inputMode="numeric" type="number" min="1" max="1000" placeholder="Required" value={houseWidthFeet} onChange={(event) => setHouseWidthFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Width inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={houseWidthInches} onChange={(event) => setHouseWidthInches(event.target.value)} /></label></div><button className="primary wide" onClick={applyHouseLength}>{design.house ? "Update house footprint" : "Add house footprint"}</button>{design.house && <button className="danger wide" onClick={() => { commit(removeHouseReference(design), "House footprint removed."); setSelection(null); }}>Remove house footprint</button>}<small>House-edge connections stay active in free-angle mode. The optional angle assist affects only non-house points. This footprint is not a survey or building record.</small></div>}
        {selectedPoint && <div><h2>{pointRole(design, selectedPoint.id)}</h2><p className="coordinate">X {formatFeetInches(Math.abs(selectedPoint.xMm))} · Y {formatFeetInches(Math.abs(selectedPoint.yMm))}</p><p>{lengthLockEnabled ? "Drag to adjust this line's angle. Its incoming length stays fixed and only the following points on this line move." : "Drag this point freely; connected span lengths will change."}</p>{design.house && selectedPointPath && selectedPointPath.segments.length >= 2 && selectedPoint.id === selectedPointPath.points.at(-1)?.id && <button className="primary wide" onClick={() => { setMode("close"); setClosurePathPointId(selectedPoint.id); setSelection(null); setPreviewPoint(null); setNotice("Tap the second connection on the house. Closure will keep this line's measured runs fixed and redistribute only its angles."); }}>⇥ Close this line to house</button>}<button className="danger wide" onClick={removeSelection}>Delete point</button></div>}
        {selectedSegment && <div>
          <h2>{selectedSegment.kind === "gate" ? `${selectedSegment.gateType === "double" ? "Double" : "Single"} gate` : "Fence run"}</h2>
          <div className="length-readout">{formatFeetInches(segmentLengthMm(design, selectedSegment))}</div>
          {selectedSegment.kind === "gate" && <label className="select-field"><span>Gate style</span><select value={selectedSegment.gateType ?? "single"} onChange={(event) => commit(setGateType(design, selectedSegment.id, event.target.value as GateType), "Gate style updated.")}><option value="single">Single gate</option><option value="double">Double gate</option></select></label>}
          <div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="0" max="1000" value={feet} onChange={(event) => setFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={inches} onChange={(event) => setInches(event.target.value)} /></label></div>
          <button className="primary wide" onClick={applyExactLength}>Apply exact length</button>
          {selectedSegment.kind === "fence" && <>
            <button className="primary wide" onClick={() => { setGateEditorOpen((current) => !current); setNotice("The gate will stay on this straight run. Choose its details and position."); }}>{gateEditorOpen ? "Cancel add gate" : "＋ Add gate to this run"}</button>
            {gateEditorOpen && <div className="gate-editor">
              <label><span>Gate style</span><select aria-label="Gate style" value={gateType} onChange={(event) => setGateTypeChoice(event.target.value as GateType)}><option value="single">Single gate</option><option value="double">Double gate</option></select></label>
              <h3 className="field-heading">Total gate width</h3>
              <div className="exact-grid"><label><span>Feet</span><input aria-label="Gate width feet" inputMode="numeric" type="number" min="0" max="1000" placeholder="Required" value={gateFeet} onChange={(event) => setGateFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Gate width inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={gateInches} onChange={(event) => setGateInches(event.target.value)} /></label></div>
              <fieldset className="gate-reference-selector"><legend>Measure gate location from</legend><button type="button" aria-pressed={gateReferencePost === "post-a"} className={gateReferencePost === "post-a" ? "active" : ""} onClick={() => setGateReferencePost("post-a")}>Post A</button><button type="button" aria-pressed={gateReferencePost === "post-b"} className={gateReferencePost === "post-b" ? "active" : ""} onClick={() => setGateReferencePost("post-b")}>Post B</button></fieldset>
              <h3 className="field-heading">Distance from {gateReferencePost === "post-a" ? "Post A" : "Post B"} to nearest gate edge</h3>
              <div className="exact-grid"><label><span>Feet</span><input aria-label={`Distance from ${gateReferencePost === "post-a" ? "Post A" : "Post B"} feet`} inputMode="numeric" type="number" min="0" max="1000" value={gateOffsetFeet} onChange={(event) => setGateOffsetFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label={`Distance from ${gateReferencePost === "post-a" ? "Post A" : "Post B"} inches`} inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={gateOffsetInches} onChange={(event) => setGateOffsetInches(event.target.value)} /></label></div>
              <button className="primary wide" onClick={addGate}>Place gate on this run</button>
              <small>Post A and Post B are marked on the plan. Measure from the selected post to the nearest gate edge. Switching posts changes only how this draft measurement is interpreted; the fence changes only after you place the gate.</small>
            </div>}
          </>}
          <button className="wide" onClick={() => { setDimensionSideOverrides((current) => ({ ...current, [selectedSegment.id]: current[selectedSegment.id] === -1 ? 1 : -1 })); setNotice("Dimension label flipped to the other side of its run."); }}>↔ Flip dimension side</button>
          {dimensionSideOverrides[selectedSegment.id] !== undefined && <button className="wide" onClick={() => { setDimensionSideOverrides((current) => { const updated = { ...current }; delete updated[selectedSegment.id]; return updated; }); setNotice("Dimension label returned to automatic positioning."); }}>Auto-position dimension</button>}
          {selectedSegment.kind === "gate" && <><div className="gate-position-readout"><span>Fence from previous post</span><strong>{formatFeetInches(selectedGateOffsetMm)}</strong></div><button className="wide" onClick={() => commit(setSegmentKind(design, selectedSegment.id, "fence"), "Gate opening restored to fence intent.")}>Mark as fence</button></>}
          <small>Labels space themselves automatically and avoid unrelated runs when space allows. Gate placement never changes the selected run&apos;s bearing or total measured length. Gate intent supplies only the preliminary Black Aluminum opening and hardware counts; it does not choose products, labor, or pricing.</small>
        </div>}
        <div className="notice" role="status">{notice}</div>
      </aside>
    </section>
    <footer className="app-footer"><span>Reference layers: local image only · Site Walk: GPS shape + exact field lengths</span><span>{fenceLineCount(design)} line{fenceLineCount(design) === 1 ? "" : "s"} · exact combined total · local only · revision {design.revision}</span></footer>
  </main>;
}
