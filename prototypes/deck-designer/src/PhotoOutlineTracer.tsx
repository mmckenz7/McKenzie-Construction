import { useMemo, useRef, useState, type PointerEvent } from "react";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { normalizePolygonRegion } from "./polygonRegion";
import { addBumpoutOnEdge, movePolygonCorner, movePolygonSegment } from "./polygonEditorV3";

type ReferencePhoto = Readonly<{ name: string; url: string }>;
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

export function PhotoOutlineTracer({ width, projection, photos, outer, onChange, onError }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragStart = useRef<readonly PolygonPoint[] | null>(null);
  const segmentDrag = useRef<Readonly<{ index: number; midpoint: PolygonPoint; outward: PolygonPoint }> | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const edges = useMemo(() => deriveGeometricPolygonEdges(outer), [outer]);
  const houseEdgeIndex = edges.findIndex((edge) => Math.abs(edge.start.z) < .01 && Math.abs(edge.end.z) < .01);
  const fixedHouseCorners = new Set(houseEdgeIndex < 0 ? [] : [houseEdgeIndex, (houseEdgeIndex + 1) % outer.length]);
  const minX = Math.min(0, ...outer.map((point) => point.x));
  const maxX = Math.max(width, ...outer.map((point) => point.x));
  const minZ = Math.min(0, ...outer.map((point) => point.z));
  const maxZ = Math.max(projection, ...outer.map((point) => point.z));
  const margin = Math.max(maxX - minX, maxZ - minZ, 120) * .16;
  const x = (value: number) => value - minX + margin;
  const y = (value: number) => value - minZ + margin;
  const pointFromClient = (clientX: number, clientY: number): PolygonPoint | null => {
    const matrix = svg.current?.getScreenCTM();
    if (!svg.current || !matrix) return null;
    const point = svg.current.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return Object.freeze({ x: snap(local.x + minX - margin), z: snap(local.y + minZ - margin) });
  };
  const accept = (candidate: readonly PolygonPoint[]) => {
    try { onChange(validatePhotoTrace(candidate)); onError(""); }
    catch (error) { onError(error instanceof Error ? error.message : "That outline is not valid."); }
  };
  const addOffset = (index: number) => {
    if (index === houseEdgeIndex) { onError("Keep the highlighted house line straight. Add offsets to another edge."); return; }
    try {
      const edge = edges[index];
      accept(addBumpoutOnEdge(outer, index, { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 }, snapIncrement));
    } catch (error) { onError(error instanceof Error ? error.message : "An offset cannot be added there."); }
  };
  const cancelDrag = () => { if (dragStart.current) onChange(dragStart.current); dragStart.current = null; segmentDrag.current = null; setActive(null); };

  return <div className="photo-trace-workspace">
    <section className="trace-reference">
      <strong>Reference photo</strong>
      {photos.length > 0 ? <><img src={photos[Math.min(activePhoto, photos.length - 1)].url} alt="Selected job reference" /><div className="trace-thumbnails">{photos.map((photo, index) => <button key={photo.url} className={index === activePhoto ? "active" : ""} onClick={() => setActivePhoto(index)} aria-label={`Use ${photo.name} as reference`}><img src={photo.url} alt="" /></button>)}</div></> : <div className="trace-no-photo">No photo added. You can still trace from a sketch or field notes.</div>}
      <small>Photos are visual references only. The measured plan beside them is the geometry.</small>
    </section>
    <section className="trace-plan">
      <div className="trace-plan-heading"><div><strong>Confirmed outline</strong><small>{outer.length} corners · 6-inch snap</small></div><button onClick={() => onChange(rectangleTrace(width, projection))}>Reset rectangle</button></div>
      <svg ref={svg} viewBox={`0 0 ${maxX - minX + margin * 2} ${maxZ - minZ + margin * 2}`} role="img" aria-label={`Photo-reference outline with ${outer.length} corners`}>
        <defs><pattern id="trace-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#a9b4ad" strokeWidth=".4" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#trace-grid)" />
        <polygon points={outer.map((point) => `${x(point.x)},${y(point.z)}`).join(" ")} className="trace-platform" />
        {edges.map((edge, index) => <g key={edge.id}><line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className={index === houseEdgeIndex ? "trace-house-edge" : "trace-edge"} /><line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="trace-edge-hit" role="button" tabIndex={0} aria-label={index === houseEdgeIndex ? "Straight house attachment edge" : `Add rectangular offset on edge ${index + 1}`} onClick={() => addOffset(index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); addOffset(index); } }} />{index !== houseEdgeIndex && (() => {
          const midpoint = Object.freeze({ x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 });
          return <rect x={x(midpoint.x) - 6} y={y(midpoint.z) - 6} width="12" height="12" rx="3" className="trace-segment-handle" role="button" tabIndex={0} aria-label={`Move edge ${index + 1}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = outer; segmentDrag.current = { index, midpoint, outward: edge.outward }; setActive(`segment-${index}`); }} onPointerMove={(event) => { if (active !== `segment-${index}` || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointFromClient(event.clientX, event.clientY); const origin = segmentDrag.current; if (!point || !origin) return; try { accept(movePolygonSegment(dragStart.current ?? outer, index, (point.x - origin.midpoint.x) * origin.outward.x + (point.z - origin.midpoint.z) * origin.outward.z, snapIncrement, false)); } catch { /* reject preview */ } }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); dragStart.current = null; segmentDrag.current = null; setActive(null); }} onPointerCancel={cancelDrag} />;
        })()}</g>)}
        {outer.map((point, index) => {
          const houseCorner = fixedHouseCorners.has(index);
          return <circle key={index} cx={x(point.x)} cy={y(point.z)} r="7" className={`trace-corner${houseCorner ? " house" : ""}`} role="button" tabIndex={0} aria-label={`${houseCorner ? "Move house-line" : "Move"} corner ${index + 1}`} onPointerDown={(event: PointerEvent<SVGCircleElement>) => { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = outer; setActive(`corner-${index}`); }} onPointerMove={(event: PointerEvent<SVGCircleElement>) => { if (active !== `corner-${index}` || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const next = pointFromClient(event.clientX, event.clientY); if (!next) return; const constrained = houseCorner ? Object.freeze({ x: next.x, z: 0 }) : next; try { accept(movePolygonCorner(dragStart.current ?? outer, index, constrained, false, snapIncrement)); } catch { /* reject preview */ } }} onPointerUp={(event: PointerEvent<SVGCircleElement>) => { event.currentTarget.releasePointerCapture(event.pointerId); dragStart.current = null; setActive(null); }} onPointerCancel={cancelDrag} />;
        })}
      </svg>
      <div className="trace-edge-buttons" aria-label="Add outline offset">{edges.map((edge, index) => index === houseEdgeIndex ? null : <button key={edge.id} onClick={() => addOffset(index)}>Add offset to edge {index + 1}</button>)}</div>
      <p><span className="trace-dot round" /> Drag round corner handles. <span className="trace-dot square" /> Drag square edge handles. Tap an edge to add an offset.</p>
    </section>
  </div>;
}
