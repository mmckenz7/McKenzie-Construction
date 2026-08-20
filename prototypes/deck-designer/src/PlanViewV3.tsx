import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { stairOffsetFromPoint } from "./editor";
import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV3 } from "./modelV3";
import { formatFeetInches } from "./PlanView";
import type { HouseContextGeometry } from "./houseContextGeometry";

type Point = Readonly<{ x: number; z: number }>;
type Props = {
  platform: DeckPlatformV3;
  geometry: DeckPlatformGeometryV3;
  houseGeometry: HouseContextGeometry;
  snapIncrement: number;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string) => void;
  onCornerPreview: (index: number, point: Point) => void;
  onCornerCommit: (index: number, point: Point) => void;
  onCancel: () => void;
  onStairPreview: (offset: number) => void;
  onStairCommit: (offset: number) => void;
  onSegmentPreview: (edgeIndex: number, distance: number) => void;
  onSegmentCommit: (edgeIndex: number, distance: number) => void;
};

const snap = (value: number, increment: number) => Math.round(value / increment) * increment;

export function planEdgeDimensionLabel(edge: Readonly<{ start: Point; end: Point; length: number; outward: Point }>, offset = 18) {
  const rawAngle = Math.atan2(edge.end.z - edge.start.z, edge.end.x - edge.start.x) * 180 / Math.PI;
  const angle = rawAngle > 90 ? rawAngle - 180 : rawAngle < -90 ? rawAngle + 180 : rawAngle;
  return Object.freeze({
    x: (edge.start.x + edge.end.x) / 2 + edge.outward.x * offset,
    z: (edge.start.z + edge.end.z) / 2 + edge.outward.z * offset,
    angle,
    text: formatFeetInches(edge.length),
  });
}

export function PlanViewV3({ platform, geometry, houseGeometry, snapIncrement, selectedEdgeId, onSelectEdge, onCornerPreview, onCornerCommit, onCancel, onStairPreview, onStairCommit, onSegmentPreview, onSegmentCommit }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const segmentDrag = useRef<Readonly<{ index: number; midpoint: Point; outward: Point }> | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const all = [...geometry.footprint, ...geometry.stairTreads.flatMap((tread) => tread.corners), ...(geometry.landing?.corners ?? []), ...houseGeometry.houseWallPanels.flatMap((panel) => [panel.start, panel.end])];
  const minX = Math.min(...all.map((point) => point.x));
  const maxX = Math.max(...all.map((point) => point.x));
  const minZ = Math.min(...all.map((point) => point.z));
  const maxZ = Math.max(...all.map((point) => point.z));
  const margin = Math.max(maxX - minX, maxZ - minZ, 120) * .16;
  const x = (value: number) => value - minX + margin;
  const y = (value: number) => value - minZ + margin;
  const pointFromClient = (clientX: number, clientY: number): Point | null => {
    const matrix = ref.current?.getScreenCTM();
    if (!ref.current || !matrix) return null;
    const point = ref.current.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: snap(local.x + minX - margin, snapIncrement), z: snap(local.y + minZ - margin, snapIncrement) };
  };
  const localPoint = (event: PointerEvent<SVGCircleElement | SVGRectElement>): Point | null => pointFromClient(event.clientX, event.clientY);
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
  const segmentDistance = (event: PointerEvent<SVGRectElement>): number | null => {
    const origin = segmentDrag.current;
    const point = localPoint(event);
    if (!origin || !point) return null;
    return (point.x - origin.midpoint.x) * origin.outward.x + (point.z - origin.midpoint.z) * origin.outward.z;
  };
  return <svg ref={ref} className="plan-svg v3-plan" viewBox={`0 0 ${maxX - minX + margin * 2} ${maxZ - minZ + margin * 2}`} role="img" aria-label={`Editable ${geometry.footprint.length}-corner deck outline`}>
    <defs><pattern id="v3-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#a9b4ad" strokeWidth=".4" /></pattern></defs>
    <rect width="100%" height="100%" fill="url(#v3-grid)" />
    {houseGeometry.houseWallPanels.map((panel) => <line key={panel.id} x1={x(panel.start.x)} y1={y(panel.start.z)} x2={x(panel.end.x)} y2={y(panel.end.z)} className="plan-house-wall" />)}
    {houseGeometry.houseOpenings.map((opening) => <line key={`${opening.wallId}-${opening.id}`} x1={x(opening.start.x)} y1={y(opening.start.z)} x2={x(opening.end.x)} y2={y(opening.end.z)} className={`plan-house-opening ${opening.kind}`} />)}
    <polygon points={geometry.footprint.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-platform" />
    {geometry.surfaceBoards.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-board" />)}
    {geometry.joists.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-joist" />)}
    {geometry.railSegments.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-rail" />)}
    {geometry.stairTreads.map((tread) => <polygon key={tread.id} points={tread.corners.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-stair" />)}
    {geometry.platformEdges.map((edge, index) => {
      const midpoint = { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 };
      const hit = 6;
      const hitPoints = [
        { x: edge.start.x + edge.outward.x * hit, z: edge.start.z + edge.outward.z * hit },
        { x: edge.end.x + edge.outward.x * hit, z: edge.end.z + edge.outward.z * hit },
        { x: edge.end.x - edge.outward.x * hit, z: edge.end.z - edge.outward.z * hit },
        { x: edge.start.x - edge.outward.x * hit, z: edge.start.z - edge.outward.z * hit },
      ];
      return <g key={edge.id}>{selectedEdgeId === edge.id && <line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="plan-selected-edge" />}<polygon points={hitPoints.map((point) => `${x(point.x)},${y(point.z)}`).join(" ")} className="v3-edge" role="button" tabIndex={0} aria-label={`Select segment ${index + 1}`} onClick={() => onSelectEdge(edge.id)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelectEdge(edge.id); }} /></g>;
    })}
    {geometry.platformEdges.filter((edge) => platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "house_attachment")).map((edge) => <line key={`house-edge-${edge.id}`} x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="plan-house-attachment-edge" />)}
    {geometry.platformEdges.map((edge) => {
      const label = planEdgeDimensionLabel(edge);
      const labelX = x(label.x);
      const labelY = y(label.z);
      return <text key={`dimension-${edge.id}`} x={labelX} y={labelY} transform={`rotate(${label.angle} ${labelX} ${labelY})`} className="v3-edge-dimension">{label.text}</text>;
    })}
    {geometry.platformEdges.map((edge, index) => {
      const midpoint = { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 };
      return <rect key={`segment-${index}`} x={x(midpoint.x) - 4.5} y={y(midpoint.z) - 4.5} width="9" height="9" rx="2" className={`segment-move-handle${active === `segment-${index}` ? " active" : ""}`} role="button" tabIndex={0} aria-label={`Move segment ${index + 1}; drag perpendicular to reshape attached segments`} onKeyDown={(event) => { const directions: Record<string, Point> = { ArrowLeft: { x: -1, z: 0 }, ArrowRight: { x: 1, z: 0 }, ArrowUp: { x: 0, z: -1 }, ArrowDown: { x: 0, z: 1 } }; const direction = directions[event.key]; if (!direction) return; const projection = direction.x * edge.outward.x + direction.z * edge.outward.z; if (Math.abs(projection) < .5) return; event.preventDefault(); onSegmentCommit(index, Math.sign(projection) * snapIncrement); }} onPointerDown={(event) => { onSelectEdge(edge.id); event.currentTarget.setPointerCapture(event.pointerId); segmentDrag.current = { index, midpoint, outward: edge.outward }; setActive(`segment-${index}`); }} onPointerMove={(event) => { if (active !== `segment-${index}` || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const distance = segmentDistance(event); if (distance !== null) onSegmentPreview(index, distance); }} onPointerUp={(event) => { if (active !== `segment-${index}`) return; const distance = segmentDistance(event); if (distance !== null) onSegmentCommit(index, distance); event.currentTarget.releasePointerCapture(event.pointerId); segmentDrag.current = null; setActive(null); }} onPointerCancel={() => { segmentDrag.current = null; setActive(null); onCancel(); }} />;
    })}
    {platform.region.outer.map((point, index) => <circle key={index} cx={x(point.x)} cy={y(point.z)} r={active === `corner-${index}` ? 7 : 5.5} className="dimension-handle corner-handle" role="button" tabIndex={0} aria-label={`Corner ${index + 1}, ${point.x} inches left/right and ${point.z} inches away; drag or use arrow keys`} onKeyDown={(event) => nudgeCorner(index, event)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActive(`corner-${index}`); }} onPointerMove={(event) => { if (active === `corner-${index}` && event.currentTarget.hasPointerCapture(event.pointerId)) { const point = localPoint(event); if (point) onCornerPreview(index, point); } }} onPointerUp={(event) => { if (active !== `corner-${index}`) return; const point = localPoint(event); if (point) onCornerCommit(index, point); event.currentTarget.releasePointerCapture(event.pointerId); setActive(null); }} onPointerCancel={() => { setActive(null); onCancel(); }} />)}
    {stair.enabled && stairCenter && <circle cx={x(stairCenter.x)} cy={y(stairCenter.z)} r={active === "stairs" ? 8 : 6.5} className="stair-move-handle" role="button" tabIndex={0} aria-label="Move stairs along selected geometric edge" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActive("stairs"); }} onPointerMove={(event) => { if (active === "stairs" && event.currentTarget.hasPointerCapture(event.pointerId)) stairPointer(event, false); }} onPointerUp={(event) => { if (active !== "stairs") return; stairPointer(event, true); event.currentTarget.releasePointerCapture(event.pointerId); setActive(null); }} onPointerCancel={() => { setActive(null); onCancel(); }} />}
  </svg>;
}
