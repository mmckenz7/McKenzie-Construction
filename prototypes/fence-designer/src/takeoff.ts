import { MM_PER_FOOT, fencePathForPoint, pointById, pointRole, segmentLengthMm, type FenceDesign, type GateType } from "./model";

export const BLACK_ALUMINUM_PANEL_LENGTH_MM = Math.round(8 * MM_PER_FOOT);
const BLACK_ALUMINUM_PANEL_LENGTH_INCHES = 96;

export type GateOpeningTakeoff = Readonly<{ gateType: GateType; widthMm: number; count: number }>;
export type BlackAluminumTakeoff = Readonly<{
  fenceLengthMm: number;
  panelCount: number;
  endPosts: number;
  cornerPosts: number;
  linePosts: number;
  singleGates: number;
  doubleGates: number;
  hinges: number;
  latches: number;
  centerDropPoles: number;
  gateOpenings: readonly GateOpeningTakeoff[];
  warnings: readonly string[];
}>;

function endpointIds(design: FenceDesign) {
  const incoming = new Set(design.segments.map(({ toPointId }) => toPointId));
  const outgoing = new Set(design.segments.map(({ fromPointId }) => fromPointId));
  return design.points.filter(({ id }) => !incoming.has(id) || !outgoing.has(id)).map(({ id }) => id);
}

type MidRunConnection = Readonly<{ pointId: string; segmentId: string; position: number }>;
type RunConnection = Readonly<{ pointId: string; offsetMm: number }>;
type StraightFenceRun = Readonly<{ lengthMm: number; connections: readonly RunConnection[] }>;

function pointPositionInsideSegment(design: FenceDesign, pointId: string, segmentId: string, toleranceMm = 2): number | null {
  const point = pointById(design, pointId);
  const segment = design.segments.find(({ id }) => id === segmentId);
  if (!segment || segment.kind !== "fence" || segment.fromPointId === pointId || segment.toPointId === pointId) return null;
  const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
  const dx = end.xMm - start.xMm; const dy = end.yMm - start.yMm;
  const squaredLength = dx ** 2 + dy ** 2;
  if (squaredLength === 0) return null;
  const position = ((point.xMm - start.xMm) * dx + (point.yMm - start.yMm) * dy) / squaredLength;
  if (position <= 0 || position >= 1) return null;
  const projectedX = start.xMm + position * dx; const projectedY = start.yMm + position * dy;
  return Math.hypot(projectedX - point.xMm, projectedY - point.yMm) <= toleranceMm ? position : null;
}

function findMidRunConnections(design: FenceDesign): readonly MidRunConnection[] {
  return endpointIds(design).flatMap((pointId) => design.segments.flatMap((segment) => {
    const position = pointPositionInsideSegment(design, pointId, segment.id);
    return position === null ? [] : [{ pointId, segmentId: segment.id, position }];
  }));
}

function panelCountForLength(lengthMm: number) {
  const measuredInches = Math.round(lengthMm / (MM_PER_FOOT / 12));
  return Math.ceil(measuredInches / BLACK_ALUMINUM_PANEL_LENGTH_INCHES);
}

function straightFenceRuns(design: FenceDesign, midRunConnections: readonly MidRunConnection[]): readonly StraightFenceRun[] {
  const connectionsBySegment = new Map<string, MidRunConnection[]>();
  midRunConnections.forEach((connection) => connectionsBySegment.set(connection.segmentId, [...(connectionsBySegment.get(connection.segmentId) ?? []), connection]));
  const runs: StraightFenceRun[] = [];
  const incomingIds = new Set(design.segments.map(({ toPointId }) => toPointId));
  design.points.filter(({ id }) => !incomingIds.has(id)).forEach((root) => {
    const path = fencePathForPoint(design, root.id);
    let lengthMm = 0; let connections: RunConnection[] = [];
    const flush = () => {
      if (lengthMm > 0) runs.push(Object.freeze({ lengthMm, connections: Object.freeze(connections) }));
      lengthMm = 0; connections = [];
    };
    path.segments.forEach((segment, index) => {
      if (segment.kind === "gate") {
        flush();
        return;
      }
      const segmentLength = segmentLengthMm(design, segment);
      (connectionsBySegment.get(segment.id) ?? []).forEach((connection) => connections.push({ pointId: connection.pointId, offsetMm: lengthMm + Math.round(segmentLength * connection.position) }));
      lengthMm += segmentLength;
      const next = path.segments[index + 1];
      if (!next || next.kind === "gate" || pointRole(design, segment.toPointId) === "corner") flush();
    });
  });
  return Object.freeze(runs);
}

function naturalConnectionPointIds(run: StraightFenceRun): readonly string[] {
  if (!run.connections.length) return [];
  const totalInches = Math.round(run.lengthMm / (MM_PER_FOOT / 12));
  const availablePanels = Math.ceil(totalInches / BLACK_ALUMINUM_PANEL_LENGTH_INCHES);
  const positionGroups = new Map<number, string[]>();
  run.connections.forEach(({ pointId, offsetMm }) => {
    const positionInches = Math.round(offsetMm / (MM_PER_FOOT / 12));
    positionGroups.set(positionInches, [...(positionGroups.get(positionInches) ?? []), pointId]);
  });
  const positions = [...positionGroups.keys()].filter((position) => position > 0 && position < totalInches).sort((first, second) => first - second);
  type LayoutState = Readonly<{ lastPosition: number; panelsUsed: number; selected: readonly number[] }>;
  let states: readonly LayoutState[] = [{ lastPosition: 0, panelsUsed: 0, selected: [] }];
  positions.forEach((position) => {
    const next = [...states];
    states.forEach((state) => {
      const panelsUsed = state.panelsUsed + Math.ceil((position - state.lastPosition) / BLACK_ALUMINUM_PANEL_LENGTH_INCHES);
      if (panelsUsed < availablePanels) next.push({ lastPosition: position, panelsUsed, selected: [...state.selected, position] });
    });
    const bestByPositionAndPanels = new Map<string, LayoutState>();
    next.forEach((state) => {
      const key = `${state.lastPosition}:${state.panelsUsed}`;
      const existing = bestByPositionAndPanels.get(key);
      if (!existing || state.selected.length > existing.selected.length) bestByPositionAndPanels.set(key, state);
    });
    states = [...bestByPositionAndPanels.values()];
  });
  const best = states
    .filter((state) => state.panelsUsed + Math.ceil((totalInches - state.lastPosition) / BLACK_ALUMINUM_PANEL_LENGTH_INCHES) <= availablePanels)
    .sort((first, second) => second.selected.length - first.selected.length || first.selected.join(",").localeCompare(second.selected.join(",")))[0];
  return best?.selected.flatMap((position) => positionGroups.get(position) ?? []) ?? [];
}

function physicalPostCounts(design: FenceDesign, midRunPointIds: ReadonlySet<string>) {
  const pointsByPosition = new Map<string, string[]>();
  design.points.forEach((point) => {
    const key = `${point.xMm}:${point.yMm}`;
    pointsByPosition.set(key, [...(pointsByPosition.get(key) ?? []), point.id]);
  });
  let endPosts = 0; let cornerPosts = 0;
  const incoming = new Map(design.segments.map((segment) => [segment.toPointId, segment]));
  const outgoing = new Map(design.segments.map((segment) => [segment.fromPointId, segment]));
  pointsByPosition.forEach((pointIds) => {
    const corner = pointIds.some((pointId) => pointRole(design, pointId) === "corner");
    if (corner) {
      cornerPosts += 1;
      return;
    }
    if (pointIds.some((pointId) => midRunPointIds.has(pointId))) return;
    const gateAdjacent = pointIds.some((pointId) => incoming.get(pointId)?.kind === "gate" || outgoing.get(pointId)?.kind === "gate");
    const endpoint = pointIds.some((pointId) => !incoming.has(pointId) || !outgoing.has(pointId));
    if (gateAdjacent || endpoint) endPosts += 1;
  });
  return { endPosts, cornerPosts };
}

export function calculateBlackAluminumTakeoff(design: FenceDesign): BlackAluminumTakeoff {
  const midRunConnections = findMidRunConnections(design);
  const runs = straightFenceRuns(design, midRunConnections);
  const naturalMidRunPointIds = new Set(runs.flatMap(naturalConnectionPointIds));
  const fenceLengthMm = design.segments.filter(({ kind }) => kind === "fence").reduce((sum, segment) => sum + segmentLengthMm(design, segment), 0);
  const panelCount = runs.reduce((sum, run) => sum + panelCountForLength(run.lengthMm), 0);
  const linePosts = runs.reduce((sum, run) => sum + Math.max(0, panelCountForLength(run.lengthMm) - 1), 0);

  const gateCounts = new Map<string, GateOpeningTakeoff>();
  let singleGates = 0; let doubleGates = 0;
  design.segments.filter(({ kind }) => kind === "gate").forEach((segment) => {
    const gateType = segment.gateType ?? "single";
    const widthMm = segmentLengthMm(design, segment);
    const key = `${gateType}:${widthMm}`;
    const current = gateCounts.get(key);
    gateCounts.set(key, { gateType, widthMm, count: (current?.count ?? 0) + 1 });
    if (gateType === "double") doubleGates += 1;
    else singleGates += 1;
  });

  const { endPosts, cornerPosts } = physicalPostCounts(design, naturalMidRunPointIds);

  return Object.freeze({
    fenceLengthMm,
    panelCount,
    endPosts,
    cornerPosts,
    linePosts,
    singleGates,
    doubleGates,
    hinges: singleGates * 2 + doubleGates * 4,
    latches: singleGates + doubleGates,
    centerDropPoles: doubleGates,
    gateOpenings: Object.freeze([...gateCounts.values()].sort((first, second) => first.gateType.localeCompare(second.gateType) || first.widthMm - second.widthMm)),
    warnings: Object.freeze([]),
  });
}
