import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { stairOffsetFromPoint } from "./editor";
import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV3 } from "./modelV3";

type Point = Readonly<{ x: number; z: number }>;
type Props = {
  platform: DeckPlatformV3;
  geometry: DeckPlatformGeometryV3;
  snapIncrement: number;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string) => void;
  onCornerPreview: (index: number, point: Point) => void;
  onCornerCommit: (index: number, point: Point) => void;
  onCancel: () => void;
  onStairPreview: (offset: number) => void;
  onStairCommit: (offset: number) => void;
};

const snap = (value: number, increment: number) => Math.round(value / increment) * increment;

export function PlanViewV3({ platform, geometry, snapIncrement, selectedEdgeId, onSelectEdge, onCornerPreview, onCornerCommit, onCancel, onStairPreview, onStairCommit }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const all = [...geometry.footprint, ...geometry.stairTreads.flatMap((tread) => tread.corners), ...(geometry.landing?.corners ?? [])];
  const minX = Math.min(...all.map((point) => point.x));
  const maxX = Math.max(...all.map((point) => point.x));
  const minZ = Math.min(...all.map((point) => point.z));
  const maxZ = Math.max(...all.map((point) => point.z));
  const margin = Math.max(maxX - minX, maxZ - minZ, 120) * .16;
  const x = (value: number) => value - minX + margin;
  const y = (value: number) => value - minZ + margin;
  const localPoint = (event: PointerEvent<SVGCircleElement>): Point | null => {
    const matrix = ref.current?.getScreenCTM();
    if (!ref.current || !matrix) return null;
    const point = ref.current.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: snap(local.x + minX - margin, snapIncrement), z: snap(local.y + minZ - margin, snapIncrement) };
  };
  const stair = platform.construction.stairs;
  const stairEdge = geometry.platformEdges.find((edge) => edge.id === stair.edgeId) ?? null;
  const stairCenter = stairEdge ? (() => {
    const ratio = (stair.offset + stair.width / 2) / stairEdge.length;
    return { x: stairEdge.start.x + (stairEdge.end.x - stairEdge.start.x) * ratio, z: stairEdge.start.z + (stairEdge.end.z - stairEdge.start.z) * ratio };
  })() : null;
  const stairPointer = (event: PointerEvent<SVGCircleElement>, commit: boolean) => {
    const point = localPoint(event);
    if (!point || !stairEdge) return;
    const offset = stairOffsetFromPoint(stairEdge, stair.width, point, snapIncrement);
    commit ? onStairCommit(offset) : onStairPreview(offset);
  };
  const nudgeCorner = (index: number, event: KeyboardEvent<SVGCircleElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const point = { ...platform.region.outer[index] };
    if (event.key === "ArrowLeft") point.x -= snapIncrement;
    if (event.key === "ArrowRight") point.x += snapIncrement;
    if (event.key === "ArrowUp") point.z -= snapIncrement;
    if (event.key === "ArrowDown") point.z += snapIncrement;
    onCornerCommit(index, point);
  };
  return <svg ref={ref} className="plan-svg v3-plan" viewBox={`0 0 ${maxX - minX + margin * 2} ${maxZ - minZ + margin * 2}`} role="img" aria-label={`Editable ${geometry.footprint.length}-corner deck outline`}>
    <defs><pattern id="v3-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#a9b4ad" strokeWidth=".4" /></pattern></defs>
    <rect width="100%" height="100%" fill="url(#v3-grid)" />
    <polygon points={geometry.footprint.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-platform" />
    {geometry.surfaceBoards.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-board" />)}
    {geometry.joists.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-joist" />)}
    {geometry.railSegments.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-rail" />)}
    {geometry.stairTreads.map((tread) => <polygon key={tread.id} points={tread.corners.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-stair" />)}
    {geometry.platformEdges.map((edge) => <line key={edge.id} x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className={selectedEdgeId === edge.id ? "plan-selected-edge v3-edge" : "v3-edge"} onClick={() => onSelectEdge(edge.id)} />)}
    {platform.region.outer.map((point, index) => <circle key={index} cx={x(point.x)} cy={y(point.z)} r={active === `corner-${index}` ? 7 : 5.5} className="dimension-handle corner-handle" role="button" tabIndex={0} aria-label={`Corner ${index + 1}, ${point.x} inches left/right and ${point.z} inches away; drag or use arrow keys`} onKeyDown={(event) => nudgeCorner(index, event)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActive(`corner-${index}`); }} onPointerMove={(event) => { if (active === `corner-${index}` && event.currentTarget.hasPointerCapture(event.pointerId)) { const point = localPoint(event); if (point) onCornerPreview(index, point); } }} onPointerUp={(event) => { if (active !== `corner-${index}`) return; const point = localPoint(event); if (point) onCornerCommit(index, point); event.currentTarget.releasePointerCapture(event.pointerId); setActive(null); }} onPointerCancel={() => { setActive(null); onCancel(); }} />)}
    {stair.enabled && stairCenter && <circle cx={x(stairCenter.x)} cy={y(stairCenter.z)} r={active === "stairs" ? 8 : 6.5} className="stair-move-handle" role="button" tabIndex={0} aria-label="Move stairs along selected geometric edge" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActive("stairs"); }} onPointerMove={(event) => { if (active === "stairs" && event.currentTarget.hasPointerCapture(event.pointerId)) stairPointer(event, false); }} onPointerUp={(event) => { if (active !== "stairs") return; stairPointer(event, true); event.currentTarget.releasePointerCapture(event.pointerId); setActive(null); }} onPointerCancel={() => { setActive(null); onCancel(); }} />}
  </svg>;
}
