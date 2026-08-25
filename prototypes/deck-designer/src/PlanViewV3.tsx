import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { stairOffsetFromPoint } from "./editor";
import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV3, StairSystemV3 } from "./modelV3";
import { formatFeetInches } from "./PlanView";
import type { HouseContextGeometry } from "./houseContextGeometry";
import { moveRectangularHole, resizeRectangularHole } from "./holeEditorV3";
import { deriveCornerAlignmentGuides } from "./polygonEditorV3";
import { beamInsetFromPointV3, effectiveBeamInsetV3 } from "./framingEditorV3";
import type { EdgeFinishGeometryV5 } from "./edgeFinishProjectionV5";

type Point = Readonly<{ x: number; z: number }>;
type ContextPlatform = Readonly<{ id: string; elevation: number; footprint: readonly Point[] }>;
type Props = {
  platform: DeckPlatformV3;
  activeStairSystem?: StairSystemV3 | null;
  geometry: DeckPlatformGeometryV3 & Partial<EdgeFinishGeometryV5>;
  houseGeometry: HouseContextGeometry;
  snapIncrement: number;
  editingEnabled?: boolean;
  selectedEdgeId: string | null;
  selectedHoleIndex?: number | null;
  contextPlatforms?: readonly ContextPlatform[];
  platformMoveEnabled?: boolean;
  onSelectEdge: (edgeId: string) => void;
  onSelectStairSystem?: (systemId: string) => void;
  onSelectLanding?: (systemId: string, landingId: string) => void;
  onSelectHouseOpening?: (openingId: string) => void;
  onSelectHole?: (index: number) => void;
  onSelectContextPlatform?: (platformId: string) => void;
  onPlatformPreview?: (delta: Point) => void;
  onPlatformCommit?: (delta: Point) => void;
  onHolePreview?: (index: number, hole: readonly Point[]) => void;
  onHoleCommit?: (index: number, hole: readonly Point[]) => void;
  onCornerPreview: (index: number, point: Point) => void;
  onCornerCommit: (index: number, point: Point, magnetic?: boolean) => void;
  onCancel: () => void;
  onStairPreview: (offset: number) => void;
  onStairCommit: (offset: number) => void;
  onSegmentPreview: (edgeIndex: number, distance: number) => void;
  onSegmentCommit: (edgeIndex: number, distance: number) => void;
  onBeamPreview?: (inset: number) => void;
  onBeamCommit?: (inset: number) => void;
  beamLines?: readonly Readonly<{ id: string; offsetFromOutside: number }>[];
  selectedBeamLineId?: string | null;
  onSelectBeamLine?: (beamLineId: string) => void;
};

const snap = (value: number, increment: number) => Math.round(value / increment) * increment;

export type StairKeyboardMove = Readonly<{ handled: boolean; offset: number }>;

export function stairKeyboardMove(
  stair: Pick<StairSystemV3, "locked" | "offset" | "width">,
  edge: Readonly<{ start: Point; end: Point; length: number }>,
  key: string,
  snapIncrement: number,
): StairKeyboardMove {
  if (stair.locked || !Number.isFinite(snapIncrement) || snapIncrement <= 0 || !Number.isFinite(edge.length) || edge.length < stair.width) {
    return Object.freeze({ handled: false, offset: stair.offset });
  }
  const dx = edge.end.x - edge.start.x, dz = edge.end.z - edge.start.z;
  const horizontal = Math.abs(dx) >= Math.abs(dz);
  const negativeKey = horizontal ? "ArrowLeft" : "ArrowUp";
  const positiveKey = horizontal ? "ArrowRight" : "ArrowDown";
  if (key !== negativeKey && key !== positiveKey) return Object.freeze({ handled: false, offset: stair.offset });
  const axisDirection = horizontal ? Math.sign(dx) : Math.sign(dz);
  if (axisDirection === 0) return Object.freeze({ handled: false, offset: stair.offset });
  const visualDirection = key === positiveKey ? 1 : -1;
  const maximum = edge.length - stair.width;
  const offset = Math.min(maximum, Math.max(0, stair.offset + visualDirection * axisDirection * snapIncrement));
  return Object.freeze({ handled: true, offset });
}

const openingHitCorners = (start: Point, end: Point, width = 18): readonly Point[] => {
  const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  const nx = -(end.z - start.z) / length * width / 2, nz = (end.x - start.x) / length * width / 2;
  return [{ x: start.x + nx, z: start.z + nz }, { x: end.x + nx, z: end.z + nz }, { x: end.x - nx, z: end.z - nz }, { x: start.x - nx, z: start.z - nz }];
};

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

export function PlanViewV3({ platform, activeStairSystem = null, geometry, houseGeometry, snapIncrement, editingEnabled = true, selectedEdgeId, selectedHoleIndex = null, contextPlatforms = [], platformMoveEnabled = false, onSelectEdge, onSelectStairSystem, onSelectLanding, onSelectHouseOpening, onSelectHole, onSelectContextPlatform, onPlatformPreview, onPlatformCommit, onHolePreview, onHoleCommit, onCornerPreview, onCornerCommit, onCancel, onStairPreview, onStairCommit, onSegmentPreview, onSegmentCommit, onBeamPreview, onBeamCommit, beamLines, selectedBeamLineId, onSelectBeamLine }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const segmentDrag = useRef<Readonly<{ index: number; midpoint: Point; outward: Point }> | null>(null);
  const holeDrag = useRef<Readonly<{ index: number; mode: "move" | number; start: Point; hole: readonly Point[] }> | null>(null);
  const platformDrag = useRef<Readonly<{ start: Point }> | null>(null);
  const beamDrag = useRef(false);
  const [active, setActive] = useState<string | null>(null);
  const activeCornerIndex = active?.startsWith("corner-") ? Number(active.slice("corner-".length)) : null;
  const alignmentGuides = activeCornerIndex === null ? null : deriveCornerAlignmentGuides(platform.region.outer, activeCornerIndex);
  const all = [...geometry.footprint, ...contextPlatforms.flatMap((item) => item.footprint), ...geometry.stairTreads.flatMap((tread) => tread.corners), ...geometry.landings.flatMap((landing) => landing.corners), ...houseGeometry.houseWallPanels.flatMap((panel) => [panel.start, panel.end])];
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
  const stair = activeStairSystem;
  const stairEdge = stair ? geometry.platformEdges.find((edge) => edge.id === stair.edgeId) ?? null : null;
  const stairCenter = stairEdge ? (() => {
    const ratio = ((stair?.offset ?? 0) + (stair?.width ?? 0) / 2) / stairEdge.length;
    return { x: stairEdge.start.x + (stairEdge.end.x - stairEdge.start.x) * ratio, z: stairEdge.start.z + (stairEdge.end.z - stairEdge.start.z) * ratio };
  })() : null;
  const stairPointer = (event: PointerEvent<SVGCircleElement>, commit: boolean) => {
    const point = localPoint(event);
    if (!point || !stairEdge || !stair) return;
    const offset = stairOffsetFromPoint(stairEdge, stair.width, point, snapIncrement);
    commit ? onStairCommit(offset) : onStairPreview(offset);
  };
  const nudgeStairs = (event: KeyboardEvent<SVGCircleElement>) => {
    if (!stairEdge || !stair) return;
    const move = stairKeyboardMove(stair, stairEdge, event.key, snapIncrement);
    if (!move.handled) return;
    event.preventDefault();
    if (move.offset !== stair.offset) onStairCommit(move.offset);
  };
  const nudgeCorner = (index: number, event: KeyboardEvent<SVGCircleElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const point = { ...platform.region.outer[index] };
    if (event.key === "ArrowLeft") point.x -= snapIncrement;
    if (event.key === "ArrowRight") point.x += snapIncrement;
    if (event.key === "ArrowUp") point.z -= snapIncrement;
    if (event.key === "ArrowDown") point.z += snapIncrement;
    onCornerCommit(index, point, false);
  };
  const segmentDistance = (event: PointerEvent<SVGRectElement>): number | null => {
    const origin = segmentDrag.current;
    const point = localPoint(event);
    if (!origin || !point) return null;
    return (point.x - origin.midpoint.x) * origin.outward.x + (point.z - origin.midpoint.z) * origin.outward.z;
  };
  const draggedHole = (event: PointerEvent<SVGCircleElement | SVGRectElement>): readonly Point[] | null => {
    const drag = holeDrag.current, pointer = localPoint(event);
    if (!drag || !pointer) return null;
    if (drag.mode === "move") {
      const dx = pointer.x - drag.start.x, dz = pointer.z - drag.start.z;
      return moveRectangularHole(drag.hole, { x: dx, z: dz });
    }
    return resizeRectangularHole(drag.hole, drag.mode, pointer);
  };
  const selectedHole = selectedHoleIndex === null ? null : platform.region.holes[selectedHoleIndex] ?? null;
  const selectedHoleCenter = selectedHole ? { x: selectedHole.reduce((sum, point) => sum + point.x, 0) / selectedHole.length, z: selectedHole.reduce((sum, point) => sum + point.z, 0) / selectedHole.length } : null;
  const platformCenter = { x: platform.region.outer.reduce((sum, point) => sum + point.x, 0) / platform.region.outer.length, z: platform.region.outer.reduce((sum, point) => sum + point.z, 0) / platform.region.outer.length };
  const platformDelta = (event: PointerEvent<SVGCircleElement>): Point | null => {
    const drag = platformDrag.current, pointer = localPoint(event);
    if (!drag || !pointer) return null;
    return { x: Math.round((pointer.x - drag.start.x) / snapIncrement) * snapIncrement, z: Math.round((pointer.z - drag.start.z) / snapIncrement) * snapIncrement };
  };
  const selectedBeam = beamLines?.find((line) => line.id === selectedBeamLineId) ?? beamLines?.[0] ?? null;
  const selectedBeamMembers = selectedBeam ? geometry.beams.filter((member) => member.id.startsWith(`${selectedBeam.id}-segment-`)) : geometry.beams;
  const beamHandleMember = selectedBeamMembers.reduce<(typeof geometry.beams)[number] | null>((longest, member) => {
    const length = Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z);
    const longestLength = longest ? Math.hypot(longest.end.x - longest.start.x, longest.end.z - longest.start.z) : -1;
    return length > longestLength ? member : longest;
  }, null);
  const beamHandle = beamHandleMember ? { x: (beamHandleMember.start.x + beamHandleMember.end.x) / 2, z: (beamHandleMember.start.z + beamHandleMember.end.z) / 2 } : null;
  const beamPointer = (event: PointerEvent<SVGCircleElement>, commit: boolean) => {
    const pointer = localPoint(event);
    if (!pointer) return;
    const inset = selectedBeam ? (() => {
      const values = platform.region.outer.map((corner) => platform.construction.decking.direction === "left_right" ? corner.z : corner.x);
      const outside = Math.max(...values), span = outside - Math.min(...values);
      const coordinate = platform.construction.decking.direction === "left_right" ? pointer.z : pointer.x;
      return Math.max(6, Math.min(span - 6, Math.round((outside - coordinate) / snapIncrement) * snapIncrement));
    })() : beamInsetFromPointV3(platform, pointer, snapIncrement);
    commit ? onBeamCommit?.(inset) : onBeamPreview?.(inset);
  };
  const nudgeHole = (mode: "move" | number, event: KeyboardEvent<SVGElement>) => {
    if (!selectedHole || selectedHoleIndex === null) return;
    const directions: Record<string, Point> = { ArrowLeft: { x: -snapIncrement, z: 0 }, ArrowRight: { x: snapIncrement, z: 0 }, ArrowUp: { x: 0, z: -snapIncrement }, ArrowDown: { x: 0, z: snapIncrement } };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = mode === "move" ? moveRectangularHole(selectedHole, direction) : resizeRectangularHole(selectedHole, mode, { x: selectedHole[mode].x + direction.x, z: selectedHole[mode].z + direction.z });
    onHoleCommit?.(selectedHoleIndex, next);
  };
  return <svg ref={ref} className="plan-svg v3-plan" viewBox={`0 0 ${maxX - minX + margin * 2} ${maxZ - minZ + margin * 2}`} role="img" aria-label={editingEnabled ? `Editable ${geometry.footprint.length}-corner deck outline` : `Side selection plan with ${geometry.platformEdges.length} deck sides`}>
    <defs><pattern id="v3-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#a9b4ad" strokeWidth=".4" /></pattern></defs>
    <rect width="100%" height="100%" fill="url(#v3-grid)" />
    {alignmentGuides && alignmentGuides.x !== null && <line x1={x(alignmentGuides.x)} y1="0" x2={x(alignmentGuides.x)} y2="100%" className="plan-alignment-guide" aria-hidden="true" />}
    {alignmentGuides && alignmentGuides.z !== null && <line x1="0" y1={y(alignmentGuides.z)} x2="100%" y2={y(alignmentGuides.z)} className="plan-alignment-guide" aria-hidden="true" />}
    {houseGeometry.houseWallPanels.map((panel) => <line key={panel.id} x1={x(panel.start.x)} y1={y(panel.start.z)} x2={x(panel.end.x)} y2={y(panel.end.z)} className="plan-house-wall" />)}
    {houseGeometry.houseOpenings.map((opening) => <line key={`${opening.wallId}-${opening.id}`} x1={x(opening.start.x)} y1={y(opening.start.z)} x2={x(opening.end.x)} y2={y(opening.end.z)} className={`plan-house-opening ${opening.kind}`} />)}
    {contextPlatforms.map((item) => <polygon key={item.id} points={item.footprint.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-context-platform" role={editingEnabled ? "button" : undefined} tabIndex={editingEnabled ? 0 : undefined} aria-label={`Edit ${item.id} at ${formatFeetInches(item.elevation)} high`} onClick={() => editingEnabled && onSelectContextPlatform?.(item.id)} onKeyDown={(event) => { if (!editingEnabled || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); onSelectContextPlatform?.(item.id); }} />)}
    <polygon points={geometry.footprint.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-platform" />
    {platform.region.holes.map((hole, index) => <polygon key={`hole-${index}`} points={hole.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className={`plan-hole${selectedHoleIndex === index ? " selected" : ""}`} role={editingEnabled ? "button" : undefined} tabIndex={editingEnabled ? 0 : undefined} aria-label={`Select cutout ${index + 1}`} onClick={() => editingEnabled && onSelectHole?.(index)} onKeyDown={(event) => { if (!editingEnabled || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); onSelectHole?.(index); }} />)}
    {geometry.surfaceBoards.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-board" />)}
    {geometry.joists.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-joist" />)}
    {geometry.beams.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className={`plan-beam${selectedBeam && member.id.startsWith(`${selectedBeam.id}-segment-`) ? " selected" : ""}`} onClick={() => { const line = beamLines?.find((candidate) => member.id.startsWith(`${candidate.id}-segment-`)); if (line) onSelectBeamLine?.(line.id); }} />)}
    {geometry.supportPosts.map((post) => <circle key={post.id} cx={x(post.x)} cy={y(post.z)} r="2.25" className="plan-support-post" />)}
    {(geometry.skirtingPanels ?? []).map((panel) => <line key={panel.id} x1={x(panel.start.x)} y1={y(panel.start.z)} x2={x(panel.end.x)} y2={y(panel.end.z)} className="plan-skirting" />)}
    {(geometry.fasciaSpans ?? []).map((span) => <line key={span.id} x1={x(span.start.x)} y1={y(span.start.z)} x2={x(span.end.x)} y2={y(span.end.z)} className="plan-fascia" />)}
    {geometry.railSegments.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-rail" />)}
    {geometry.landings.map((landing) => <polygon key={landing.id} points={landing.corners.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className={`plan-landing${activeStairSystem?.id === landing.systemId ? " selected-object" : ""}`} />)}
    {geometry.landingRailSegments.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-rail plan-landing-rail" />)}
    {geometry.stairTreads.map((tread) => <polygon key={tread.id} points={tread.corners.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className={`plan-stair${activeStairSystem?.id === tread.systemId ? " selected-object" : ""}`} />)}
    {geometry.stairRailSegments.map((member) => <line key={member.id} x1={x(member.start.x)} y1={y(member.start.z)} x2={x(member.end.x)} y2={y(member.end.z)} className="plan-stair-rail" />)}
    {editingEnabled && platformMoveEnabled && <><circle cx={x(platformCenter.x)} cy={y(platformCenter.z)} r="20" className="level-move-hit" role="button" tabIndex={0} aria-label="Move selected level in combined view" onKeyDown={(event) => { const directions: Record<string, Point> = { ArrowLeft: { x: -snapIncrement, z: 0 }, ArrowRight: { x: snapIncrement, z: 0 }, ArrowUp: { x: 0, z: -snapIncrement }, ArrowDown: { x: 0, z: snapIncrement } }; const delta = directions[event.key]; if (!delta) return; event.preventDefault(); onPlatformCommit?.(delta); }} onPointerDown={(event) => { const start = localPoint(event); if (!start) return; event.currentTarget.setPointerCapture(event.pointerId); platformDrag.current = { start }; setActive("platform-move"); }} onPointerMove={(event) => { if (!platformDrag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const delta = platformDelta(event); if (delta) onPlatformPreview?.(delta); }} onPointerUp={(event) => { if (!platformDrag.current) return; const delta = platformDelta(event); if (delta) onPlatformCommit?.(delta); event.currentTarget.releasePointerCapture(event.pointerId); platformDrag.current = null; setActive(null); }} onPointerCancel={() => { platformDrag.current = null; setActive(null); onCancel(); }} /><rect x={x(platformCenter.x) - 8} y={y(platformCenter.z) - 8} width="16" height="16" rx="4" className={`level-move-handle${active === "platform-move" ? " active" : ""}`} aria-hidden="true" pointerEvents="none" /><text x={x(platformCenter.x)} y={y(platformCenter.z) - 14} className="level-move-label" textAnchor="middle" aria-hidden="true">MOVE LEVEL</text></>}
    {geometry.platformEdges.map((edge, index) => {
      const midpoint = { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 };
      const hit = 6;
      const hitPoints = [
        { x: edge.start.x + edge.outward.x * hit, z: edge.start.z + edge.outward.z * hit },
        { x: edge.end.x + edge.outward.x * hit, z: edge.end.z + edge.outward.z * hit },
        { x: edge.end.x - edge.outward.x * hit, z: edge.end.z - edge.outward.z * hit },
        { x: edge.start.x - edge.outward.x * hit, z: edge.start.z - edge.outward.z * hit },
      ];
      return <g key={edge.id}>{selectedEdgeId === edge.id && <line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="plan-selected-edge" />}<polygon points={hitPoints.map((point) => `${x(point.x)},${y(point.z)}`).join(" ")} className="v3-edge" role="button" tabIndex={0} aria-label={`Select ${planEdgeDimensionLabel(edge).text} side`} onClick={() => onSelectEdge(edge.id)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelectEdge(edge.id); }} /></g>;
    })}
    {geometry.platformEdges.filter((edge) => platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "house_attachment")).map((edge) => <line key={`house-edge-${edge.id}`} x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="plan-house-attachment-edge" />)}
    {geometry.platformEdges.map((edge) => {
      const label = planEdgeDimensionLabel(edge);
      const labelX = x(label.x);
      const labelY = y(label.z);
      return <text key={`dimension-${edge.id}`} x={labelX} y={labelY} transform={`rotate(${label.angle} ${labelX} ${labelY})`} className="v3-edge-dimension">{label.text}</text>;
    })}
    {editingEnabled && geometry.landings.map((landing) => <polygon key={`select-${landing.id}`} points={landing.corners.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-object-hit" role="button" tabIndex={0} aria-label={`Edit landing in ${landing.systemId.replaceAll("-", " ")}`} onClick={() => onSelectLanding?.(landing.systemId, landing.landingId)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelectLanding?.(landing.systemId, landing.landingId); }} />)}
    {editingEnabled && geometry.stairTreads.map((tread) => <polygon key={`select-${tread.id}`} points={tread.corners.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-object-hit" role="button" tabIndex={0} aria-label={`Edit ${tread.systemId.replaceAll("-", " ")}`} onClick={() => onSelectStairSystem?.(tread.systemId)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelectStairSystem?.(tread.systemId); }} />)}
    {editingEnabled && geometry.platformEdges.map((edge, index) => {
      const midpoint = { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 };
      return <rect key={`segment-${index}`} x={x(midpoint.x) - 4.5} y={y(midpoint.z) - 4.5} width="9" height="9" rx="2" className={`segment-move-handle${active === `segment-${index}` ? " active" : ""}`} role="button" tabIndex={0} aria-label={`Move ${planEdgeDimensionLabel(edge).text} side; drag perpendicular to reshape attached sides`} onKeyDown={(event) => { const directions: Record<string, Point> = { ArrowLeft: { x: -1, z: 0 }, ArrowRight: { x: 1, z: 0 }, ArrowUp: { x: 0, z: -1 }, ArrowDown: { x: 0, z: 1 } }; const direction = directions[event.key]; if (!direction) return; const projection = direction.x * edge.outward.x + direction.z * edge.outward.z; if (Math.abs(projection) < .5) return; event.preventDefault(); onSegmentCommit(index, Math.sign(projection) * snapIncrement); }} onPointerDown={(event) => { onSelectEdge(edge.id); event.currentTarget.setPointerCapture(event.pointerId); segmentDrag.current = { index, midpoint, outward: edge.outward }; setActive(`segment-${index}`); }} onPointerMove={(event) => { if (active !== `segment-${index}` || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const distance = segmentDistance(event); if (distance !== null) onSegmentPreview(index, distance); }} onPointerUp={(event) => { if (active !== `segment-${index}`) return; const distance = segmentDistance(event); if (distance !== null) onSegmentCommit(index, distance); event.currentTarget.releasePointerCapture(event.pointerId); segmentDrag.current = null; setActive(null); }} onPointerCancel={() => { segmentDrag.current = null; setActive(null); onCancel(); }} />;
    })}
    {editingEnabled && selectedHole && selectedHoleIndex !== null && selectedHoleCenter && <>
      <rect x={x(selectedHoleCenter.x) - 18} y={y(selectedHoleCenter.z) - 18} width="36" height="36" rx="8" className="cutout-move-hit" role="button" tabIndex={0} aria-label={`Move cutout ${selectedHoleIndex + 1}`} onKeyDown={(event) => nudgeHole("move", event)} onPointerDown={(event) => { const start = localPoint(event); if (!start) return; event.currentTarget.setPointerCapture(event.pointerId); holeDrag.current = { index: selectedHoleIndex, mode: "move", start, hole: selectedHole }; setActive("hole-move"); }} onPointerMove={(event) => { const drag = holeDrag.current; if (drag?.index !== selectedHoleIndex || drag.mode !== "move" || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const hole = draggedHole(event); if (hole) onHolePreview?.(selectedHoleIndex, hole); }} onPointerUp={(event) => { const drag = holeDrag.current; if (drag?.index !== selectedHoleIndex || drag.mode !== "move") return; const hole = draggedHole(event); if (hole) onHoleCommit?.(selectedHoleIndex, hole); event.currentTarget.releasePointerCapture(event.pointerId); holeDrag.current = null; setActive(null); }} onPointerCancel={() => { holeDrag.current = null; setActive(null); onCancel(); }} />
      <rect x={x(selectedHoleCenter.x) - 6} y={y(selectedHoleCenter.z) - 6} width="12" height="12" rx="3" className="cutout-move-handle" aria-hidden="true" pointerEvents="none" />
      {selectedHole.map((point, cornerIndex) => <g key={`hole-handle-${cornerIndex}`}><circle cx={x(point.x)} cy={y(point.z)} r="16" className="cutout-resize-hit" role="button" tabIndex={0} aria-label={`Resize cutout ${selectedHoleIndex + 1} from corner ${cornerIndex + 1}`} onKeyDown={(event) => nudgeHole(cornerIndex, event)} onPointerDown={(event) => { const start = localPoint(event); if (!start) return; event.currentTarget.setPointerCapture(event.pointerId); holeDrag.current = { index: selectedHoleIndex, mode: cornerIndex, start, hole: selectedHole }; setActive(`hole-corner-${cornerIndex}`); }} onPointerMove={(event) => { const drag = holeDrag.current; if (drag?.index !== selectedHoleIndex || drag.mode !== cornerIndex || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const hole = draggedHole(event); if (hole) onHolePreview?.(selectedHoleIndex, hole); }} onPointerUp={(event) => { const drag = holeDrag.current; if (drag?.index !== selectedHoleIndex || drag.mode !== cornerIndex) return; const hole = draggedHole(event); if (hole) onHoleCommit?.(selectedHoleIndex, hole); event.currentTarget.releasePointerCapture(event.pointerId); holeDrag.current = null; setActive(null); }} onPointerCancel={() => { holeDrag.current = null; setActive(null); onCancel(); }} /><circle cx={x(point.x)} cy={y(point.z)} r="5.5" className="cutout-resize-handle" aria-hidden="true" pointerEvents="none" /></g>)}
    </>}
    {editingEnabled && platform.region.outer.map((point, index) => <circle key={index} cx={x(point.x)} cy={y(point.z)} r={active === `corner-${index}` ? 7 : 5.5} className="dimension-handle corner-handle" role="button" tabIndex={0} aria-label={`Editable corner at ${point.x} inches left/right and ${point.z} inches away; drag or use arrow keys`} onKeyDown={(event) => nudgeCorner(index, event)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActive(`corner-${index}`); }} onPointerMove={(event) => { if (active === `corner-${index}` && event.currentTarget.hasPointerCapture(event.pointerId)) { const point = localPoint(event); if (point) onCornerPreview(index, point); } }} onPointerUp={(event) => { if (active !== `corner-${index}`) return; const point = localPoint(event); if (point) onCornerCommit(index, point); event.currentTarget.releasePointerCapture(event.pointerId); setActive(null); }} onPointerCancel={() => { setActive(null); onCancel(); }} />)}
    {editingEnabled && stair && !stair.locked && stairCenter && <circle cx={x(stairCenter.x)} cy={y(stairCenter.z)} r={active === "stairs" ? 8 : 6.5} className="stair-move-handle" role="button" tabIndex={0} aria-label={`Move ${stair.id}, currently ${formatFeetInches(stair.offset)} from the start of its selected side; drag or use arrow keys; snaps to ${formatFeetInches(snapIncrement)}`} onKeyDown={nudgeStairs} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActive("stairs"); }} onPointerMove={(event) => { if (active === "stairs" && event.currentTarget.hasPointerCapture(event.pointerId)) stairPointer(event, false); }} onPointerUp={(event) => { if (active !== "stairs") return; stairPointer(event, true); event.currentTarget.releasePointerCapture(event.pointerId); setActive(null); }} onPointerCancel={() => { setActive(null); onCancel(); }} />}
    {editingEnabled && beamHandle && <><circle cx={x(beamHandle.x)} cy={y(beamHandle.z)} r="15" className="beam-move-hit" role="button" tabIndex={0} aria-label={`Move conceptual beam, currently ${formatFeetInches(selectedBeam?.offsetFromOutside ?? effectiveBeamInsetV3(platform))} from the outside edge`} onKeyDown={(event) => { const increaseKeys = platform.construction.decking.direction === "left_right" ? ["ArrowUp"] : ["ArrowLeft"]; const decreaseKeys = platform.construction.decking.direction === "left_right" ? ["ArrowDown"] : ["ArrowRight"]; if (!increaseKeys.includes(event.key) && !decreaseKeys.includes(event.key)) return; event.preventDefault(); const direction = increaseKeys.includes(event.key) ? 1 : -1; onBeamCommit?.((selectedBeam?.offsetFromOutside ?? effectiveBeamInsetV3(platform)) + direction * snapIncrement); }} onPointerDown={(event) => { if (selectedBeam) onSelectBeamLine?.(selectedBeam.id); event.currentTarget.setPointerCapture(event.pointerId); beamDrag.current = true; setActive("beam-move"); }} onPointerMove={(event) => { if (!beamDrag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return; beamPointer(event, false); }} onPointerUp={(event) => { if (!beamDrag.current) return; beamPointer(event, true); event.currentTarget.releasePointerCapture(event.pointerId); beamDrag.current = false; setActive(null); }} onPointerCancel={() => { beamDrag.current = false; setActive(null); onCancel(); }} /><rect x={x(beamHandle.x) - 5} y={y(beamHandle.z) - 5} width="10" height="10" rx="2" className={`beam-move-handle${active === "beam-move" ? " active" : ""}`} aria-hidden="true" pointerEvents="none" /></>}
    {editingEnabled && houseGeometry.houseOpenings.filter((opening) => opening.kind === "door").map((opening) => <polygon key={`select-${opening.wallId}-${opening.id}`} points={openingHitCorners(opening.start, opening.end).map((p) => `${x(p.x)},${y(p.z)}`).join(" ")} className="plan-house-opening-hit" role="button" tabIndex={0} aria-label={`Edit recorded door ${opening.id.replaceAll("-", " ")}`} onClick={() => onSelectHouseOpening?.(opening.id)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelectHouseOpening?.(opening.id); }} />)}
  </svg>;
}
