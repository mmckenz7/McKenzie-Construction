import { MM_PER_FOOT, fencePathForPoint, formatFeetInches, pointById, pointRole, segmentLengthMm, type FenceDesign, type GateType } from "./model";

export const BLACK_ALUMINUM_PANEL_LENGTH_MM = Math.round(8 * MM_PER_FOOT);
const BLACK_ALUMINUM_PANEL_LENGTH_INCHES = 96;
const BLACK_ALUMINUM_GATE_USABLE_INCHES = 84;

export type GateOpeningTakeoff = Readonly<{ gateType: GateType; widthMm: number; count: number }>;
export type GateFabricationPiece = Readonly<{ segmentId: string; gateType: GateType; widthMm: number; pieceIndex: number; pieceCount: number }>;
export type GateFabricationPanel = Readonly<{ id: string; gateType: GateType; usableMm: number; usedMm: number; wasteMm: number; pieces: readonly GateFabricationPiece[] }>;
export type TakeoffPostKind = "end" | "corner" | "line";
export type TakeoffPostReason = "open_end" | "gate_side" | "corner" | "corner_gate" | "panel_boundary" | "natural_t" | "added_t_end";
export type TakeoffPost = Readonly<{ id: string; kind: TakeoffPostKind; reason: TakeoffPostReason; xMm: number; yMm: number }>;
export type TakeoffPanel = Readonly<{
  id: string;
  runIndex: number;
  panelIndex: number;
  start: Readonly<{ xMm: number; yMm: number }>;
  end: Readonly<{ xMm: number; yMm: number }>;
  lengthMm: number;
  cut: boolean;
}>;
export type BlackAluminumTakeoffLayout = Readonly<{ panels: readonly TakeoffPanel[]; posts: readonly TakeoffPost[] }>;
export type BlackAluminumTakeoff = Readonly<{
  fenceLengthMm: number;
  panelCount: number;
  fencePanelCount: number;
  gatePanelCount: number;
  endPosts: number;
  cornerPosts: number;
  linePosts: number;
  singleGates: number;
  doubleGates: number;
  hinges: number;
  latches: number;
  centerDropPoles: number;
  gateOpenings: readonly GateOpeningTakeoff[];
  gateFabricationPanels: readonly GateFabricationPanel[];
  warnings: readonly string[];
  layout: BlackAluminumTakeoffLayout;
}>;

export type TreatedPinePrivacyTakeoff = Readonly<{
  fenceLengthMm: number;
  gateLengthMm: number;
  installedPickets: number;
  fencePickets: number;
  gatePickets: number;
  picketsWithWaste: number;
  picketWasteAllowance: number;
  fenceRailPieces: number;
  gateFramePieces: number;
  twoByFoursWithWaste: number;
  twoByFourWasteAllowance: number;
  installedPosts: number;
  fourByFoursWithWaste: number;
  postWasteAllowance: number;
  concreteBags: number;
  picketScrews: number;
  railToPostStructuralScrews: number;
  gateFrameStructuralScrews: number;
  totalStructuralScrews: number;
  singleGates: number;
  doubleGates: number;
  hinges: number;
  latches: number;
  dropRods: number;
  gateOpenings: readonly GateOpeningTakeoff[];
  warnings: readonly string[];
  layout: BlackAluminumTakeoffLayout;
}>;

const TAKEOFF_POST_REASON_LABELS: Readonly<Record<TakeoffPostReason, string>> = Object.freeze({
  open_end: "Open fence end",
  gate_side: "Gate-side end post",
  corner: "Fence corner",
  corner_gate: "Corner post also serving gate",
  panel_boundary: "Standard panel boundary",
  natural_t: "Run post shared with divider",
  added_t_end: "Added end post at divider",
});

export function takeoffPostReasonLabel(reason: TakeoffPostReason) {
  return TAKEOFF_POST_REASON_LABELS[reason];
}

export function formatBlackAluminumTakeoffText(takeoff: BlackAluminumTakeoff) {
  const panelRuns = new Map<number, TakeoffPanel[]>();
  takeoff.layout.panels.forEach((panel) => panelRuns.set(panel.runIndex, [...(panelRuns.get(panel.runIndex) ?? []), panel]));
  const postReasons = new Map<TakeoffPostReason, number>();
  takeoff.layout.posts.forEach(({ reason }) => postReasons.set(reason, (postReasons.get(reason) ?? 0) + 1));
  const gateOpenings = takeoff.gateOpenings.length
    ? takeoff.gateOpenings.map((gate) => `- ${gate.gateType === "double" ? "Double" : "Single"} ${formatFeetInches(gate.widthMm)}: ${gate.count}`)
    : ["- None"];
  const panelLayout = panelRuns.size
    ? [...panelRuns.entries()].sort(([first], [second]) => first - second).map(([runIndex, panels]) => `- Run ${runIndex + 1}: ${panels.map((panel) => `${formatFeetInches(panel.lengthMm)} ${panel.cut ? "cut" : "full"}`).join(" + ")}`)
    : ["- None"];
  const gateFabrication = takeoff.gateFabricationPanels.length
    ? takeoff.gateFabricationPanels.map((panel, index) => `- Gate panel ${index + 1}: ${panel.pieces.map((piece) => `${piece.gateType === "double" ? `double leaf ${piece.pieceIndex + 1}/${piece.pieceCount}` : "single gate"} ${formatFeetInches(piece.widthMm)}`).join(" + ")} · ${formatFeetInches(panel.wasteMm)} waste`)
    : ["- None"];
  const postDecisions = postReasons.size
    ? [...postReasons.entries()].map(([reason, count]) => `- ${takeoffPostReasonLabel(reason)}: ${count}`)
    : ["- None"];
  return [
    "BLACK ALUMINUM TAKEOFF — PRELIMINARY",
    `Fence length: ${formatFeetInches(takeoff.fenceLengthMm)}`,
    `8′ panels: ${takeoff.panelCount}`,
    `- Fence runs: ${takeoff.fencePanelCount}`,
    `- Gate fabrication: ${takeoff.gatePanelCount}`,
    "",
    "POSTS",
    `End posts: ${takeoff.endPosts}`,
    `Corner posts: ${takeoff.cornerPosts}`,
    `Run posts: ${takeoff.linePosts}`,
    "",
    "GATES AND HARDWARE",
    `Single gates: ${takeoff.singleGates}`,
    `Double gates: ${takeoff.doubleGates}`,
    `Hinges: ${takeoff.hinges}`,
    `Latches: ${takeoff.latches}`,
    `Center drop poles: ${takeoff.centerDropPoles}`,
    "Gate openings:",
    ...gateOpenings,
    "",
    "GATE FABRICATION CUT PLAN",
    ...gateFabrication,
    "",
    "PANEL LAYOUT",
    ...panelLayout,
    "",
    "POST DECISIONS",
    ...postDecisions,
    "",
    "Measurement-derived only. No products, pricing, labor, or supplier selections. Cutoffs are not reused.",
  ].join("\n");
}

function withTenPercentWaste(quantity: number) {
  return Math.ceil(quantity * 1.1);
}

function picketsForWidthMm(widthMm: number) {
  const widthInches = Math.max(0, Math.round(widthMm / (MM_PER_FOOT / 12)));
  return widthInches > 0 ? Math.ceil(widthInches / 6) : 0;
}

export function formatTreatedPinePrivacyTakeoffText(takeoff: TreatedPinePrivacyTakeoff) {
  const gateOpenings = takeoff.gateOpenings.length
    ? takeoff.gateOpenings.map((gate) => `- ${gate.gateType === "double" ? "Double" : "Single"} ${formatFeetInches(gate.widthMm)}: ${gate.count}`)
    : ["- None"];
  return [
    "TREATED PINE PRIVACY TAKEOFF — PRELIMINARY",
    "6′ high · 6″ touching pickets · 8′ maximum bays · 10% lumber waste",
    `Fence length: ${formatFeetInches(takeoff.fenceLengthMm)}`,
    `Gate opening width: ${formatFeetInches(takeoff.gateLengthMm)}`,
    "",
    "TREATED LUMBER",
    `1×6×6 pickets: ${takeoff.picketsWithWaste} (${takeoff.installedPickets} installed + ${takeoff.picketWasteAllowance} waste)` ,
    `2×4×8 rails and gate frames: ${takeoff.twoByFoursWithWaste} (${takeoff.fenceRailPieces} rails + ${takeoff.gateFramePieces} gate-frame pieces + ${takeoff.twoByFourWasteAllowance} waste)` ,
    `4×4 posts: ${takeoff.fourByFoursWithWaste} (${takeoff.installedPosts} installed + ${takeoff.postWasteAllowance} waste)` ,
    "",
    "INSTALLATION",
    `50 lb concrete bags: ${takeoff.concreteBags}`,
    `Picket screws: ${takeoff.picketScrews}`,
    `Rail-to-post structural screws: ${takeoff.railToPostStructuralScrews}`,
    `Gate-frame structural screws: ${takeoff.gateFrameStructuralScrews}`,
    `Total structural screws: ${takeoff.totalStructuralScrews}`,
    "",
    "GATES AND HARDWARE",
    `Single gates: ${takeoff.singleGates}`,
    `Double gates: ${takeoff.doubleGates}`,
    `Hinges: ${takeoff.hinges}`,
    `Latches: ${takeoff.latches}`,
    `Drop rods: ${takeoff.dropRods}`,
    "Gate openings:",
    ...gateOpenings,
    "",
    "Measurement-derived only. No products, pricing, labor, or supplier selections. Hardware mounting fasteners are assumed to be included with hinges, latches, and drop rods.",
  ].join("\n");
}

function endpointIds(design: FenceDesign) {
  const incoming = new Set(design.segments.map(({ toPointId }) => toPointId));
  const outgoing = new Set(design.segments.map(({ fromPointId }) => fromPointId));
  return design.points.filter(({ id }) => !incoming.has(id) || !outgoing.has(id)).map(({ id }) => id);
}

type MidRunConnection = Readonly<{ pointId: string; segmentId: string; position: number }>;
type RunConnection = Readonly<{ pointId: string; offsetMm: number }>;
type RunPiece = Readonly<{
  segmentId: string;
  startOffsetMm: number;
  lengthMm: number;
  start: Readonly<{ xMm: number; yMm: number }>;
  end: Readonly<{ xMm: number; yMm: number }>;
}>;
type StraightFenceRun = Readonly<{ lengthMm: number; connections: readonly RunConnection[]; pieces: readonly RunPiece[] }>;

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
  return lengthMm > 0 ? Math.max(1, Math.ceil(measuredInches / BLACK_ALUMINUM_PANEL_LENGTH_INCHES)) : 0;
}

function doubleGateFabricationPanelCount(widthMm: number) {
  return widthMm <= Math.round(6 * MM_PER_FOOT) ? 1 : 2;
}

function singleGateFabricationPanels(gates: readonly Readonly<{ segmentId: string; widthMm: number }>[]): readonly GateFabricationPanel[] {
  const pieces = gates.flatMap(({ segmentId, widthMm }) => {
    let remainingInches = Math.max(1, Math.round(widthMm / (MM_PER_FOOT / 12)));
    const widths: number[] = [];
    while (remainingInches > 0) {
      widths.push(Math.min(BLACK_ALUMINUM_GATE_USABLE_INCHES, remainingInches));
      remainingInches -= BLACK_ALUMINUM_GATE_USABLE_INCHES;
    }
    return widths.map((widthInches, pieceIndex) => ({ segmentId, widthInches, pieceIndex, pieceCount: widths.length }));
  }).sort((first, second) => second.widthInches - first.widthInches || first.segmentId.localeCompare(second.segmentId) || first.pieceIndex - second.pieceIndex);
  if (!pieces.length) return Object.freeze([]);
  const minimum = Math.ceil(pieces.reduce((sum, piece) => sum + piece.widthInches, 0) / BLACK_ALUMINUM_GATE_USABLE_INCHES);
  const packInto = (panelCount: number): readonly (readonly number[])[] | null => {
    const used = Array.from({ length: panelCount }, () => 0);
    const bins = Array.from({ length: panelCount }, () => [] as number[]);
    const place = (pieceIndex: number): boolean => {
      if (pieceIndex === pieces.length) return true;
      const piece = pieces[pieceIndex].widthInches;
      const tried = new Set<number>();
      for (let panelIndex = 0; panelIndex < used.length; panelIndex += 1) {
        if (tried.has(used[panelIndex]) || used[panelIndex] + piece > BLACK_ALUMINUM_GATE_USABLE_INCHES) continue;
        tried.add(used[panelIndex]); used[panelIndex] += piece; bins[panelIndex].push(pieceIndex);
        if (place(pieceIndex + 1)) return true;
        used[panelIndex] -= piece; bins[panelIndex].pop();
        if (used[panelIndex] === 0) break;
      }
      return false;
    };
    return place(0) ? Object.freeze(bins.map((bin) => Object.freeze([...bin]))) : null;
  };
  let packed: readonly (readonly number[])[] = [];
  for (let panelCount = minimum; panelCount <= pieces.length; panelCount += 1) {
    const candidate = packInto(panelCount);
    if (candidate) { packed = candidate; break; }
  }
  const usableMm = Math.round(BLACK_ALUMINUM_GATE_USABLE_INCHES * MM_PER_FOOT / 12);
  return Object.freeze(packed.map((bin, panelIndex) => {
    const panelPieces = bin.map((pieceIndex) => pieces[pieceIndex]).map((piece) => Object.freeze({
      segmentId: piece.segmentId,
      gateType: "single" as const,
      widthMm: Math.round(piece.widthInches * MM_PER_FOOT / 12),
      pieceIndex: piece.pieceIndex,
      pieceCount: piece.pieceCount,
    }));
    const usedMm = panelPieces.reduce((sum, piece) => sum + piece.widthMm, 0);
    return Object.freeze({ id: `gate-panel-${panelIndex + 1}`, gateType: "single" as const, usableMm, usedMm, wasteMm: usableMm - usedMm, pieces: Object.freeze(panelPieces) });
  }));
}

function straightFenceRuns(design: FenceDesign, midRunConnections: readonly MidRunConnection[]): readonly StraightFenceRun[] {
  const connectionsBySegment = new Map<string, MidRunConnection[]>();
  midRunConnections.forEach((connection) => connectionsBySegment.set(connection.segmentId, [...(connectionsBySegment.get(connection.segmentId) ?? []), connection]));
  const runs: StraightFenceRun[] = [];
  const incomingIds = new Set(design.segments.map(({ toPointId }) => toPointId));
  design.points.filter(({ id }) => !incomingIds.has(id)).forEach((root) => {
    const path = fencePathForPoint(design, root.id);
    let lengthMm = 0; let connections: RunConnection[] = []; let pieces: RunPiece[] = [];
    const flush = () => {
      if (lengthMm > 0) runs.push(Object.freeze({ lengthMm, connections: Object.freeze(connections), pieces: Object.freeze(pieces) }));
      lengthMm = 0; connections = []; pieces = [];
    };
    path.segments.forEach((segment, index) => {
      if (segment.kind === "gate") {
        flush();
        return;
      }
      const segmentLength = segmentLengthMm(design, segment);
      const start = pointById(design, segment.fromPointId); const end = pointById(design, segment.toPointId);
      pieces.push(Object.freeze({ segmentId: segment.id, startOffsetMm: lengthMm, lengthMm: segmentLength, start, end }));
      (connectionsBySegment.get(segment.id) ?? []).forEach((connection) => connections.push({ pointId: connection.pointId, offsetMm: lengthMm + Math.round(segmentLength * connection.position) }));
      lengthMm += segmentLength;
      const next = path.segments[index + 1];
      if (!next || next.kind === "gate" || pointRole(design, segment.toPointId) === "corner") flush();
    });
  });
  return Object.freeze(runs);
}

function naturalConnectionPositions(run: StraightFenceRun): readonly number[] {
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
  return best?.selected ?? [];
}

function naturalConnectionPointIds(run: StraightFenceRun, positions: readonly number[]): readonly string[] {
  const selected = new Set(positions);
  return run.connections.flatMap(({ pointId, offsetMm }) => selected.has(Math.round(offsetMm / (MM_PER_FOOT / 12))) ? [pointId] : []);
}

function runOffsetAtPosition(run: StraightFenceRun, positionInches: number, totalInches: number) {
  if (positionInches <= 0) return 0;
  if (positionInches >= totalInches) return run.lengthMm;
  const connection = run.connections.find(({ offsetMm }) => Math.round(offsetMm / (MM_PER_FOOT / 12)) === positionInches);
  return connection?.offsetMm ?? Math.min(run.lengthMm, Math.round(positionInches * MM_PER_FOOT / 12));
}

function pointAtRunPosition(run: StraightFenceRun, positionInches: number, totalInches: number) {
  const targetOffsetMm = runOffsetAtPosition(run, positionInches, totalInches);
  const piece = run.pieces.find(({ startOffsetMm, lengthMm }) => targetOffsetMm <= startOffsetMm + lengthMm) ?? run.pieces.at(-1)!;
  const fraction = piece.lengthMm === 0 ? 0 : Math.max(0, Math.min(1, (targetOffsetMm - piece.startOffsetMm) / piece.lengthMm));
  return Object.freeze({ xMm: Math.round(piece.start.xMm + (piece.end.xMm - piece.start.xMm) * fraction), yMm: Math.round(piece.start.yMm + (piece.end.yMm - piece.start.yMm) * fraction) });
}

function visualLayoutForRuns(runs: readonly StraightFenceRun[], selectedConnectionsByRun: readonly (readonly number[])[]) {
  const panels: TakeoffPanel[] = []; const linePosts: TakeoffPost[] = [];
  runs.forEach((run, runIndex) => {
    const totalInches = Math.max(1, Math.round(run.lengthMm / (MM_PER_FOOT / 12)));
    const selectedConnections = selectedConnectionsByRun[runIndex] ?? [];
    const requiredBoundaries = [0, ...selectedConnections, totalInches];
    const boundaries: number[] = [0];
    requiredBoundaries.slice(0, -1).forEach((start, index) => {
      const end = requiredBoundaries[index + 1];
      for (let position = start + BLACK_ALUMINUM_PANEL_LENGTH_INCHES; position < end; position += BLACK_ALUMINUM_PANEL_LENGTH_INCHES) boundaries.push(position);
      boundaries.push(end);
    });
    const uniqueBoundaries = [...new Set(boundaries)].sort((first, second) => first - second);
    uniqueBoundaries.slice(0, -1).forEach((startInches, panelIndex) => {
      const endInches = uniqueBoundaries[panelIndex + 1];
      panels.push(Object.freeze({
        id: `panel-${runIndex + 1}-${panelIndex + 1}`,
        runIndex,
        panelIndex,
        start: pointAtRunPosition(run, startInches, totalInches),
        end: pointAtRunPosition(run, endInches, totalInches),
        lengthMm: runOffsetAtPosition(run, endInches, totalInches) - runOffsetAtPosition(run, startInches, totalInches),
        cut: endInches - startInches < BLACK_ALUMINUM_PANEL_LENGTH_INCHES,
      }));
    });
    const selectedSet = new Set(selectedConnections);
    uniqueBoundaries.slice(1, -1).forEach((positionInches, postIndex) => {
      const point = pointAtRunPosition(run, positionInches, totalInches);
      linePosts.push(Object.freeze({ id: `line-post-${runIndex + 1}-${postIndex + 1}`, kind: "line", reason: selectedSet.has(positionInches) ? "natural_t" : "panel_boundary", ...point }));
    });
  });
  return { panels: Object.freeze(panels), linePosts: Object.freeze(linePosts) };
}

function physicalPosts(design: FenceDesign, naturalMidRunPointIds: ReadonlySet<string>, allMidRunPointIds: ReadonlySet<string>) {
  const pointsByPosition = new Map<string, string[]>();
  design.points.forEach((point) => {
    const key = `${point.xMm}:${point.yMm}`;
    pointsByPosition.set(key, [...(pointsByPosition.get(key) ?? []), point.id]);
  });
  const posts: TakeoffPost[] = [];
  const incoming = new Map(design.segments.map((segment) => [segment.toPointId, segment]));
  const outgoing = new Map(design.segments.map((segment) => [segment.fromPointId, segment]));
  pointsByPosition.forEach((pointIds) => {
    const corner = pointIds.some((pointId) => pointRole(design, pointId) === "corner");
    const gateAdjacent = pointIds.some((pointId) => incoming.get(pointId)?.kind === "gate" || outgoing.get(pointId)?.kind === "gate");
    const point = pointById(design, pointIds[0]);
    if (corner) {
      posts.push(Object.freeze({ id: `corner-post-${point.xMm}-${point.yMm}`, kind: "corner", reason: gateAdjacent ? "corner_gate" : "corner", xMm: point.xMm, yMm: point.yMm }));
      return;
    }
    if (pointIds.some((pointId) => naturalMidRunPointIds.has(pointId))) return;
    const endpoint = pointIds.some((pointId) => !incoming.has(pointId) || !outgoing.has(pointId));
    if (gateAdjacent || endpoint) {
      const reason: TakeoffPostReason = gateAdjacent ? "gate_side" : pointIds.some((pointId) => allMidRunPointIds.has(pointId)) ? "added_t_end" : "open_end";
      posts.push(Object.freeze({ id: `end-post-${point.xMm}-${point.yMm}`, kind: "end", reason, xMm: point.xMm, yMm: point.yMm }));
    }
  });
  return Object.freeze(posts);
}

export function calculateBlackAluminumTakeoff(design: FenceDesign): BlackAluminumTakeoff {
  const midRunConnections = findMidRunConnections(design);
  const runs = straightFenceRuns(design, midRunConnections);
  const selectedConnectionsByRun = runs.map(naturalConnectionPositions);
  const naturalMidRunPointIds = new Set(runs.flatMap((run, index) => naturalConnectionPointIds(run, selectedConnectionsByRun[index])));
  const allMidRunPointIds = new Set(midRunConnections.map(({ pointId }) => pointId));
  const visualRuns = visualLayoutForRuns(runs, selectedConnectionsByRun);
  const terminalPosts = physicalPosts(design, naturalMidRunPointIds, allMidRunPointIds);
  const posts = Object.freeze([...terminalPosts, ...visualRuns.linePosts]);
  const fenceLengthMm = design.segments.filter(({ kind }) => kind === "fence").reduce((sum, segment) => sum + segmentLengthMm(design, segment), 0);
  const fencePanelCount = runs.reduce((sum, run) => sum + panelCountForLength(run.lengthMm), 0);

  const gateCounts = new Map<string, GateOpeningTakeoff>();
  let singleGates = 0; let doubleGates = 0;
  const singleGateInputs: { segmentId: string; widthMm: number }[] = [];
  const doubleGateInputs: { segmentId: string; widthMm: number }[] = [];
  design.segments.filter(({ kind }) => kind === "gate").forEach((segment) => {
    const gateType = segment.gateType ?? "single";
    const widthMm = segmentLengthMm(design, segment);
    const key = `${gateType}:${widthMm}`;
    const current = gateCounts.get(key);
    gateCounts.set(key, { gateType, widthMm, count: (current?.count ?? 0) + 1 });
    if (gateType === "double") { doubleGates += 1; doubleGateInputs.push({ segmentId: segment.id, widthMm }); }
    else { singleGates += 1; singleGateInputs.push({ segmentId: segment.id, widthMm }); }
  });
  const singlePanels = singleGateFabricationPanels(singleGateInputs);
  const usableGateMm = Math.round(BLACK_ALUMINUM_GATE_USABLE_INCHES * MM_PER_FOOT / 12);
  const doublePanels = doubleGateInputs.flatMap(({ segmentId, widthMm }) => {
    const panelCount = doubleGateFabricationPanelCount(widthMm);
    const widths = panelCount === 1 ? [widthMm] : [Math.floor(widthMm / 2), widthMm - Math.floor(widthMm / 2)];
    return widths.map((pieceWidthMm, pieceIndex) => Object.freeze({
      id: `gate-panel-${singlePanels.length + doubleGateInputs.slice(0, doubleGateInputs.findIndex((gate) => gate.segmentId === segmentId)).reduce((sum, gate) => sum + doubleGateFabricationPanelCount(gate.widthMm), 0) + pieceIndex + 1}`,
      gateType: "double" as const,
      usableMm: usableGateMm,
      usedMm: pieceWidthMm,
      wasteMm: Math.max(0, usableGateMm - pieceWidthMm),
      pieces: Object.freeze([Object.freeze({ segmentId, gateType: "double" as const, widthMm: pieceWidthMm, pieceIndex, pieceCount: panelCount })]),
    }));
  });
  const gateFabricationPanels = Object.freeze([...singlePanels, ...doublePanels]);
  const warnings = Object.freeze([
    ...singleGateInputs.filter(({ widthMm }) => widthMm > usableGateMm).map(({ segmentId }) => `${segmentId}: single gate exceeds 7′ usable material and is split across fabrication panels.`),
    ...doubleGateInputs.filter(({ widthMm }) => widthMm > usableGateMm * 2).map(({ segmentId }) => `${segmentId}: double gate exceeds the 14′ combined usable capacity of two fabrication panels.`),
  ]);
  const gatePanelCount = gateFabricationPanels.length;

  return Object.freeze({
    fenceLengthMm,
    panelCount: fencePanelCount + gatePanelCount,
    fencePanelCount,
    gatePanelCount,
    endPosts: posts.filter(({ kind }) => kind === "end").length,
    cornerPosts: posts.filter(({ kind }) => kind === "corner").length,
    linePosts: posts.filter(({ kind }) => kind === "line").length,
    singleGates,
    doubleGates,
    hinges: singleGates * 2 + doubleGates * 4,
    latches: singleGates + doubleGates,
    centerDropPoles: doubleGates,
    gateOpenings: Object.freeze([...gateCounts.values()].sort((first, second) => first.gateType.localeCompare(second.gateType) || first.widthMm - second.widthMm)),
    gateFabricationPanels,
    warnings,
    layout: Object.freeze({ panels: visualRuns.panels, posts }),
  });
}

export function calculateTreatedPinePrivacyTakeoff(design: FenceDesign): TreatedPinePrivacyTakeoff {
  const aluminumLayout = calculateBlackAluminumTakeoff(design);
  const midRunConnections = findMidRunConnections(design);
  const runs = straightFenceRuns(design, midRunConnections);
  const fencePickets = runs.reduce((sum, run) => sum + picketsForWidthMm(run.lengthMm), 0);
  let gatePickets = 0; let singleGates = 0; let doubleGates = 0; let gateLengthMm = 0;
  const gateCounts = new Map<string, GateOpeningTakeoff>();
  design.segments.filter(({ kind }) => kind === "gate").forEach((segment) => {
    const gateType = segment.gateType ?? "single";
    const widthMm = segmentLengthMm(design, segment);
    gateLengthMm += widthMm;
    const key = `${gateType}:${widthMm}`;
    const current = gateCounts.get(key);
    gateCounts.set(key, { gateType, widthMm, count: (current?.count ?? 0) + 1 });
    if (gateType === "double") {
      doubleGates += 1;
      gatePickets += picketsForWidthMm(Math.floor(widthMm / 2)) + picketsForWidthMm(widthMm - Math.floor(widthMm / 2));
    } else {
      singleGates += 1;
      gatePickets += picketsForWidthMm(widthMm);
    }
  });
  const installedPickets = fencePickets + gatePickets;
  const picketsWithWaste = withTenPercentWaste(installedPickets);
  const fenceRailPieces = aluminumLayout.layout.panels.length * 3;
  const gateFramePieces = singleGates * 5 + doubleGates * 10;
  const baseTwoByFours = fenceRailPieces + gateFramePieces;
  const twoByFoursWithWaste = withTenPercentWaste(baseTwoByFours);
  const installedPosts = aluminumLayout.layout.posts.length;
  const fourByFoursWithWaste = withTenPercentWaste(installedPosts);
  const railToPostStructuralScrews = aluminumLayout.layout.panels.length * 12;
  const gateFrameStructuralScrews = (singleGates + doubleGates * 2) * 12;
  return Object.freeze({
    fenceLengthMm: aluminumLayout.fenceLengthMm,
    gateLengthMm,
    installedPickets,
    fencePickets,
    gatePickets,
    picketsWithWaste,
    picketWasteAllowance: picketsWithWaste - installedPickets,
    fenceRailPieces,
    gateFramePieces,
    twoByFoursWithWaste,
    twoByFourWasteAllowance: twoByFoursWithWaste - baseTwoByFours,
    installedPosts,
    fourByFoursWithWaste,
    postWasteAllowance: fourByFoursWithWaste - installedPosts,
    concreteBags: installedPosts,
    picketScrews: installedPickets * 6,
    railToPostStructuralScrews,
    gateFrameStructuralScrews,
    totalStructuralScrews: railToPostStructuralScrews + gateFrameStructuralScrews,
    singleGates,
    doubleGates,
    hinges: singleGates * 2 + doubleGates * 4,
    latches: singleGates + doubleGates,
    dropRods: doubleGates,
    gateOpenings: Object.freeze([...gateCounts.values()].sort((first, second) => first.gateType.localeCompare(second.gateType) || first.widthMm - second.widthMm)),
    warnings: Object.freeze(installedPickets ? ["Structural screw quantities are preliminary defaults: 12 per installed fence bay and 12 per gate leaf. Hardware mounting fasteners are assumed included with each hardware item."] : []),
    layout: aluminumLayout.layout,
  });
}
