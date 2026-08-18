import type { DeckDesignV1 } from "./model";
import type { DeckGeometry } from "./geometry";

type Props = { design: DeckDesignV1; geometry: DeckGeometry; showFraming: boolean };

export function PlanView({ design, geometry, showFraming }: Props) {
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
  return (
    <svg
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
    </svg>
  );
}

export function formatFeetInches(inches: number): string {
  const feet = Math.floor(inches / 12);
  const remainder = Math.round((inches - feet * 12) * 100) / 100;
  return `${feet}′ ${remainder}″`;
}
