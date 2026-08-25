import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";

export type EdgeFinishSpanV5 = Readonly<{
  id: string;
  edgeId: string;
  start: PolygonPoint;
  end: PolygonPoint;
}>;

export type SkirtingPanelV5 = EdgeFinishSpanV5 & Readonly<{
  bottom: number;
  top: number;
}>;

export type EdgeFinishGeometryV5 = Readonly<{
  fasciaSpans: readonly EdgeFinishSpanV5[];
  skirtingPanels: readonly SkirtingPanelV5[];
}>;

function spansAroundStairs(
  edge: ReturnType<typeof deriveGeometricPolygonEdges>[number],
  openings: readonly Readonly<{ start: number; end: number }>[],
): readonly Readonly<{ start: PolygonPoint; end: PolygonPoint }>[] {
  const dx = (edge.end.x - edge.start.x) / edge.length;
  const dz = (edge.end.z - edge.start.z) / edge.length;
  const onEdge = (distance: number): PolygonPoint => Object.freeze({ x: edge.start.x + dx * distance, z: edge.start.z + dz * distance });
  const spans: Readonly<{ start: PolygonPoint; end: PolygonPoint }>[] = [];
  let cursor = 0;
  for (const opening of openings) {
    if (opening.start > cursor) spans.push(Object.freeze({ start: onEdge(cursor), end: onEdge(opening.start) }));
    cursor = Math.max(cursor, opening.end);
  }
  if (cursor < edge.length) spans.push(Object.freeze({ start: onEdge(cursor), end: edge.end }));
  return Object.freeze(spans);
}

export function deriveEdgeFinishGeometryV5(design: DeckDesignV5, platformId: string): EdgeFinishGeometryV5 {
  const normalized = normalizeDeckDesignV5(design);
  const platform = normalized.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new RangeError(`Platform ${platformId} does not exist.`);
  const edges = new Map(deriveGeometricPolygonEdges(platform.region.outer).map((edge) => [edge.id, edge]));
  const fasciaSpans: EdgeFinishSpanV5[] = [];
  const skirtingPanels: SkirtingPanelV5[] = [];
  for (const finish of platform.construction.edgeFinishes) {
    const edge = edges.get(finish.edgeId)!;
    const openings = platform.construction.stairSystems
      .filter((system) => system.edgeId === edge.id)
      .map((system) => ({ start: system.offset, end: system.offset + system.width }))
      .sort((left, right) => left.start - right.start);
    const spans = spansAroundStairs(edge, openings);
    spans.forEach((span, index) => {
      if (finish.fasciaEnabled) fasciaSpans.push(Object.freeze({ id: `fascia-${edge.id}-span-${index + 1}`, edgeId: edge.id, ...span }));
      if (finish.skirtingEnabled) skirtingPanels.push(Object.freeze({
        id: `skirting-${edge.id}-span-${index + 1}`,
        edgeId: edge.id,
        ...span,
        bottom: normalized.siteContext.gradeElevation,
        top: platform.elevation,
      }));
    });
  }
  return Object.freeze({ fasciaSpans: Object.freeze(fasciaSpans), skirtingPanels: Object.freeze(skirtingPanels) });
}
