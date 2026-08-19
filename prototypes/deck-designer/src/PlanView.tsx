import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DeckDesignV1, DeckEdgeId } from "./model";
import type { DeckGeometry } from "./geometry";
import { dimensionsFromHandle, type PlatformDimensionUpdate, type PlatformHandle } from "./editor";

type Props = {
  design: DeckDesignV1;
  geometry: DeckGeometry;
  showFraming: boolean;
  snapIncrement: number;
  onDimensionPreview: (update: PlatformDimensionUpdate) => void;
  onDimensionCommit: (update: PlatformDimensionUpdate) => void;
  onDimensionCancel: () => void;
  selectedEdgeId: DeckEdgeId | null;
  onSelectEdge: (edgeId: DeckEdgeId) => void;
};

export function PlanView({ design, geometry, showFraming, snapIncrement, onDimensionPreview, onDimensionCommit, onDimensionCancel, selectedEdgeId, onSelectEdge }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeHandle, setActiveHandle] = useState<PlatformHandle | null>(null);
  const { width, projection } = design.platform;
  const margin = Math.max(width, projection) * 0.18;
  const projectedPoints = [
    ...geometry.footprint,
    ...geometry.stairTreads.flatMap((tread) => tread.corners),
    ...(geometry.landing?.corners ?? []),
  ];
  const minX = Math.min(...projectedPoints.map((item) => item.x));
  const maxX = Math.max(...projectedPoints.map((item) => item.x));
  const minZ = Math.min(...projectedPoints.map((item) => item.z));
  const maxZ = Math.max(...projectedPoints.map((item) => item.z));
  const viewWidth = maxX - minX + margin * 2;
  const viewHeight = maxZ - minZ + margin * 2;
  const x = (value: number) => margin + value - minX;
  const y = (value: number) => margin + value - minZ;
  const bottomDimensionY = y(maxZ) + margin * 0.48;
  const rightDimensionX = x(maxX) + margin * 0.48;
  const edgeHitPoints = (start: Readonly<{ x: number; z: number }>, end: Readonly<{ x: number; z: number }>) => {
    const hit = 6;
    if (start.z === end.z) {
      return `${x(start.x)},${y(start.z) - hit} ${x(end.x)},${y(end.z) - hit} ${x(end.x)},${y(end.z) + hit} ${x(start.x)},${y(start.z) + hit}`;
    }
    return `${x(start.x) - hit},${y(start.z)} ${x(start.x) + hit},${y(start.z)} ${x(end.x) + hit},${y(end.z)} ${x(end.x) - hit},${y(end.z)}`;
  };
  const handlePoint = (handle: PlatformHandle) => {
    if (handle === "width") {
      return { x: width, z: design.platform.kind === "l-shape" ? (projection - design.platform.cutoutDepth) / 2 : projection / 2 };
    }
    if (handle === "projection") return { x: 0, z: projection };
    return { x: width - design.platform.cutoutWidth, z: projection - design.platform.cutoutDepth };
  };
  const pointFromEvent = (event: PointerEvent<SVGCircleElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x - margin + minX, z: local.y - margin + minZ };
  };
  const updateFromPointer = (handle: PlatformHandle, event: PointerEvent<SVGCircleElement>, commit: boolean) => {
    const point = pointFromEvent(event);
    if (!point) return;
    const update = dimensionsFromHandle(design, handle, point, snapIncrement);
    if (commit) onDimensionCommit(update);
    else onDimensionPreview(update);
  };
  const nudgeHandle = (handle: PlatformHandle, event: KeyboardEvent<SVGCircleElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (handle === "width" && !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if (handle === "projection" && !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const point = handlePoint(handle);
    if (event.key === "ArrowLeft") point.x -= snapIncrement;
    if (event.key === "ArrowRight") point.x += snapIncrement;
    if (event.key === "ArrowUp") point.z -= snapIncrement;
    if (event.key === "ArrowDown") point.z += snapIncrement;
    onDimensionCommit(dimensionsFromHandle(design, handle, point, snapIncrement));
  };
  const renderHandle = (handle: PlatformHandle, label: string) => {
    const point = handlePoint(handle);
    return (
      <circle
        key={handle}
        cx={x(point.x)}
        cy={y(point.z)}
        r={activeHandle === handle ? 6 : 5}
        className={`dimension-handle${activeHandle === handle ? " active" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`${label}; drag or use arrow keys; snaps to ${snapIncrement} inches`}
        onKeyDown={(event) => nudgeHandle(handle, event)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setActiveHandle(handle);
        }}
        onPointerMove={(event) => {
          if (activeHandle === handle && event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(handle, event, false);
          }
        }}
        onPointerUp={(event) => {
          if (activeHandle !== handle) return;
          updateFromPointer(handle, event, true);
          event.currentTarget.releasePointerCapture(event.pointerId);
          setActiveHandle(null);
        }}
        onPointerCancel={() => {
          setActiveHandle(null);
          onDimensionCancel();
        }}
      />
    );
  };
  return (
    <svg
      ref={svgRef}
      className="plan-svg"
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      role="img"
      aria-label={`Measured plan of a ${width} inch by ${projection} inch ${design.platform.kind} deck`}
    >
      <defs>
        <pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#a9b4ad" strokeWidth="0.4" />
        </pattern>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 z" fill="#6b756f" />
        </marker>
      </defs>
      <rect width={viewWidth} height={viewHeight} fill="url(#grid)" />
      <rect x={x(0) - 12} y={y(0) - 8} width={width + 24} height="8" fill="#c8c2b5" />
      <text x={x(width / 2)} y={y(0) - 13} textAnchor="middle" className="plan-house-label">HOUSE / ATTACHED EDGE</text>
      <polygon
        points={geometry.footprint.map((vertex) => `${x(vertex.x)},${y(vertex.z)}`).join(" ")}
        className="plan-platform"
      />
      {geometry.surfaceBoards.map((board) => (
        <line key={board.id} x1={x(board.start.x)} y1={y(board.start.z)} x2={x(board.end.x)} y2={y(board.end.z)} className="plan-board" />
      ))}
      {showFraming && geometry.joists.map((joist) => (
        <line key={joist.id} x1={x(joist.start.x)} y1={y(joist.start.z)} x2={x(joist.end.x)} y2={y(joist.end.z)} className="plan-joist" />
      ))}
      {geometry.railSegments.map((rail) => (
        <line key={rail.id} x1={x(rail.start.x)} y1={y(rail.start.z)} x2={x(rail.end.x)} y2={y(rail.end.z)} className="plan-rail" />
      ))}
      {geometry.landing && (
        <polygon
          points={geometry.landing.corners.map((corner) => `${x(corner.x)},${y(corner.z)}`).join(" ")}
          className="plan-landing"
        />
      )}
      {geometry.landingRailSegments.map((rail) => (
        <line key={rail.id} x1={x(rail.start.x)} y1={y(rail.start.z)} x2={x(rail.end.x)} y2={y(rail.end.z)} className="plan-rail plan-landing-rail" />
      ))}
      {geometry.stairTreads.map((tread) => (
        <polygon
          key={tread.id}
          points={tread.corners.map((corner) => `${x(corner.x)},${y(corner.z)}`).join(" ")}
          className="plan-stair"
        />
      ))}
      <line x1={x(0)} y1={bottomDimensionY} x2={x(width)} y2={bottomDimensionY} className="dimension-line" />
      <text x={x(width / 2)} y={bottomDimensionY - margin * 0.06} textAnchor="middle" className="dimension-text">{formatFeetInches(width)}</text>
      <line x1={rightDimensionX} y1={y(0)} x2={rightDimensionX} y2={y(projection)} className="dimension-line" />
      <text x={rightDimensionX - margin * 0.06} y={y(projection / 2)} textAnchor="middle" className="dimension-text vertical">{formatFeetInches(projection)}</text>
      {design.platform.kind === "l-shape" && (
        <text x={x(width - design.platform.cutoutWidth / 2)} y={y(projection - design.platform.cutoutDepth / 2)} textAnchor="middle" className="cutout-label">
          CUTOUT {formatFeetInches(design.platform.cutoutWidth)} × {formatFeetInches(design.platform.cutoutDepth)}
        </text>
      )}
      {geometry.platformEdges.map((edge) => (
        <g key={`select-${edge.id}`}>
          {selectedEdgeId === edge.id && (
            <line x1={x(edge.start.x)} y1={y(edge.start.z)} x2={x(edge.end.x)} y2={y(edge.end.z)} className="plan-selected-edge" />
          )}
          <polygon
            points={edgeHitPoints(edge.start, edge.end)}
            className="plan-edge-hit"
            role="button"
            tabIndex={0}
            aria-label={`Select ${edge.label.toLowerCase()} edge, ${formatFeetInches(edge.length)}`}
            aria-pressed={selectedEdgeId === edge.id}
            onClick={() => onSelectEdge(edge.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectEdge(edge.id);
              }
            }}
          />
        </g>
      ))}
      <g className="dimension-handles" aria-label="Editable dimension handles">
        {renderHandle("width", "Width handle")}
        {renderHandle("projection", "Projection handle")}
        {design.platform.kind === "l-shape" && renderHandle("cutout", "Cutout corner handle")}
      </g>
    </svg>
  );
}

export function formatFeetInches(inches: number): string {
  const feet = Math.floor(inches / 12);
  const remainder = Math.round((inches - feet * 12) * 100) / 100;
  return `${feet}′ ${remainder}″`;
}
