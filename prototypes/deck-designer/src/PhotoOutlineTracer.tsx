import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { normalizePolygonRegion } from "./polygonRegion";
import { addBumpoutOnEdge, movePolygonCorner, movePolygonSegment } from "./polygonEditorV3";

type ReferencePhoto = Readonly<{ name: string; url: string }>;
type TraceSelection = Readonly<{ kind: "corner" | "segment"; index: number }> | null;
type ViewBounds = Readonly<{ minX: number; minZ: number; margin: number; width: number; height: number }>;
type Props = Readonly<{
  width: number;
  projection: number;
  photos: readonly ReferencePhoto[];
  outer: readonly PolygonPoint[];
  onChange: (outer: readonly PolygonPoint[]) => void;
  onError: (message: string) => void;
}>;

const snapIncrement = 6;
const snap = (value: number) => Math.round(value / snapIncrement) * snapIncrement;
const feet = (inches: number) => Math.round(inches / 12 * 100) / 100;
const formatLength = (inches: number) => {
  const wholeFeet = Math.floor(Math.abs(inches) / 12);
  const remainingInches = Math.round(Math.abs(inches) - wholeFeet * 12);
  return `${inches < 0 ? "−" : ""}${wholeFeet}′ ${remainingInches}″`;
};

export function rectangleTrace(width: number, projection: number): readonly PolygonPoint[] {
  return Object.freeze([
    Object.freeze({ x: 0, z: 0 }), Object.freeze({ x: width, z: 0 }),
    Object.freeze({ x: width, z: projection }), Object.freeze({ x: 0, z: projection }),
  ]);
}

export function isRectangleTrace(outer: readonly PolygonPoint[], width: number, projection: number): boolean {
  const rectangle = rectangleTrace(width, projection);
  return outer.length === rectangle.length && outer.every((point, index) =>
    Math.abs(point.x - rectangle[index].x) < .01 && Math.abs(point.z - rectangle[index].z) < .01);
}

function mergeCollinearTraceCorners(outer: readonly PolygonPoint[]): readonly PolygonPoint[] {
  const merged = [...outer];
  let changed = true;
  while (changed && merged.length > 3) {
    changed = false;
    for (let index = 0; index < merged.length; index += 1) {
      const previous = merged[(index - 1 + merged.length) % merged.length];
      const current = merged[index];
      const next = merged[(index + 1) % merged.length];
      const cross = (current.x - previous.x) * (next.z - current.z) - (current.z - previous.z) * (next.x - current.x);
      if (Math.abs(cross) < .01) {
        merged.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return Object.freeze(merged.map((point) => Object.freeze({ ...point })));
}

export function validatePhotoTrace(outer: readonly PolygonPoint[]): readonly PolygonPoint[] {
  const normalized = normalizePolygonRegion({ outer: mergeCollinearTraceCorners(outer), holes: [] }).outer;
  const houseEdges = deriveGeometricPolygonEdges(normalized).filter((edge) => Math.abs(edge.start.z) < .01 && Math.abs(edge.end.z) < .01);
  if (houseEdges.length !== 1) {
    throw new RangeError("The outline must keep one straight edge along the house line.");
  }
  return normalized;
}

export function moveTraceCornerToFeet(outer: readonly PolygonPoint[], index: number, xFeet: number, zFeet: number, constrainHouseLine = false): readonly PolygonPoint[] {
  if (!Number.isFinite(xFeet) || !Number.isFinite(zFeet)) throw new TypeError("Corner dimensions must be finite feet.");
  return validatePhotoTrace(movePolygonCorner(outer, index, { x: snap(xFeet * 12), z: constrainHouseLine ? 0 : snap(zFeet * 12) }, true, 0));
}

export function moveTraceSegmentToFeet(outer: readonly PolygonPoint[], index: number, positionFeet: number): readonly PolygonPoint[] {
  if (!Number.isFinite(positionFeet)) throw new TypeError("Edge position must be finite feet.");
  const edge = deriveGeometricPolygonEdges(outer)[index];
  if (!edge) throw new RangeError("Choose an existing edge before entering its position.");
  const horizontal = Math.abs(edge.end.x - edge.start.x) >= Math.abs(edge.end.z - edge.start.z);
  const current = horizontal ? edge.start.z : edge.start.x;
  const component = horizontal ? edge.outward.z : edge.outward.x;
  if (Math.abs(component) < .5) throw new RangeError("The selected edge direction is not supported.");
  return validatePhotoTrace(movePolygonSegment(outer, index, (snap(positionFeet * 12) - current) / component, snapIncrement, true));
}

export function PhotoOutlineTracer({ width, projection, photos, outer, onChange, onError }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragStart = useRef<readonly PolygonPoint[] | null>(null);
  const segmentDrag = useRef<Readonly<{ index: number; midpoint: PolygonPoint; outward: PolygonPoint }> | null>(null);
  const activeDrag = useRef<string | null>(null);
  const frozenView = useRef<ViewBounds | null>(null);
  const undoStack = useRef<readonly (readonly PolygonPoint[])[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [selection, setSelection] = useState<TraceSelection>(null);
  const [undoCount, setUndoCount] = useState(0);
  useEffect(() => { undoStack.current = []; setUndoCount(0); setSelection(null); }, [width, projection]);
  const edges = useMemo(() => deriveGeometricPolygonEdges(outer), [outer]);
  const houseEdgeIndex = edges.findIndex((edge) => Math.abs(edge.start.z) < .01 && Math.abs(edge.end.z) < .01);
  const fixedHouseCorners = new Set(houseEdgeIndex < 0 ? [] : [houseEdgeIndex, (houseEdgeIndex + 1) % outer.length]);
  const minX = Math.min(0, ...outer.map((point) => point.x));
  const maxX = Math.max(width, ...outer.map((point) => point.x));
  const minZ = Math.min(0, ...outer.map((point) => point.z));
  const maxZ = Math.max(projection, ...outer.map((point) => point.z));
  const margin = Math.max(maxX - minX, maxZ - minZ, 120) * .24;
  const computedView: ViewBounds = { minX, minZ, margin, width: maxX - minX + margin * 2, height: maxZ - minZ + margin * 2 };
  const view = active && frozenView.current ? frozenView.current : computedView;
  const x = (value: number) => value - view.minX + view.margin;
  const y = (value: number) => value - view.minZ + view.margin;
  const pointFromClient = (clientX: number, clientY: number): PolygonPoint | null => {
    const matrix = svg.current?.getScreenCTM();
    if (!svg.current || !matrix) return null;
    const point = svg.current.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return Object.freeze({ x: snap(local.x + view.minX - view.margin), z: snap(local.y + view.minZ - view.margin) });
  };
  const remember = (snapshot = outer) => {
    const frozen = Object.freeze(snapshot.map((point) => Object.freeze({ ...point })));
    const previous = undoStack.current[undoStack.current.length - 1];
    if (previous && JSON.stringify(previous) === JSON.stringify(frozen)) return;
    undoStack.current = Object.freeze([...undoStack.current.slice(-39), frozen]);
    setUndoCount(undoStack.current.length);
  };
  const undo = () => {
    const previous = undoStack.current[undoStack.current.length - 1];
    if (!previous) return;
    undoStack.current = Object.freeze(undoStack.current.slice(0, -1));
    setUndoCount(undoStack.current.length);
    setSelection(null);
    onChange(previous);
    onError("");
  };
  const accept = (candidate: readonly PolygonPoint[]): boolean => {
    try { onChange(validatePhotoTrace(candidate)); onError(""); return true; }
    catch (error) { onError(error instanceof Error ? error.message : "That outline is not valid."); return false; }
  };
  const addOffset = (index: number) => {
    if (index === houseEdgeIndex) { onError("Keep the highlighted house line straight. Add offsets to another edge."); return; }
    try {
      const edge = edges[index];
      const accepted = accept(addBumpoutOnEdge(outer, index, { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 }, snapIncrement));
      if (accepted) remember(outer);
      setSelection(null);
    } catch (error) { onError(error instanceof Error ? error.message : "An offset cannot be added there."); }
  };
  const endDrag = () => { dragStart.current = null; segmentDrag.current = null; activeDrag.current = null; frozenView.current = null; setActive(null); };
  const cancelDrag = () => { if (dragStart.current) onChange(dragStart.current); endDrag(); };
  const selectedCorner = selection?.kind === "corner" ? outer[selection.index] : undefined;
  const selectedEdge = selection?.kind === "segment" ? edges[selection.index] : undefined;
  const selectedHouseCorner = selection?.kind === "corner" && fixedHouseCorners.has(selection.index);
  const setCornerFeet = (axis: "x" | "z", value: number) => {
    if (!selectedCorner || !Number.isFinite(value) || selection?.kind !== "corner") return;
    const xFeet = axis === "x" ? value : feet(selectedCorner.x);
    const zFeet = axis === "z" ? value : feet(selectedCorner.z);
    try { onChange(moveTraceCornerToFeet(outer, selection.index, xFeet, zFeet, selectedHouseCorner)); onError(""); }
    catch (error) { onError(error instanceof Error ? error.message : "That corner position is not valid."); }
  };
  const segmentDescription = (edge: (typeof edges)[number]) => {
    const horizontal = Math.abs(edge.end.x - edge.start.x) >= Math.abs(edge.end.z - edge.start.z);
    return `${formatLength(edge.length)} ${horizontal ? "horizontal" : "vertical"} segment`;
  };

  return <div className="photo-trace-workspace">
    <section className="trace-reference">
      <strong>Reference photo</strong>
      {photos.length > 0 ? <><img src={photos[Math.min(activePhoto, photos.length - 1)].url} alt="Selected job reference" /><div className="trace-thumbnails">{photos.map((photo, index) => <button key={photo.url} className={index === activePhoto ? "active" : ""} onClick={() => setActivePhoto(index)} aria-label={`Use ${photo.name} as reference`}><img src={photo.url} alt="" /></button>)}</div></> : <div className="trace-no-photo">No photo added. You can still trace from a sketch or field notes.</div>}
      <small>Photos are visual references only. The measured plan beside them is the geometry.</small>
    </section>
    <section className="trace-plan">
      <div className="trace-plan-heading"><div><strong>Confirmed outline</strong><small>{outer.length} corners · 6-inch snap</small></div><div className="trace-heading-actions"><button disabled={undoCount === 0} onClick={undo}>Undo{undoCount > 0 ? ` (${undoCount})` : ""}</button><button onClick={() => { remember(outer); setSelection(null); onChange(rectangleTrace(width, projection)); }}>Reset rectangle</button></div></div>
      <svg ref={svg} viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={`Photo-reference outline with ${outer.length} corners`}>
        <defs><pattern id="trace-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#a9b4ad" strokeWidth=".4" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#trace-grid)" />
        <polygon points={outer.map((point) => `${x(point.x)},${y(point.z)}`).join(" ")} className="trace-platform" />
        {edges.map((edge, index) => {
          const labelX = (edge.start.x + edge.end.x) / 2;
          const labelZ = (edge.start.z + edge.end.z) / 2;
          return <g key={`trace-edge-${index}`}><line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className={index === houseEdgeIndex ? "trace-house-edge" : "trace-edge"} /><text x={x(labelX)} y={y(labelZ) - 8} className="trace-dimension-label">{formatLength(edge.length)}</text><line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="trace-edge-hit" role="button" tabIndex={0} aria-label={index === houseEdgeIndex ? "Straight house attachment edge" : `Add offset on ${segmentDescription(edge)}`} onClick={() => addOffset(index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); addOffset(index); } }} />{index !== houseEdgeIndex && (() => {
          const midpoint = Object.freeze({ x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 });
          return <rect x={x(midpoint.x) - 6} y={y(midpoint.z) - 6} width="12" height="12" rx="3" className={`trace-segment-handle${selection?.kind === "segment" && selection.index === index ? " selected" : ""}`} role="button" tabIndex={0} aria-label={`Move ${segmentDescription(edge)}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); remember(outer); frozenView.current = computedView; dragStart.current = outer; segmentDrag.current = { index, midpoint, outward: edge.outward }; activeDrag.current = `segment-${index}`; setSelection({ kind: "segment", index }); setActive(`segment-${index}`); }} onPointerMove={(event) => { if (activeDrag.current !== `segment-${index}` || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointFromClient(event.clientX, event.clientY); const origin = segmentDrag.current; if (!point || !origin) return; try { accept(movePolygonSegment(dragStart.current ?? outer, index, (point.x - origin.midpoint.x) * origin.outward.x + (point.z - origin.midpoint.z) * origin.outward.z, snapIncrement, false)); } catch { /* reject preview */ } }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); endDrag(); }} onPointerCancel={cancelDrag} />;
        })()}</g>;
        })}
        {outer.map((point, index) => {
          const houseCorner = fixedHouseCorners.has(index);
          return <circle key={index} cx={x(point.x)} cy={y(point.z)} r="7" className={`trace-corner${houseCorner ? " house" : ""}${selection?.kind === "corner" && selection.index === index ? " selected" : ""}`} role="button" tabIndex={0} aria-label={`${houseCorner ? "Move house-line" : "Move"} corner ${index + 1}`} onPointerDown={(event: PointerEvent<SVGCircleElement>) => { event.currentTarget.setPointerCapture(event.pointerId); remember(outer); frozenView.current = computedView; dragStart.current = outer; activeDrag.current = `corner-${index}`; setSelection({ kind: "corner", index }); setActive(`corner-${index}`); }} onPointerMove={(event: PointerEvent<SVGCircleElement>) => { if (activeDrag.current !== `corner-${index}` || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const next = pointFromClient(event.clientX, event.clientY); if (!next) return; const constrained = houseCorner ? Object.freeze({ x: next.x, z: 0 }) : next; try { accept(movePolygonCorner(dragStart.current ?? outer, index, constrained, false, snapIncrement)); } catch { /* reject preview */ } }} onPointerUp={(event: PointerEvent<SVGCircleElement>) => { event.currentTarget.releasePointerCapture(event.pointerId); endDrag(); }} onPointerCancel={cancelDrag} />;
        })}
      </svg>
      {(selectedCorner || selectedEdge) && <div className="trace-dimension-editor">
        {selectedCorner && selection?.kind === "corner" && <><div><strong>Corner {selection.index + 1}</strong><small>Measured from the original left house corner.</small></div><label><span>Along house (ft)</span><input type="number" step="0.5" value={feet(selectedCorner.x)} onFocus={() => remember(outer)} onChange={(event) => { if (event.target.value !== "") setCornerFeet("x", Number(event.target.value)); }} /></label><label><span>Away from house (ft)</span><input type="number" step="0.5" disabled={selectedHouseCorner} value={feet(selectedCorner.z)} onFocus={() => remember(outer)} onChange={(event) => { if (event.target.value !== "") setCornerFeet("z", Number(event.target.value)); }} /></label></>}
        {selectedEdge && selection?.kind === "segment" && <><div><strong>Selected segment</strong><small>Drag the white square to move both end corners together.</small></div><div className="trace-length-readout"><span>Length</span><strong>{formatLength(selectedEdge.length)}</strong></div></>}
      </div>}
      <div className="trace-edge-buttons" aria-label="Add outline offset">{edges.map((edge, index) => index === houseEdgeIndex ? null : <button key={edge.id} onClick={() => addOffset(index)}>Add offset · {segmentDescription(edge)}</button>)}</div>
      <p><span className="trace-dot round" /> Round corners move freely. <span className="trace-dot square" /> White squares move both ends of a segment together. Measurements appear after selection.</p>
    </section>
  </div>;
}
