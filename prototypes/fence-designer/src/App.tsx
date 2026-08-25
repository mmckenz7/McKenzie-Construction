"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createHistory, pushHistory, redo, undo, type History } from "./history";
import { calibrateBackgroundTransform, fittedBackgroundTransform, moveBackgroundTransform, rotateBackgroundTransform, type PlanPosition, type ReferenceBackground } from "./background";
import {
  EMPTY_DESIGN, addPoint, closestPointOnHouseEdge, deletePoint, feetAndInchesToMm, fenceLineCount, fencePathForPoint, formatFeetInches, insertGateAtPoint, isPointAttached, isPointOnHouseEdge, movePoint, movePointWithLockedFollowing,
  pointById, pointRole, removeHouseReference, segmentLengthMm, setGateType, setHouseReference, setSegmentKind, setSegmentLengthKeepingEndMm, setSegmentLengthMm, snapPlanPosition, snapRunEndpoint, snapToFenceRun, snapToHouseEdge, solvePathBetweenFixedEndsMm, startFenceLine, totalLengthMm,
  type FenceDesign, type GateType,
} from "./model";
import { formatGpsAccuracy, gpsOriginAt, projectGpsFix, readCurrentGps, type GpsOrigin } from "./gps";
import { propertyReferenceLinks, type PropertyReferenceLinks } from "./property-reference";
import { captureReferenceDisplay, rasterizeReferenceBlob, readReferenceImageFromClipboard, referenceImageErrorMessage, type RasterizedReferenceImage } from "./reference-image";
import { loadLocalDesign, loadLocalReference, saveLocalDesign, saveLocalReference } from "./storage";
import { panView, zoomViewAt, type ViewBox } from "./view";

type Selection = Readonly<{ type: "point" | "segment"; id: string } | { type: "house" }> | null;
type Drag = Readonly<{ pointId: string; original: FenceDesign }> | null;
type Mode = "draw" | "select" | "pan" | "close" | "new-line" | "calibrate";
type ReferenceProvider = keyof PropertyReferenceLinks;
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
  const [closurePathPointId, setClosurePathPointId] = useState<string | null>(null);
  const [siteWalkActive, setSiteWalkActive] = useState(false);
  const [gpsOrigin, setGpsOrigin] = useState<GpsOrigin | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [nextGpsStartsLine, setNextGpsStartsLine] = useState(false);
  const [lastWalkSegmentId, setLastWalkSegmentId] = useState<string | null>(null);
  const [walkFeet, setWalkFeet] = useState("");
  const [walkInches, setWalkInches] = useState("0");
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [kgisAddress, setKgisAddress] = useState("");
  const [referenceBackground, setReferenceBackground] = useState<ReferenceBackground | null>(null);
  const [referenceBusy, setReferenceBusy] = useState<"capture" | "paste" | "upload" | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<readonly PlanPosition[]>([]);
  const [calibrationFeet, setCalibrationFeet] = useState("");
  const [calibrationInches, setCalibrationInches] = useState("0");
  const [layers, setLayers] = useState({ reference: true, grid: true, house: true, dimensions: true });
  const svgRef = useRef<SVGSVGElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const gpsRequestId = useRef(0);
  const activePointers = useRef(new Map<number, PlanPointer>());
  const navigationGesture = useRef<NavigationGesture>(null);
  const navigationWasActive = useRef(false);
  const design = history.present;

  const selectedSegment = selection?.type === "segment" ? design.segments.find(({ id }) => id === selection.id) ?? null : null;
  const selectedPoint = selection?.type === "point" ? design.points.find(({ id }) => id === selection.id) ?? null : null;
  const selectedPointPath = selectedPoint ? fencePathForPoint(design, selectedPoint.id) : null;
  const houseSelected = selection?.type === "house";
  const totals = useMemo(() => ({ all: totalLengthMm(design), gate: design.segments.filter(({ kind }) => kind === "gate").reduce((sum, item) => sum + segmentLengthMm(design, item), 0) }), [design]);
  const activePath = design.points.length ? fencePathForPoint(design, design.points.at(-1)!.id) : null;

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
      setDrag(null); setMode("select"); setSelection(null); setGateEditorOpen(false); setPreviewPoint(null); setClosurePathPointId(null); setSiteWalkActive(false); setGpsBusy(false); setNextGpsStartsLine(false); setCalibrationPoints([]);
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
    const anchor = design.points.at(-1);
    const placement = placementAt(clientX, clientY, anchor?.id);
    if (!anchor || !snapEnabled || placement.connection) return placement.point;
    return snapRunEndpoint(anchor, placement.point, true);
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
  const addAt = (event: ReactPointerEvent<SVGSVGElement>) => {
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
    const anchor = design.points.at(-1);
    if (anchor && point.xMm === anchor.xMm && point.yMm === anchor.yMm) { setNotice("Choose a different location for the next fence point."); return; }
    const id = nextId.current++;
    const next = addPoint(design, { id: `point-${id}`, ...point }, `segment-${id}`);
    commit(next, next.points.length === 1 ? "Start point placed. Add another point to create a measured span." : "Measured span added.");
    setPreviewPoint(point);
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
  const selectSegment = (id: string) => {
    const segment = design.segments.find((item) => item.id === id);
    if (!segment) return;
    const totalInches = Math.round(segmentLengthMm(design, segment) / 25.4);
    setFeet(String(Math.floor(totalInches / 12)));
    setInches(String(totalInches % 12));
    setGateEditorOpen(false); setSelection({ type: "segment", id }); setMode("select"); setNotice("Span selected. Enter an exact length or edit its gate intent.");
  };
  const startDrag = (event: ReactPointerEvent, pointId: string) => {
    if (mode === "pan" || mode === "close" || mode === "draw" || mode === "new-line" || mode === "calibrate" || event.metaKey) return;
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
    if (lengthLockEnabled && snapEnabled && !placement.connection && pointIndex > 0) location = snapRunEndpoint(path.points[pointIndex - 1], location, true);
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
    if (!selectedPoint) return;
    try {
      const width = feetAndInchesToMm(Number(gateFeet), Number(gateInches));
      const id = nextId.current;
      const next = insertGateAtPoint(design, selectedPoint.id, width, gateType, `point-${id}`, `segment-${id}`);
      nextId.current += 1;
      const gate = next.segments.find(({ id: segmentId }) => segmentId === `segment-${id}`)
        ?? next.segments.find(({ fromPointId, kind }) => fromPointId === selectedPoint.id && kind === "gate");
      commit(next, `${gateType === "double" ? "Double" : "Single"} gate added with a total opening of ${formatFeetInches(width)}.`);
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
  const markGpsPoint = async () => {
    const requestId = ++gpsRequestId.current;
    setGpsBusy(true); setNotice("Getting a fresh high-accuracy GPS position…");
    try {
      const fix = await readCurrentGps(navigator.geolocation);
      if (requestId !== gpsRequestId.current) return;
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
        setSelection({ type: "point", id: `point-${id}` }); setView(fittedView(next));
        return;
      }
      let point = projectGpsFix(gpsOrigin, fix);
      let connection: "house" | "fence" | null = null;
      const connectionToleranceMm = Math.max(460, Math.min(3_000, Math.round(fix.accuracyMeters * 1_000)));
      const houseConnection = snapToHouseEdge(point.xMm, point.yMm, design.house, connectionToleranceMm);
      const activeAnchor = design.points.at(-1);
      const fenceConnection = houseConnection ? null : snapToFenceRun(design, point.xMm, point.yMm, connectionToleranceMm, nextGpsStartsLine ? undefined : activeAnchor?.id);
      if (houseConnection) { point = houseConnection; connection = "house"; }
      else if (fenceConnection) { point = { xMm: fenceConnection.xMm, yMm: fenceConnection.yMm }; connection = "fence"; }
      else if (activeAnchor && snapEnabled && !nextGpsStartsLine) point = snapRunEndpoint(activeAnchor, point, true);
      if (activeAnchor && !nextGpsStartsLine && point.xMm === activeAnchor.xMm && point.yMm === activeAnchor.yMm) throw new RangeError("This GPS fix is at the last point. Walk to the next corner and try again.");
      const id = nextId.current++;
      const pointId = `point-${id}`; const segmentId = `segment-${id}`;
      const next = nextGpsStartsLine ? startFenceLine(design, { id: pointId, ...point }) : addPoint(design, { id: pointId, ...point }, segmentId);
      commit(next, `${nextGpsStartsLine ? "Separate GPS fence line started" : "GPS point marked"}${connection ? ` and attached to the ${connection === "house" ? "house" : "nearest fence run"}` : ""}. Reported phone accuracy: ${formatGpsAccuracy(fix.accuracyMeters)}.`);
      setNextGpsStartsLine(false); setSelection({ type: "point", id: pointId }); setView(fittedView(next));
      const addedSegment = next.segments.find(({ id: candidateId }) => candidateId === segmentId);
      if (addedSegment) {
        const totalInches = Math.round(segmentLengthMm(next, addedSegment) / 25.4);
        setLastWalkSegmentId(segmentId); setWalkFeet(String(Math.floor(totalInches / 12))); setWalkInches(String(totalInches % 12));
      } else setLastWalkSegmentId(null);
    } catch (error) {
      if (requestId === gpsRequestId.current) setNotice(error instanceof Error ? error.message : "The GPS point could not be marked.");
    } finally { if (requestId === gpsRequestId.current) setGpsBusy(false); }
  };
  const applyWalkLength = () => {
    if (!lastWalkSegmentId) return;
    try {
      const result = editSegmentToExactLength(lastWalkSegmentId, walkFeet, walkInches);
      commit(result.next, `Last GPS run corrected to the field measurement ${formatFeetInches(result.length)}. The entered measurement is now authoritative.`);
      setView(fittedView(result.next));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Enter a valid field measurement."); }
  };
  const toggleSiteWalk = () => {
    if (siteWalkActive) {
      gpsRequestId.current += 1; setGpsBusy(false); setSiteWalkActive(false); setNextGpsStartsLine(false); setNotice("Site Walk finished. GPS coordinates were converted to local plan geometry only.");
    } else {
      setSiteWalkActive(true); setMode("select"); setPreviewPoint(null); setSelection(null); setNotice(gpsOrigin ? "Site Walk ready. Walk to the next corner and mark it." : design.points.length ? "Stand at the last drawn point and set the GPS reference." : "Stand at the first fence point and mark the starting GPS position.");
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
      gpsRequestId.current += 1; setGpsOrigin(null); setGpsAccuracyMeters(null); setLastWalkSegmentId(null); setSiteWalkActive(false); setGpsBusy(false);
      setHistory(createHistory(loaded)); setReferenceBackground(loadedReference); nextId.current = nextNumericId(loaded); setSelection(null); setGateEditorOpen(false); setClosurePathPointId(null); setMode("select"); setView(fittedView(loaded)); setNotice(loadedReference ? "Saved fence layout and reference image loaded. Start Site Walk at the last point to align a new GPS session." : "Saved local layout loaded. Start Site Walk at the last point to align a new GPS session.");
    } catch (error) { setNotice(error instanceof Error ? `Saved layout was not opened: ${error.message}` : "Saved layout was not opened."); }
  };

  return <main className="fence-designer">
    <header className="app-header">
      <div><p className="eyebrow">McKenzie OS · isolated prototype</p><h1>Fence Visual Measure</h1><p>Draw perimeter and divider lines. Measurements stay local and contain no pricing or product rules.</p></div>
      <div className="total-card"><span>Total measured length</span><strong>{formatFeetInches(totals.all)}</strong><small>{design.segments.length} span{design.segments.length === 1 ? "" : "s"} · {fenceLineCount(design)} fence line{fenceLineCount(design) === 1 ? "" : "s"}{totals.gate ? ` · ${formatFeetInches(totals.gate)} gate intent` : ""}</small></div>
    </header>

    <nav className="toolbar" aria-label="Drawing controls">
      <div className="segmented"><button className={mode === "draw" ? "active" : ""} onClick={() => { setMode("draw"); setSelection(null); setClosurePathPointId(null); setNotice("Draw continues from the last point. Use Start separate line to begin somewhere else."); }}>＋ Draw</button><button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}>↖ Edit</button><button className={mode === "pan" ? "active" : ""} onClick={() => { setMode("pan"); setSelection(null); setNotice("Drag the plan to move around. Pinch with two fingers to zoom."); }}>✋ Pan</button></div>
      <button className={mode === "new-line" ? "active-tool" : ""} onClick={() => { setMode("new-line"); setSelection(null); setClosurePathPointId(null); setPreviewPoint(null); setNotice("Tap anywhere to start a separate fence line. Tap near an existing run to connect partway along it."); }}>＋ Separate line</button>
      <button disabled={history.past.length === 0} onClick={() => { setHistory(undo); setSelection(null); setNotice("Undid the last change."); }}>↶ Undo</button>
      <button disabled={history.future.length === 0} onClick={() => { setHistory(redo); setSelection(null); setNotice("Redid the change."); }}>↷ Redo</button>
      <div className="zoom-controls" aria-label="Plan zoom"><button aria-label="Zoom out" onClick={() => zoomAt(1.25)}>−</button><span>{Math.round(DEFAULT_VIEW.width / view.width * 100)}%</span><button aria-label="Zoom in" onClick={() => zoomAt(0.8)}>＋</button></div>
      <button onClick={() => setView(fittedView(design))}>Fit plan</button>
      <button className={houseSelected ? "active-tool" : ""} onClick={selectHouse}>{design.house ? "⌂ House" : "＋ House"}</button>
      <button disabled={!design.house || !activePath || activePath.segments.length < 2} className={mode === "close" ? "active-tool" : ""} onClick={() => { setMode("close"); setSelection(null); setClosurePathPointId(design.points.at(-1)?.id ?? null); setPreviewPoint(null); setNotice("Tap the second connection on the house. Closure will keep this line's measured runs fixed and redistribute only its angles."); }}>⇥ Close to house</button>
      <button aria-pressed={snapEnabled} className={snapEnabled ? "active-tool" : ""} onClick={() => { setSnapEnabled((current) => !current); setPreviewPoint(null); setNotice(snapEnabled ? "Free angle is on. Runs now follow the measured geometry without angle assumptions." : "45°/90° angle assist is on."); }}>{snapEnabled ? "⌁ 45°/90° assist" : "◌ Free angle"}</button>
      <button aria-pressed={lengthLockEnabled} className={lengthLockEnabled ? "active-tool" : ""} onClick={() => { setLengthLockEnabled((current) => !current); setNotice(lengthLockEnabled ? "Length lock is off. Dragging a point can now change connected measurements." : "Length lock is on. Dragging adjusts the angle while preserving the incoming and following measurements."); }}>{lengthLockEnabled ? "🔒 Lengths" : "🔓 Lengths"}</button>
      <button aria-pressed={siteWalkActive} className={siteWalkActive ? "active-tool" : ""} onClick={toggleSiteWalk}>📍 Site walk</button>
      <button aria-pressed={propertyPanelOpen} className={propertyPanelOpen ? "active-tool" : ""} onClick={() => setPropertyPanelOpen((current) => !current)}>⌖ Property</button>
      <span className="toolbar-spacer" />
      <button onClick={save}>Save local</button><button onClick={load}>Load local</button>
    </nav>

    {(siteWalkActive || propertyPanelOpen) && <section className="field-panels" aria-label="Field measurement tools">
      {siteWalkActive && <div className="field-panel site-walk-panel">
        <div className="field-panel-heading"><div><p className="eyebrow">Site walk</p><h2>Mark the point where you are standing</h2></div>{gpsAccuracyMeters !== null && <span className={`accuracy-chip${gpsAccuracyMeters <= 5 ? " good" : ""}`}>{formatGpsAccuracy(gpsAccuracyMeters)} GPS</span>}</div>
        <p>{!gpsOrigin ? (design.points.length ? "Stand at the last drawn point first. This aligns GPS to the existing plan without adding a duplicate point." : "Stand at the first fence point. Your first mark creates the local plan origin.") : nextGpsStartsLine ? "Walk to the starting point for the separate fence line, then mark it." : "Walk to the next corner or connection, stand still, then mark it."}</p>
        <div className="field-actions">
          <button className="primary mark-location" disabled={gpsBusy} onClick={markGpsPoint}>{gpsBusy ? "Getting GPS…" : !gpsOrigin && design.points.length ? "Set GPS reference here" : nextGpsStartsLine ? "Mark separate-line start" : design.points.length ? "Mark next fence point" : "Mark starting point"}</button>
          <button disabled={gpsBusy || !gpsOrigin} className={nextGpsStartsLine ? "active-tool" : ""} onClick={() => { setNextGpsStartsLine((current) => !current); setNotice(nextGpsStartsLine ? "Separate-line start canceled." : "The next GPS mark will start a separate fence line instead of continuing the last one."); }}>{nextGpsStartsLine ? "Cancel separate line" : "＋ Separate line next"}</button>
          <button onClick={toggleSiteWalk}>Finish site walk</button>
        </div>
        {lastWalkSegmentId && design.segments.some(({ id }) => id === lastWalkSegmentId) && <div className="walk-length-editor">
          <div><strong>Correct the last GPS run</strong><span>Enter the tape, wheel, or laser measurement.</span></div>
          <div className="exact-grid"><label><span>Feet</span><input aria-label="Site walk exact feet" inputMode="numeric" type="number" min="0" max="1000" value={walkFeet} onChange={(event) => setWalkFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Site walk exact inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={walkInches} onChange={(event) => setWalkInches(event.target.value)} /></label></div>
          <button className="primary" onClick={applyWalkLength}>Use exact length</button>
        </div>}
        <small>Phone GPS establishes approximate shape only. Accuracy is the phone’s reported radius, not a guarantee. Exact entered lengths remain authoritative; no latitude or longitude is saved in the design.</small>
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
            <div className="reference-actions"><button disabled={referenceBackground.locked} onClick={fitReference}>Fit image to view</button><button aria-pressed={referenceBackground.locked} className={referenceBackground.locked ? "active-tool" : ""} onClick={() => setReferenceBackground({ ...referenceBackground, locked: !referenceBackground.locked })}>{referenceBackground.locked ? "🔒 Image locked" : "🔓 Lock image"}</button><button className="danger" onClick={() => { setReferenceBackground(null); saveLocalReference(localStorage, null); setCalibrationPoints([]); if (mode === "calibrate") setMode("select"); setNotice("Local reference image removed. Fence measurements were not changed."); }}>Remove image</button></div>
          </>}
        </div>
        <small>Reference imagery and GIS lines are not a boundary survey. Google stays a separate viewer. Captured images never leave this browser, are compressed for local use, and are saved with Save local so the design can be reopened on this same device. They are never included in fence totals.</small>
      </div>}
    </section>}

    <section className="workspace">
      <div className="canvas-shell">
        <div className="canvas-key"><span><i className="key-dot endpoint" /> Open endpoint</span><span><i className="key-dot attached" /> Connected endpoint</span><span><i className="key-dot corner" /> Corner</span><span><i className="key-line preview" /> Live run</span><span><i className="key-line gate" /> Gate intent</span></div>
        <svg ref={svgRef} className={`plan-canvas ${mode}${isNavigating ? " navigating" : ""}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={startNavigation} onPointerMove={moveCanvasPointer} onPointerLeave={() => { if (!drag && !isNavigating) setPreviewPoint(null); }} onPointerUp={endNavigation} onPointerCancel={endNavigation} aria-label="Fence drawing plan">
          <defs><pattern id="grid" width={GRID_MM} height={GRID_MM} patternUnits="userSpaceOnUse"><path d={`M ${GRID_MM} 0 L 0 0 0 ${GRID_MM}`} fill="none" stroke="#d8ddd7" strokeWidth="18" /></pattern></defs>
          {referenceBackground && layers.reference && (() => {
            const transform = referenceBackground.transform;
            const centerX = transform.xMm + transform.widthMm / 2; const centerY = transform.yMm + transform.heightMm / 2;
            return <image className="reference-image" href={referenceBackground.src} x={transform.xMm} y={transform.yMm} width={transform.widthMm} height={transform.heightMm} opacity={referenceBackground.opacity} preserveAspectRatio="none" transform={`rotate(${transform.rotationDegrees} ${centerX} ${centerY})`} pointerEvents="none" aria-label={`Local reference image ${referenceBackground.name}`} />;
          })()}
          {layers.grid && <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" pointerEvents="none" />}
          {design.house && layers.house && <g className={`house-reference${houseSelected ? " selected" : ""}`} role="button" tabIndex={0} aria-label={`House footprint ${formatFeetInches(design.house.lengthMm)} by ${formatFeetInches(design.house.widthMm)}`} onPointerDown={(event) => { if (mode === "close") { event.stopPropagation(); closeAt(event); } else if (mode !== "pan" && mode !== "new-line" && mode !== "calibrate" && !event.metaKey) { event.stopPropagation(); selectHouse(); } }}>
            <rect className="house-hit" x={design.house.xMm} y={design.house.yMm} width={design.house.lengthMm} height={design.house.widthMm} />
            <rect className="house-footprint" x={design.house.xMm} y={design.house.yMm} width={design.house.lengthMm} height={design.house.widthMm} />
            <g transform={`translate(${design.house.xMm + design.house.lengthMm / 2} ${design.house.yMm + design.house.widthMm / 2})`} className="house-label"><rect x="-1050" y="-300" width="2100" height="600" rx="180" /><text textAnchor="middle" dominantBaseline="central">HOUSE · {formatFeetInches(design.house.lengthMm)} × {formatFeetInches(design.house.widthMm)}</text></g>
          </g>}
          {design.segments.map((segment) => {
            const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
            const midX = (start.xMm + end.xMm) / 2; const midY = (start.yMm + end.yMm) / 2;
            const selected = selection?.type === "segment" && selection.id === segment.id;
            return <g key={segment.id} className={`segment ${segment.kind}${selected ? " selected" : ""}`} onPointerDown={(event) => { if (mode === "select" && !event.metaKey) { event.stopPropagation(); selectSegment(segment.id); } }} role="button" tabIndex={0} onKeyDown={(event) => { if (mode === "select" && (event.key === "Enter" || event.key === " ")) selectSegment(segment.id); }}>
              <line className="segment-hit" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              <line className="segment-line" x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} />
              {layers.dimensions && <g transform={`translate(${midX} ${midY})`} className="dimension"><rect x="-760" y="-260" width="1520" height="520" rx="180" /><text textAnchor="middle" dominantBaseline="central">{segment.kind === "gate" ? `${segment.gateType === "double" ? "DOUBLE" : "SINGLE"} GATE · ` : ""}{formatFeetInches(segmentLengthMm(design, segment))}</text></g>}
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
          {mode === "calibrate" && calibrationPoints.map((point, index) => <g key={`${point.xMm}-${point.yMm}-${index}`} className="calibration-point" transform={`translate(${point.xMm} ${point.yMm})`} pointerEvents="none"><circle r="230" /><line x1="-380" y1="0" x2="380" y2="0" /><line x1="0" y1="-380" x2="0" y2="380" /><text y="-470" textAnchor="middle">{index + 1}</text></g>)}
        </svg>
        {design.points.length === 0 && !design.house && !referenceBackground && <div className="empty-state"><strong>Start with one property point</strong><span>Choose Draw, then tap anywhere on the grid.</span></div>}
      </div>

      <aside className="inspector">
        <p className="eyebrow">Selection</p>
        {!selection && <div className="inspector-empty"><h2>No item selected</h2><p>Tap a span for exact length and gate intent. Tap or drag a point to edit the path.</p></div>}
        {houseSelected && <div><h2>House footprint</h2><p>{design.house ? "This measured footprint is visual context only and is excluded from fence totals." : "Add an optional measured house footprint before drawing the fence."}</p><h3 className="field-heading">House length</h3><div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="1" max="1000" placeholder="Required" value={houseFeet} onChange={(event) => setHouseFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={houseInches} onChange={(event) => setHouseInches(event.target.value)} /></label></div><h3 className="field-heading">House width</h3><div className="exact-grid"><label><span>Feet</span><input aria-label="Width feet" inputMode="numeric" type="number" min="1" max="1000" placeholder="Required" value={houseWidthFeet} onChange={(event) => setHouseWidthFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Width inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={houseWidthInches} onChange={(event) => setHouseWidthInches(event.target.value)} /></label></div><button className="primary wide" onClick={applyHouseLength}>{design.house ? "Update house footprint" : "Add house footprint"}</button>{design.house && <button className="danger wide" onClick={() => { commit(removeHouseReference(design), "House footprint removed."); setSelection(null); }}>Remove house footprint</button>}<small>House-edge connections stay active in free-angle mode. The optional angle assist affects only non-house points. This footprint is not a survey or building record.</small></div>}
        {selectedPoint && <div><h2>{pointRole(design, selectedPoint.id)}</h2><p className="coordinate">X {formatFeetInches(Math.abs(selectedPoint.xMm))} · Y {formatFeetInches(Math.abs(selectedPoint.yMm))}</p><p>{lengthLockEnabled ? "Drag to adjust this line's angle. Its incoming length stays fixed and only the following points on this line move." : "Drag this point freely; connected span lengths will change."}</p>{design.house && selectedPointPath && selectedPointPath.segments.length >= 2 && selectedPoint.id === selectedPointPath.points.at(-1)?.id && <button className="primary wide" onClick={() => { setMode("close"); setClosurePathPointId(selectedPoint.id); setSelection(null); setPreviewPoint(null); setNotice("Tap the second connection on the house. Closure will keep this line's measured runs fixed and redistribute only its angles."); }}>⇥ Close this line to house</button>}<button className="primary wide" onClick={() => { setGateEditorOpen((current) => !current); setNotice("Choose single or double, then enter the total gate opening width."); }}>{gateEditorOpen ? "Cancel add gate" : "＋ Add gate"}</button>{gateEditorOpen && <div className="gate-editor"><label><span>Gate style</span><select aria-label="Gate style" value={gateType} onChange={(event) => setGateTypeChoice(event.target.value as GateType)}><option value="single">Single gate</option><option value="double">Double gate</option></select></label><h3 className="field-heading">Total gate width</h3><div className="exact-grid"><label><span>Feet</span><input aria-label="Gate width feet" inputMode="numeric" type="number" min="0" max="1000" placeholder="Required" value={gateFeet} onChange={(event) => setGateFeet(event.target.value)} /></label><label><span>Inches</span><input aria-label="Gate width inches" inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={gateInches} onChange={(event) => setGateInches(event.target.value)} /></label></div><button className="primary wide" onClick={addGate}>Place gate from this point</button><small>The total width is the full opening. A double gate is recorded as two-leaf intent only.</small></div>}<button className="danger wide" onClick={removeSelection}>Delete point</button></div>}
        {selectedSegment && <div><h2>{selectedSegment.kind === "gate" ? `${selectedSegment.gateType === "double" ? "Double" : "Single"} gate` : "Fence span"}</h2><div className="length-readout">{formatFeetInches(segmentLengthMm(design, selectedSegment))}</div>{selectedSegment.kind === "gate" && <label className="select-field"><span>Gate style</span><select value={selectedSegment.gateType ?? "single"} onChange={(event) => commit(setGateType(design, selectedSegment.id, event.target.value as GateType), "Gate style updated.")}><option value="single">Single gate</option><option value="double">Double gate</option></select></label>}<div className="exact-grid"><label><span>Feet</span><input inputMode="numeric" type="number" min="0" max="1000" value={feet} onChange={(event) => setFeet(event.target.value)} /></label><label><span>Inches</span><input inputMode="decimal" type="number" min="0" max="11.99" step="0.25" value={inches} onChange={(event) => setInches(event.target.value)} /></label></div><button className="primary wide" onClick={applyExactLength}>Apply exact length</button><button className="wide" onClick={() => commit(setSegmentKind(design, selectedSegment.id, selectedSegment.kind === "gate" ? "fence" : "gate"), selectedSegment.kind === "gate" ? "Span restored to fence intent." : "Whole span marked as a single gate.")}>{selectedSegment.kind === "gate" ? "Mark as fence" : "Mark whole span as single gate"}</button><small>Gate intent does not imply products, posts, hardware, or pricing.</small></div>}
        <div className="notice" role="status">{notice}</div>
      </aside>
    </section>
    <footer className="app-footer"><span>Reference layers: local image only · Site Walk: GPS shape + exact field lengths</span><span>{fenceLineCount(design)} line{fenceLineCount(design) === 1 ? "" : "s"} · exact combined total · local only · revision {design.revision}</span></footer>
  </main>;
}
