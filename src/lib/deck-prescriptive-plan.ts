export const KNOXVILLE_2024_DECK_PROFILE = Object.freeze({
  id: "city-knoxville-2024-irc-r507-southern-pine-v2",
  label: "City of Knoxville · 2024 IRC R507 · bounded Southern Pine draft v2",
  controllingCodeUrl:
    "https://permits.knoxvilletn.gov/Codes-Requests/Construction-Codes",
  codeSourceUrl: "https://codes.iccsafe.org/content/IRC2024P2/chapter-5-floors",
  formatReferenceUrl:
    "https://permits.knoxvilletn.gov/Policies-Fast-Facts/Fast-Fact-Guides",
  industryReferenceUrl:
    "https://awc.org/wp-content/uploads/2022/02/AWC-DCA62015-DeckGuide-1804.pdf",
  rules: [
    "IRC2024:R507.3.1",
    "IRC2024:R507.4",
    "IRC2024:Table-R507.5(1)",
    "IRC2024:Table-R507.6",
  ] as const,
} as const);

export type DeckPrescriptiveDraft = Readonly<{
  jurisdiction:
    | ""
    | "city_knoxville_verified"
    | "city_knoxville_estimating_assumption"
    | "other_or_uncertain";
  attachment: "" | "ledger" | "freestanding";
  attachmentConfirmed: boolean;
  ledgerSubstrate:
    | ""
    | "verified_band_rim"
    | "estimating_band_rim_assumption"
    | "masonry_veneer"
    | "concrete_or_other"
    | "unknown";
  joistDirection: "" | "house_to_yard" | "side_to_side";
  joistSpacingInches: "" | "12" | "16" | "24";
  joistSize: "" | "2x6" | "2x8" | "2x10" | "2x12";
  speciesGrade: "" | "southern_pine_no2";
  treatmentService: "" | "pressure_treated_wet_service";
  designLoad: "" | "40_live_10_dead";
  beamLineCount: string;
  beamDistanceFromHouseFeet: string;
  beamSize: "" | "2x6" | "2x8" | "2x10" | "2x12";
  beamPlies: "" | "1" | "2" | "3";
  postCount: string;
  postPositionsFeet: string;
  postPlacementMode: "aligned" | "free";
  postDistancesFromHouseFeet: string;
  postSnapInches: "1" | "3" | "6" | "12";
  postSize: "" | "4x4" | "6x6";
  postHeightFeet: string;
  footingCount: string;
  footingDiameterInches: string;
  footingThicknessInches: string;
  footingDepthInches: string;
  soilBearingPsf: "" | "1500";
  frostBasis: string;
  extraBlockingRows: string;
  hardwareBasis: string;
  stairsIncluded: "" | "yes" | "no";
  railingsIncluded: "" | "yes" | "no";
  stairsConfirmed: boolean;
  stairStringerCount: string;
  stairLandingFootingCount: string;
  unusualGeometry: boolean;
  cantilever: boolean;
  roofOrSpecialLoad: boolean;
  soilOrFootingUncertain: boolean;
}>;

export type FramingBomLine = Readonly<{
  key: string;
  description: string;
  quantity: number;
  unit: "ea" | "ln ft" | "cu yd";
  sourceId: string;
}>;
export type FramingHardwareRequirement = Readonly<{
  key: string;
  quantity: number;
  unit: "ea" | "ln ft";
  specification: string;
  sourceId: string;
  selectionStatus: "compatible_product_and_price_required" | "detail_required";
}>;
export type DeckPrescriptivePlan = Readonly<{
  evidenceVersion: "deck-framing-evidence-v2";
  status: "ready_for_human_review" | "exception_review";
  profileId: typeof KNOXVILLE_2024_DECK_PROFILE.id;
  inputs: Readonly<{
    lengthFeet: number;
    widthFeet: number;
    draft: DeckPrescriptiveDraft;
  }>;
  checks: readonly Readonly<{
    sourceId: string;
    result: "pass" | "exception";
    actual: string;
    limit: string;
  }>[];
  unresolvedPackages: readonly (
    | "stairs"
    | "connector_schedule"
    | "guard_schedule"
    | "jurisdiction"
    | "ledger_detail"
    | "soil_frost"
  )[];
  exceptions: readonly string[];
  quantities: Readonly<{
    joists: number;
    beamLinearFeet: number;
    posts: number;
    footings: number;
    blockingPieces: number;
    ledgerLinearFeet: number;
    rimLinearFeet: number;
    joistHangers: number;
    postBases: number;
    postCaps: number;
    stairStringers: number;
    stairLandingFootings: number;
  }> | null;
  bom: readonly FramingBomLine[];
  hardwareSchedule: readonly FramingHardwareRequirement[];
  reference: string | null;
}>;

const JOIST_MAX: Record<string, Record<string, number>> = {
  "2x6": { "12": 11 + 11 / 12, "16": 9, "24": 7 + 7 / 12 },
  "2x8": { "12": 13 + 1 / 12, "16": 11 + 10 / 12, "24": 9 + 8 / 12 },
  "2x10": { "12": 16 + 2 / 12, "16": 14, "24": 11 + 5 / 12 },
  "2x12": { "12": 18, "16": 16 + 6 / 12, "24": 13 + 6 / 12 },
};
// Exact no-cantilever `12 & 0` column from IRC 2024 Table R507.5(1).
const BEAM_MAX_AT_12: Record<string, Record<string, number>> = {
  "2x6": { "1": 4, "2": 5 + 11 / 12, "3": 7 + 5 / 12 },
  "2x8": { "1": 5 + 1 / 12, "2": 7 + 7 / 12, "3": 9 + 6 / 12 },
  "2x10": { "1": 6, "2": 9, "3": 11 + 2 / 12 },
  "2x12": { "1": 7 + 1 / 12, "2": 10 + 7 / 12, "3": 13 + 3 / 12 },
};
const FOOTING_1500 = [
  { area: 20, diameter: 14, thickness: 6 },
  { area: 40, diameter: 20, thickness: 6 },
  { area: 60, diameter: 24, thickness: 8 },
  { area: 80, diameter: 28, thickness: 9 },
  { area: 100, diameter: 31, thickness: 11 },
  { area: 120, diameter: 34, thickness: 12 },
  { area: 140, diameter: 37, thickness: 13 },
  { area: 160, diameter: 40, thickness: 15 },
];
const POST_MAX_4X4 = [
  { area: 20, height: 14 },
  { area: 40, height: 13 + 8 / 12 },
  { area: 60, height: 11 },
  { area: 80, height: 9 + 5 / 12 },
  { area: 100, height: 8 + 4 / 12 },
  { area: 120, height: 7 + 5 / 12 },
  { area: 140, height: 6 + 9 / 12 },
  { area: 160, height: 6 + 2 / 12 },
];

const positive = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const whole = (value: string) =>
  /^\d+$/.test(value.trim()) && Number(value) > 0 ? Number(value) : null;
const NUMERIC_TOLERANCE = 1e-8;
const atOrBelow = (value: number, limit: number) =>
  value <= limit + NUMERIC_TOLERANCE;
const lookupCeiling = <T extends { area: number }>(
  rows: readonly T[],
  area: number,
) => rows.find((row) => atOrBelow(area, row.area)) ?? null;

export function parseDeckPostPositions(
  value: string | undefined,
  lengthFeet: number,
) {
  if (typeof value !== "string") return null;
  const positions = value.split(",").map((entry) => Number(entry.trim()));
  if (
    positions.length < 2 ||
    positions.some(
      (entry) => !Number.isFinite(entry) || entry < 0 || entry > lengthFeet,
    )
  )
    return null;
  const sorted = [...positions].sort((a, b) => a - b);
  if (sorted.some((entry, index) => index > 0 && entry <= sorted[index - 1]))
    return null;
  return Object.freeze(sorted);
}

export function parseDeckPostDistances(
  value: string | undefined,
  depthFeet: number,
  expectedCount: number,
) {
  if (typeof value !== "string") return null;
  const distances = value.split(",").map((entry) => Number(entry.trim()));
  if (
    distances.length !== expectedCount ||
    distances.some(
      (entry) => !Number.isFinite(entry) || entry < 0 || entry > depthFeet,
    )
  )
    return null;
  return Object.freeze(distances);
}

export type DeckOutlinePoint = Readonly<{ x: number; y: number }>;

export type DeckGradeHeights = Readonly<{
  houseLeftFeet: number;
  houseRightFeet: number;
  yardLeftFeet: number;
  yardRightFeet: number;
}>;

export type DeckStairPlacement = Readonly<{
  edgeIndex: number;
  offsetFeet: number;
  widthFeet: number;
  projectionFeet: number;
}>;

export function steadyGradeHeightAtPoint(
  point: DeckOutlinePoint,
  bounds: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>,
  heights: DeckGradeHeights,
) {
  const width = Math.max(0.01, bounds.maxX - bounds.minX);
  const depth = Math.max(0.01, bounds.maxY - bounds.minY);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const mean = (
    heights.houseLeftFeet + heights.houseRightFeet +
    heights.yardLeftFeet + heights.yardRightFeet
  ) / 4;
  const horizontalSlope = (
    (heights.houseRightFeet + heights.yardRightFeet) / 2 -
    (heights.houseLeftFeet + heights.yardLeftFeet) / 2
  ) / width;
  const awayFromHouseSlope = (
    (heights.yardLeftFeet + heights.yardRightFeet) / 2 -
    (heights.houseLeftFeet + heights.houseRightFeet) / 2
  ) / depth;
  return Number(Math.max(0, mean + horizontalSlope * (point.x - centerX) + awayFromHouseSlope * (point.y - centerY)).toFixed(3));
}

export function nearestDeckStairPlacement(
  outline: readonly DeckOutlinePoint[],
  candidate: DeckOutlinePoint,
  widthFeet: number,
  projectionFeet: number,
) {
  const placements = outline.map((start, edgeIndex) => {
    const end = outline[(edgeIndex + 1) % outline.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < widthFeet || length < 0.25) return null;
    const rawOffset = ((candidate.x - start.x) * dx + (candidate.y - start.y) * dy) / length;
    const offsetFeet = Math.max(widthFeet / 2, Math.min(length - widthFeet / 2, rawOffset));
    const center = { x: start.x + (dx / length) * offsetFeet, y: start.y + (dy / length) * offsetFeet };
    return {
      distance: Math.hypot(candidate.x - center.x, candidate.y - center.y),
      placement: Object.freeze({
        edgeIndex,
        offsetFeet: Number(offsetFeet.toFixed(3)),
        widthFeet: Number(widthFeet.toFixed(3)),
        projectionFeet: Number(projectionFeet.toFixed(3)),
      }),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return placements.sort((first, second) => first.distance - second.distance)[0]?.placement ?? null;
}

export function moveDeckOutlineEdge(
  outline: readonly DeckOutlinePoint[],
  edgeIndex: number,
  requestedDelta: number,
  magneticGrid = true,
) {
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= outline.length || !Number.isFinite(requestedDelta))
    return outline;
  const start = outline[edgeIndex];
  const endIndex = (edgeIndex + 1) % outline.length;
  const end = outline[endIndex];
  const edgeDx = end.x - start.x;
  const edgeDy = end.y - start.y;
  const edgeSize = Math.hypot(edgeDx, edgeDy);
  if (edgeSize < 0.25) return outline;
  const normal = { x: -edgeDy / edgeSize, y: edgeDx / edgeSize };
  const gridDelta = Math.round(requestedDelta * 2) / 2;
  const delta = magneticGrid && Math.abs(requestedDelta - gridDelta) <= 0.15
    ? gridDelta
    : requestedDelta;
  let moved = outline.map((point, index) =>
    index === edgeIndex || index === endIndex
      ? { x: point.x + normal.x * delta, y: point.y + normal.y * delta }
      : { ...point },
  );
  const minimumX = Math.min(...moved.map((point) => point.x));
  const minimumY = Math.min(...moved.map((point) => point.y));
  if (minimumX < 0 || minimumY < 0) {
    moved = moved.map((point) => ({
      x: point.x - Math.min(0, minimumX),
      y: point.y - Math.min(0, minimumY),
    }));
  }
  if (moved.some((point) => point.x > 200 || point.y > 200) || !isValidDeckOutline(moved)) return outline;
  return Object.freeze(moved.map((point) => Object.freeze({
    x: Number(point.x.toFixed(4)),
    y: Number(point.y.toFixed(4)),
  })));
}

export function snapDeckOutlinePoint(
  candidate: DeckOutlinePoint,
  previous: DeckOutlinePoint,
  next: DeckOutlinePoint,
  gridFeet = 0.5,
  angleToleranceDegrees = 10,
  gridToleranceFeet = 0.2,
) {
  const step = Math.max(1 / 12, gridFeet);
  const angleStep = Math.PI / 4;
  const angleTolerance = (Math.max(0, angleToleranceDegrees) * Math.PI) / 180;
  const choices: DeckOutlinePoint[] = [candidate];

  for (const anchor of [previous, next]) {
    const dx = candidate.x - anchor.x;
    const dy = candidate.y - anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.25) continue;
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / angleStep) * angleStep;
    const angularDifference = Math.abs(
      Math.atan2(Math.sin(angle - snappedAngle), Math.cos(angle - snappedAngle)),
    );
    if (angularDifference <= angleTolerance) {
      choices.push({
        x: anchor.x + Math.cos(snappedAngle) * distance,
        y: anchor.y + Math.sin(snappedAngle) * distance,
      });
    }
  }

  const angleSnapped = choices.slice(1).sort(
    (first, second) =>
      Math.hypot(first.x - candidate.x, first.y - candidate.y) -
      Math.hypot(second.x - candidate.x, second.y - candidate.y),
  )[0];
  const nearest = angleSnapped ?? {
    x: Math.abs(candidate.x - Math.round(candidate.x / step) * step) <= gridToleranceFeet
      ? Math.round(candidate.x / step) * step
      : candidate.x,
    y: Math.abs(candidate.y - Math.round(candidate.y / step) * step) <= gridToleranceFeet
      ? Math.round(candidate.y / step) * step
      : candidate.y,
  };

  return Object.freeze({
    x: Number(Math.max(0, Math.min(200, nearest.x)).toFixed(4)),
    y: Number(Math.max(0, Math.min(200, nearest.y)).toFixed(4)),
  });
}

export function nextDeckDrawingZoom(
  current: number,
  change: number,
  editing = false,
) {
  const minimum = editing ? 100 : 50;
  return Math.min(200, Math.max(minimum, current + change));
}

export function drawingClientToDeckPoint(
  client: Readonly<{ x: number; y: number }>,
  bounds: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>,
  deck: Readonly<{ lengthFeet: number; widthFeet: number }>,
) {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const drawingX = -10 + ((client.x - bounds.left) * 340) / bounds.width;
  const drawingY = -10 + ((client.y - bounds.top) * 230) / bounds.height;
  return Object.freeze({
    x: ((drawingX - 30) * deck.lengthFeet) / 260,
    y: ((drawingY - 20) * deck.widthFeet) / 150,
  });
}

export function insertOutlinePointOnNearestEdge(
  points: readonly DeckOutlinePoint[],
  candidate: DeckOutlinePoint,
  snapInches = 1,
  maxDistanceFeet = 0.75,
): readonly DeckOutlinePoint[] {
  if (points.length < 3 || points.length >= 24) return points;
  const gridFeet = Math.max(1, snapInches) / 12;
  let nearest: Readonly<{
    edgeIndex: number;
    point: DeckOutlinePoint;
    distance: number;
    distanceFromStart: number;
    distanceFromEnd: number;
  }> | null = null;

  for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
    const start = points[edgeIndex];
    const end = points[(edgeIndex + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 0.0001) continue;
    const ratio = Math.min(
      1,
      Math.max(
        0,
        ((candidate.x - start.x) * dx + (candidate.y - start.y) * dy) /
          lengthSquared,
      ),
    );
    const edgeLength = Math.sqrt(lengthSquared);
    const snappedDistance =
      Math.round((ratio * edgeLength) / gridFeet) * gridFeet;
    const snappedRatio = Math.min(1, Math.max(0, snappedDistance / edgeLength));
    const projected = {
      x: start.x + snappedRatio * dx,
      y: start.y + snappedRatio * dy,
    };
    const distance = Math.hypot(
      candidate.x - projected.x,
      candidate.y - projected.y,
    );
    const next = {
      edgeIndex,
      point: {
        x: Number(projected.x.toFixed(4)),
        y: Number(projected.y.toFixed(4)),
      },
      distance,
      distanceFromStart: Math.hypot(
        projected.x - start.x,
        projected.y - start.y,
      ),
      distanceFromEnd: Math.hypot(projected.x - end.x, projected.y - end.y),
    };
    if (!nearest || next.distance < nearest.distance) nearest = next;
  }

  if (
    !nearest ||
    nearest.distance > maxDistanceFeet ||
    nearest.distanceFromStart < 0.25 ||
    nearest.distanceFromEnd < 0.25
  )
    return points;
  return [
    ...points.slice(0, nearest.edgeIndex + 1),
    nearest.point,
    ...points.slice(nearest.edgeIndex + 1),
  ];
}

function crossProduct(
  a: DeckOutlinePoint,
  b: DeckOutlinePoint,
  c: DeckOutlinePoint,
) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(
  point: DeckOutlinePoint,
  start: DeckOutlinePoint,
  end: DeckOutlinePoint,
) {
  return (
    Math.abs(crossProduct(start, end, point)) <= 0.000001 &&
    point.x >= Math.min(start.x, end.x) - 0.000001 &&
    point.x <= Math.max(start.x, end.x) + 0.000001 &&
    point.y >= Math.min(start.y, end.y) - 0.000001 &&
    point.y <= Math.max(start.y, end.y) + 0.000001
  );
}

function segmentsCross(
  a: DeckOutlinePoint,
  b: DeckOutlinePoint,
  c: DeckOutlinePoint,
  d: DeckOutlinePoint,
) {
  const first = crossProduct(a, b, c);
  const second = crossProduct(a, b, d);
  const third = crossProduct(c, d, a);
  const fourth = crossProduct(c, d, b);
  if (first * second < -0.000001 && third * fourth < -0.000001) return true;
  return (
    (Math.abs(first) <= 0.000001 && pointOnSegment(c, a, b)) ||
    (Math.abs(second) <= 0.000001 && pointOnSegment(d, a, b)) ||
    (Math.abs(third) <= 0.000001 && pointOnSegment(a, c, d)) ||
    (Math.abs(fourth) <= 0.000001 && pointOnSegment(b, c, d))
  );
}

export function isValidDeckOutline(points: readonly DeckOutlinePoint[]) {
  if (points.length < 3 || points.length > 24) return false;
  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return false;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (Math.hypot(end.x - start.x, end.y - start.y) < 0.25) return false;
    twiceArea += start.x * end.y - end.x * start.y;
  }
  if (Math.abs(twiceArea) < 1) return false;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first)
        continue;
      if (
        segmentsCross(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext],
        )
      )
        return false;
    }
  }
  return true;
}

export function closeDeckOutlineWithMeasuredWall(
  points: readonly DeckOutlinePoint[],
  finalWallLengthFeet: number,
) {
  if (
    !isValidDeckOutline(points) ||
    !Number.isFinite(finalWallLengthFeet) ||
    finalWallLengthFeet <= 0
  )
    return null;
  const lastIndex = points.length - 1;
  const first = points[0];
  const previous = points[lastIndex - 1];
  const last = points[lastIndex];
  const previousWallLength = Math.hypot(last.x - previous.x, last.y - previous.y);
  const centerDistance = Math.hypot(first.x - previous.x, first.y - previous.y);
  if (
    centerDistance < 0.000001 ||
    centerDistance > previousWallLength + finalWallLengthFeet ||
    centerDistance < Math.abs(previousWallLength - finalWallLengthFeet)
  )
    return null;
  const along = (
    previousWallLength ** 2 - finalWallLengthFeet ** 2 + centerDistance ** 2
  ) / (2 * centerDistance);
  const height = Math.sqrt(Math.max(0, previousWallLength ** 2 - along ** 2));
  const unit = {
    x: (first.x - previous.x) / centerDistance,
    y: (first.y - previous.y) / centerDistance,
  };
  const base = {
    x: previous.x + unit.x * along,
    y: previous.y + unit.y * along,
  };
  const candidates = [
    { x: base.x - unit.y * height, y: base.y + unit.x * height },
    { x: base.x + unit.y * height, y: base.y - unit.x * height },
  ].sort(
    (a, b) =>
      Math.hypot(a.x - last.x, a.y - last.y) -
      Math.hypot(b.x - last.x, b.y - last.y),
  );
  const resolved = candidates
    .map((candidate) => points.map((point, index) =>
      index === lastIndex
        ? { x: Number(candidate.x.toFixed(4)), y: Number(candidate.y.toFixed(4)) }
        : { ...point },
    ))
    .find(isValidDeckOutline);
  return resolved
    ? Object.freeze(resolved.map((point) => Object.freeze({ ...point })))
    : null;
}

export function applyDeckWallMeasurementInSequence(
  points: readonly DeckOutlinePoint[],
  edgeIndex: number,
  wallLengthFeet: number,
) {
  if (
    !isValidDeckOutline(points) ||
    !Number.isInteger(edgeIndex) ||
    edgeIndex < 0 ||
    edgeIndex >= points.length ||
    !Number.isFinite(wallLengthFeet) ||
    wallLengthFeet <= 0
  )
    return null;
  if (edgeIndex === points.length - 1)
    return closeDeckOutlineWithMeasuredWall(points, wallLengthFeet);

  const start = points[edgeIndex];
  const oldEnd = points[edgeIndex + 1];
  const currentLength = Math.hypot(oldEnd.x - start.x, oldEnd.y - start.y);
  if (currentLength < 0.000001) return null;
  const measuredEnd = {
    x: start.x + ((oldEnd.x - start.x) / currentLength) * wallLengthFeet,
    y: start.y + ((oldEnd.y - start.y) / currentLength) * wallLengthFeet,
  };
  const shift = { x: measuredEnd.x - oldEnd.x, y: measuredEnd.y - oldEnd.y };
  const rebuilt = points.map((point, index) => index > edgeIndex
    ? {
        x: Number((point.x + shift.x).toFixed(4)),
        y: Number((point.y + shift.y).toFixed(4)),
      }
    : { ...point });
  return isValidDeckOutline(rebuilt)
    ? Object.freeze(rebuilt.map((point) => Object.freeze({ ...point })))
    : null;
}

export type DeckWallDirection = Readonly<{
  x: number;
  y: number;
  turn: "start" | "straight" | "left" | "right";
  turnDegrees: number;
  snapped: boolean;
}>;

export function deckWallDirectionTemplate(points: readonly DeckOutlinePoint[]) {
  if (!isValidDeckOutline(points)) return null;
  const directions = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.000001) return null;
    const rawAngle = Math.atan2(dy, dx);
    const angleStep = Math.PI / 4;
    const snappedAngle = Math.round(rawAngle / angleStep) * angleStep;
    const difference = Math.abs(Math.atan2(
      Math.sin(rawAngle - snappedAngle),
      Math.cos(rawAngle - snappedAngle),
    ));
    const useSnap = difference <= (12 * Math.PI) / 180;
    const angle = useSnap ? snappedAngle : rawAngle;
    return { x: Math.cos(angle), y: Math.sin(angle), snapped: useSnap };
  });
  if (directions.some((direction) => !direction)) return null;
  return Object.freeze(directions.map((direction, index) => {
    const current = direction!;
    if (index === 0)
      return Object.freeze({ ...current, turn: "start" as const, turnDegrees: 0 });
    const previous = directions[index - 1]!;
    const dot = Math.max(-1, Math.min(1, previous.x * current.x + previous.y * current.y));
    const degrees = Number((Math.acos(dot) * 180 / Math.PI).toFixed(1));
    const cross = previous.x * current.y - previous.y * current.x;
    return Object.freeze({
      ...current,
      turn: degrees < 1 ? "straight" as const : cross > 0 ? "right" as const : "left" as const,
      turnDegrees: degrees,
    });
  }));
}

export function rebuildDeckOutlineFromWallMeasurements(
  roughOutline: readonly DeckOutlinePoint[],
  directions: readonly DeckWallDirection[],
  measuredLengths: readonly (number | null)[],
) {
  if (
    !isValidDeckOutline(roughOutline) ||
    directions.length !== roughOutline.length ||
    measuredLengths.length !== roughOutline.length
  )
    return null;
  const rebuilt: DeckOutlinePoint[] = [{ ...roughOutline[0] }];
  for (let index = 0; index < roughOutline.length - 1; index += 1) {
    const roughLength = Math.hypot(
      roughOutline[index + 1].x - roughOutline[index].x,
      roughOutline[index + 1].y - roughOutline[index].y,
    );
    const length = measuredLengths[index] ?? roughLength;
    if (!Number.isFinite(length) || length <= 0) return null;
    const start = rebuilt[index];
    rebuilt.push({
      x: Number((start.x + directions[index].x * length).toFixed(4)),
      y: Number((start.y + directions[index].y * length).toFixed(4)),
    });
  }
  return isValidDeckOutline(rebuilt)
    ? Object.freeze(rebuilt.map((point) => Object.freeze({ ...point })))
    : null;
}

function defaultPostPositions(lengthFeet: number, count = 3) {
  return Array.from({ length: count }, (_, index) =>
    String((lengthFeet * index) / Math.max(1, count - 1)),
  ).join(",");
}

export function deckEstimatingImmediateIssueIds(
  args: Readonly<{
    lengthFeet: number;
    widthFeet: number;
    draft: DeckPrescriptiveDraft;
    stairPlacementConfirmed: boolean;
  }>,
) {
  const issues: string[] = [];
  if (
    !Number.isFinite(args.lengthFeet) ||
    !Number.isFinite(args.widthFeet) ||
    args.lengthFeet <= 0 ||
    args.widthFeet <= 0 ||
    args.lengthFeet > 40 ||
    args.widthFeet > 18
  )
    issues.push("dimensions-profile");
  if (!args.draft.attachment) issues.push("attachment-fact");
  if (
    !args.draft.stairsIncluded ||
    (args.draft.stairsIncluded === "yes" && !args.stairPlacementConfirmed)
  )
    issues.push("stairs-fact");
  if (!args.draft.railingsIncluded) issues.push("railings-fact");
  if (
    args.draft.unusualGeometry ||
    args.draft.cantilever ||
    args.draft.roofOrSpecialLoad ||
    args.draft.attachment === "freestanding"
  )
    issues.push("outside-profile");
  return Object.freeze(issues);
}

export function recommendedPrescriptiveDraft(
  attachment: "ledger" | "freestanding",
  stairs: boolean,
  lengthFeet = 0,
  widthFeet = 0,
  railings = true,
): DeckPrescriptiveDraft {
  const tributaryArea =
    lengthFeet > 0 && widthFeet > 0 ? (widthFeet * (lengthFeet / 2)) / 2 : 0;
  const footing = lookupCeiling(FOOTING_1500, tributaryArea);
  const beamSpan = lengthFeet > 0 ? lengthFeet / 2 : 0;
  const beamOptions = Object.entries(BEAM_MAX_AT_12)
    .flatMap(([size, plies]) =>
      Object.entries(plies).map(([ply, limit]) => ({
        size: size as DeckPrescriptiveDraft["beamSize"],
        ply: ply as DeckPrescriptiveDraft["beamPlies"],
        limit,
        material: Number(size.slice(2)) * Number(ply),
      })),
    )
    .filter((option) => beamSpan > 0 && beamSpan <= option.limit)
    .sort(
      (a, b) =>
        a.material - b.material ||
        Number(a.ply) - Number(b.ply) ||
        Number(a.size.slice(2)) - Number(b.size.slice(2)),
    );
  const beam = beamOptions[0];
  return {
    jurisdiction: "",
    attachment,
    attachmentConfirmed: false,
    ledgerSubstrate: attachment === "ledger" ? "" : "unknown",
    joistDirection: "house_to_yard",
    joistSpacingInches: "16",
    joistSize: "2x10",
    speciesGrade: "southern_pine_no2",
    treatmentService: "pressure_treated_wet_service",
    designLoad: "40_live_10_dead",
    beamLineCount: attachment === "ledger" ? "1" : "2",
    beamDistanceFromHouseFeet: widthFeet > 0 ? String(widthFeet) : "",
    beamSize: beam?.size ?? "",
    beamPlies: beam?.ply ?? "",
    postCount: "3",
    postPositionsFeet: lengthFeet > 0 ? defaultPostPositions(lengthFeet) : "",
    postPlacementMode: "aligned",
    postDistancesFromHouseFeet:
      widthFeet > 0 ? [widthFeet, widthFeet, widthFeet].join(",") : "",
    postSnapInches: "1",
    postSize: "6x6",
    postHeightFeet: "",
    footingCount: "3",
    footingDiameterInches: footing ? String(footing.diameter) : "",
    footingThicknessInches: footing ? String(footing.thickness) : "",
    footingDepthInches: "",
    soilBearingPsf: "1500",
    frostBasis: "",
    extraBlockingRows: "0",
    hardwareBasis: "",
    stairsIncluded: stairs ? "yes" : "no",
    railingsIncluded: railings ? "yes" : "no",
    stairsConfirmed: false,
    stairStringerCount: stairs ? "3" : "0",
    stairLandingFootingCount: stairs ? "2" : "0",
    unusualGeometry: false,
    cantilever: false,
    roofOrSpecialLoad: false,
    soilOrFootingUncertain: false,
  };
}

export function buildPrescriptiveDeckPlan(
  args: Readonly<{
    lengthFeet: number;
    widthFeet: number;
    draft: DeckPrescriptiveDraft;
  }>,
): DeckPrescriptivePlan {
  const d = args.draft;
  const exceptions: string[] = [];
  const checks: {
    sourceId: string;
    result: "pass" | "exception";
    actual: string;
    limit: string;
  }[] = [];
  const fail = (message: string) => exceptions.push(message);
  if (
    !Number.isFinite(args.lengthFeet) ||
    !Number.isFinite(args.widthFeet) ||
    args.lengthFeet <= 0 ||
    args.widthFeet <= 0 ||
    args.lengthFeet > 40 ||
    args.widthFeet > 18
  )
    fail(
      "Deck dimensions must be finite, positive, and within this profile's 40 ft × 18 ft rectangular limit.",
    );
  if (
    d.jurisdiction !== "city_knoxville_verified" &&
    d.jurisdiction !== "city_knoxville_estimating_assumption"
  )
    fail(
      "City of Knoxville jurisdiction is not explicitly verified or selected as an estimating-only assumption.",
    );
  if (!d.attachmentConfirmed || !d.stairsConfirmed)
    fail("Confirm the blueprint attachment and stair facts before review.");
  if (!d.attachment || !d.stairsIncluded || !d.railingsIncluded)
    fail(
      "Confirm attachment, stair, and railing applicability from the approved field facts.",
    );
  if (d.attachment === "freestanding")
    fail(
      "Freestanding support geometry is not supported by this profile yet; use an engineer/AHJ-approved plan.",
    );
  if (
    d.attachment === "ledger" &&
    d.ledgerSubstrate !== "verified_band_rim" &&
    d.ledgerSubstrate !== "estimating_band_rim_assumption"
  )
    fail(
      "This ledger path supports only a verified band/rim joist or an explicitly unresolved estimating assumption; concrete, veneer, and other substrates need an approved detail.",
    );
  if (
    d.speciesGrade !== "southern_pine_no2" ||
    d.treatmentService !== "pressure_treated_wet_service"
  )
    fail(
      "This profile supports only No. 2 Southern Pine with the wet-service table factor and verified pressure treatment/service use.",
    );
  if (d.designLoad !== "40_live_10_dead")
    fail(
      "This profile supports only 40 psf live plus 10 psf dead load; snow or greater loads require another approved profile.",
    );
  if (d.unusualGeometry || d.cantilever || d.roofOrSpecialLoad)
    fail(
      "Nonrectangular geometry, cantilevers, roofs, hot tubs, and special loads are outside this profile.",
    );
  if (
    d.soilOrFootingUncertain ||
    d.soilBearingPsf !== "1500" ||
    !d.frostBasis.trim()
  )
    fail(
      "Document 1,500 psf soil bearing and the AHJ-verified frost-depth basis; uncertain soil/frost conditions stop the draft.",
    );
  const beamLines = whole(d.beamLineCount),
    beamDistance = positive(d.beamDistanceFromHouseFeet),
    plies = whole(d.beamPlies),
    posts = whole(d.postCount),
    postPositions = parseDeckPostPositions(
      d.postPositionsFeet,
      args.lengthFeet,
    ),
    postDistances = posts
      ? parseDeckPostDistances(
          d.postDistancesFromHouseFeet,
          args.widthFeet,
          posts,
        )
      : null,
    footings = whole(d.footingCount),
    postHeight = positive(d.postHeightFeet),
    footingDiameter = positive(d.footingDiameterInches),
    footingThickness = positive(d.footingThicknessInches),
    footingDepth = positive(d.footingDepthInches);
  if (
    !beamLines ||
    !plies ||
    !posts ||
    !footings ||
    !postHeight ||
    !footingDiameter ||
    !footingThickness ||
    !footingDepth
  )
    fail("Enter positive beam, post, and footing dimensions/counts.");
  if (!beamDistance || beamDistance > args.widthFeet)
    fail("Place the support beam within the proposed deck depth.");
  if (beamDistance && Math.abs(beamDistance - args.widthFeet) > 0.01)
    fail(
      "This bounded profile supports the beam at the outside edge only; an inset beam creates an overhang that needs a reviewed design.",
    );
  if (!postPositions || postPositions.length !== posts)
    fail("Place every post once along the support beam.");
  if (!postDistances) fail("Place every post within the proposed deck depth.");
  if (d.postPlacementMode !== "aligned")
    fail(
      "Free-positioned posts require a reviewed custom beam/support plan before structural quantities can be approved.",
    );
  if (
    d.postPlacementMode === "aligned" &&
    postDistances?.some(
      (distance) => !beamDistance || Math.abs(distance - beamDistance) > 0.01,
    )
  )
    fail("Aligned posts must remain on the same support-beam line.");
  if (
    postPositions &&
    (Math.abs(postPositions[0]) > 0.01 ||
      Math.abs(postPositions[postPositions.length - 1] - args.lengthFeet) >
        0.01)
  )
    fail(
      "This bounded profile supports end posts at the beam ends only; an overhanging beam needs a reviewed design.",
    );
  if (d.attachment === "ledger" && beamLines !== 1)
    fail("The supported attached layout has exactly one exterior beam line.");
  if (
    (posts ?? 0) > 20 ||
    (footings ?? 0) > 24 ||
    (postHeight ?? 0) > 14 ||
    (footingDiameter ?? 0) > 120 ||
    (footingThickness ?? 0) > 48 ||
    (footingDepth ?? 0) > 120
  )
    fail("A count or dimension exceeds this profile's bounded input limits.");
  if (!/^\d+$/.test(d.extraBlockingRows) || Number(d.extraBlockingRows) > 10)
    fail("Extra blocking rows must be a whole number from 0 through 10.");
  if (posts && footings && footings < posts)
    fail("Provide at least one footing per post.");
  if (d.joistDirection !== "house_to_yard")
    fail("The initial profile supports joists running house-to-yard only.");
  const joistSpan = beamDistance ?? args.widthFeet;
  const joistLimit =
    d.joistSize && d.joistSpacingInches
      ? JOIST_MAX[d.joistSize]?.[d.joistSpacingInches]
      : null;
  if (!joistLimit || !atOrBelow(joistSpan, joistLimit))
    fail(
      "Joist size/spacing/span exceeds IRC 2024 Table R507.6 or is unsupported.",
    );
  checks.push({
    sourceId: "IRC2024:Table-R507.6",
    result:
      joistLimit && atOrBelow(joistSpan, joistLimit) ? "pass" : "exception",
    actual: `${joistSpan} ft`,
    limit: joistLimit ? `${joistLimit.toFixed(2)} ft max` : "unsupported",
  });
  const beamSpan = postPositions
    ? Math.max(
        ...postPositions
          .slice(1)
          .map((position, index) => position - postPositions[index]),
      )
    : Infinity;
  const beamLimit =
    joistSpan === 12 && d.beamSize && d.beamPlies
      ? BEAM_MAX_AT_12[d.beamSize]?.[d.beamPlies]
      : null;
  if (!beamLimit || !atOrBelow(beamSpan, beamLimit))
    fail(
      "Beam check is supported only for an exact 12 ft joist span and the listed Southern Pine sizes/plies; post spacing exceeds the table limit or is unsupported.",
    );
  checks.push({
    sourceId: "IRC2024:Table-R507.5(1):12ft-no-cantilever",
    result: beamLimit && atOrBelow(beamSpan, beamLimit) ? "pass" : "exception",
    actual: `${beamSpan.toFixed(2)} ft`,
    limit: beamLimit ? `${beamLimit.toFixed(2)} ft max` : "unsupported",
  });
  const tributaryArea = (joistSpan * beamSpan) / 2;
  const postRow = lookupCeiling(POST_MAX_4X4, tributaryArea);
  const postLimit =
    d.postSize === "4x4"
      ? (postRow?.height ?? null)
      : d.postSize === "6x6"
        ? 14
        : null;
  if (!postLimit || !postHeight || !atOrBelow(postHeight, postLimit))
    fail("Post size/height exceeds IRC 2024 Table R507.4 or is unsupported.");
  checks.push({
    sourceId: "IRC2024:Table-R507.4",
    result:
      postLimit && postHeight && atOrBelow(postHeight, postLimit)
        ? "pass"
        : "exception",
    actual: `${postHeight ?? "?"} ft at ${tributaryArea.toFixed(2)} sq ft tributary`,
    limit: postLimit ? `${postLimit.toFixed(2)} ft max` : "unsupported",
  });
  const footingRow = lookupCeiling(FOOTING_1500, tributaryArea);
  if (
    !footingRow ||
    !footingDiameter ||
    !footingThickness ||
    footingDiameter < footingRow.diameter ||
    footingThickness < footingRow.thickness ||
    !footingDepth
  )
    fail(
      "Footing diameter/thickness/depth does not satisfy IRC 2024 Table R507.3.1 plus the documented frost basis.",
    );
  checks.push({
    sourceId: "IRC2024:Table-R507.3.1:1500psf",
    result:
      footingRow &&
      footingDiameter &&
      footingThickness &&
      footingDiameter >= footingRow.diameter &&
      footingThickness >= footingRow.thickness
        ? "pass"
        : "exception",
    actual: `${footingDiameter ?? "?"} in dia × ${footingThickness ?? "?"} in thick; ${tributaryArea.toFixed(2)} sq ft`,
    limit: footingRow
      ? `≥${footingRow.diameter} in dia × ≥${footingRow.thickness} in thick`
      : "unsupported",
  });
  const unresolvedPackages = Object.freeze([
    ...(d.stairsIncluded === "yes" ? ["stairs" as const] : []),
    ...(d.railingsIncluded === "yes" ? ["guard_schedule" as const] : []),
    ...(d.jurisdiction === "city_knoxville_estimating_assumption"
      ? ["jurisdiction" as const]
      : []),
    ...(d.ledgerSubstrate === "estimating_band_rim_assumption"
      ? ["ledger_detail" as const]
      : []),
    ...(d.frostBasis.includes("estimating assumption")
      ? ["soil_frost" as const]
      : []),
    "connector_schedule" as const,
  ]);
  const inputs = Object.freeze({
    lengthFeet: args.lengthFeet,
    widthFeet: args.widthFeet,
    draft: d,
  });
  if (exceptions.length)
    return Object.freeze({
      evidenceVersion: "deck-framing-evidence-v2",
      status: "exception_review",
      profileId: KNOXVILLE_2024_DECK_PROFILE.id,
      inputs,
      checks: Object.freeze(checks),
      unresolvedPackages,
      exceptions: Object.freeze(exceptions),
      quantities: null,
      bom: Object.freeze([]),
      hardwareSchedule: Object.freeze([]),
      reference: null,
    });
  const spacing = Number(d.joistSpacingInches),
    joists = Math.ceil((args.lengthFeet * 12) / spacing) + 1,
    blockingRows = Math.max(0, Number(d.extraBlockingRows) || 0),
    blockingPieces = blockingRows * (joists - 1),
    beamLF = beamLines! * args.lengthFeet * plies!,
    ledgerLF = d.attachment === "ledger" ? args.lengthFeet : 0,
    rimLF =
      d.attachment === "ledger"
        ? args.lengthFeet + 2 * args.widthFeet
        : 2 * (args.lengthFeet + args.widthFeet),
    concreteCubicYards =
      (Math.PI *
        Math.pow(footingDiameter! / 24, 2) *
        (footingThickness! / 12) *
        footings!) /
      27;
  const quantities = Object.freeze({
    joists,
    beamLinearFeet: beamLF,
    posts: posts!,
    footings: footings!,
    blockingPieces,
    ledgerLinearFeet: ledgerLF,
    rimLinearFeet: rimLF,
    joistHangers: d.attachment === "ledger" ? joists : 0,
    postBases: posts!,
    postCaps: posts!,
    stairStringers: 0,
    stairLandingFootings: 0,
  });
  const bom: FramingBomLine[] = [
    {
      key: "joists",
      description: `PT No. 2 Southern Pine ${d.joistSize} × ${args.widthFeet} ft joists`,
      quantity: joists,
      unit: "ea",
      sourceId: "IRC2024:Table-R507.6",
    },
    {
      key: "beam_plies",
      description: `PT No. 2 Southern Pine ${d.beamSize} × ${args.lengthFeet} ft beam plies`,
      quantity: beamLines! * plies!,
      unit: "ea",
      sourceId: "IRC2024:Table-R507.5(1)",
    },
    {
      key: "posts",
      description: `PT No. 2 Southern Pine ${d.postSize} × ${postHeight!} ft posts`,
      quantity: posts!,
      unit: "ea",
      sourceId: "IRC2024:Table-R507.4",
    },
    {
      key: "footing_concrete",
      description: `${footingDiameter} in round × ${footingThickness} in pad-only concrete volume; bottom depth ${footingDepth} in (pier/stem concrete not included)`,
      quantity: Number(concreteCubicYards.toFixed(3)),
      unit: "cu yd",
      sourceId: "IRC2024:Table-R507.3.1",
    },
    {
      key: "joist_hanger_locations",
      description:
        "Geometric joist-hanger connection locations; connector model and fasteners unresolved",
      quantity: quantities.joistHangers,
      unit: "ea",
      sourceId: "approved-plan-geometry-only",
    },
    {
      key: "post_base_locations",
      description:
        "Geometric post-base connection locations; connector model and anchors unresolved",
      quantity: quantities.postBases,
      unit: "ea",
      sourceId: "approved-plan-geometry-only",
    },
    {
      key: "post_cap_locations",
      description:
        "Geometric post-cap connection locations; connector model and fasteners unresolved",
      quantity: quantities.postCaps,
      unit: "ea",
      sourceId: "approved-plan-geometry-only",
    },
  ];
  if (ledgerLF)
    bom.push({
      key: "ledger",
      description: `PT No. 2 Southern Pine 2x8 × ${args.lengthFeet} ft ledger member (minimum ledger size)`,
      quantity: 1,
      unit: "ea",
      sourceId: "IRC2024:R507.9",
    });
  bom.push({
    key: "rim_long",
    description: `PT No. 2 Southern Pine ${d.joistSize} × ${args.lengthFeet} ft outer rim member`,
    quantity: 1,
    unit: "ea",
    sourceId: "approved-plan-geometry",
  });
  if (blockingPieces)
    bom.push({
      key: "extra_blocking",
      description: `Reviewed extra blocking: PT No. 2 Southern Pine ${d.joistSize} cut to bay`,
      quantity: blockingPieces,
      unit: "ea",
      sourceId: "human-reviewed-extra",
    });
  const ledgerFasteners = Math.ceil((args.lengthFeet * 12) / 15) + 1;
  const beamPlyNails =
    Math.max(0, plies! - 1) * 2 * (Math.ceil((args.lengthFeet * 12) / 16) + 1);
  const hardwareSchedule: FramingHardwareRequirement[] = [
    {
      key: "ledger_fasteners",
      quantity: ledgerFasteners,
      unit: "ea",
      specification:
        "1/2-in lag-screw path at 15 in maximum on center for a 12-ft joist span; verify wood structural/sawn sheathing is no more than 1/2 in, band-joist penetration, edge distances, corrosion resistance, and compatible listed product before purchase",
      sourceId: "IRC2024:Table-R507.9.1.3(1)-(2)",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "ledger_washers",
      quantity: ledgerFasteners,
      unit: "ea",
      specification:
        "Washers compatible with the selected 1/2-in ledger-fastener path and treated lumber; verify dimensions/material with the approved fastener schedule",
      sourceId: "IRC2024:R507.9.1.3:selected-path",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "ledger_flashing",
      quantity: args.lengthFeet,
      unit: "ln ft",
      specification:
        "Ledger flashing above the ledger, minimum 2 in vertical and 4 in beyond the ledger face (or code-permitted face/downturn detail); verify wall/opening conditions and compatible flashing material",
      sourceId: "IRC2024:R507.9.1.5",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "wrb_counterflashing_integration",
      quantity: args.lengthFeet,
      unit: "ln ft",
      specification:
        "Reviewed WRB/counterflashing integration compatible with the existing wall: lap over the vertical flashing leg as required, or use an allowed self-adhered counterflashing/spaced-ledger exception; verify actual wall layers and openings",
      sourceId: "IRC2024:R507.9.1.6-R507.9.1.8",
      selectionStatus: "detail_required",
    },
    {
      key: "joist_hangers",
      quantity: joists,
      unit: "ea",
      specification: `Hanger sized for ${d.joistSize}; minimum 60% of member depth and minimum ${d.joistSize === "2x6" ? 400 : d.joistSize === "2x8" ? 500 : d.joistSize === "2x10" ? 600 : 700} lb vertical capacity; use manufacturer-specified corrosion-compatible fasteners`,
      sourceId: "AWC-DCA6-2015:Joist-Hangers:Table-3A:reference",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "hanger_fasteners",
      quantity: 0,
      unit: "ea",
      specification:
        "Use the selected hanger manufacturer's exact approved nail/screw schedule; quantity cannot be calculated until the hanger model is selected; deck screws are not structural hanger fasteners",
      sourceId: "AWC-DCA6-2015:Joist-Hangers:manufacturer-schedule-required",
      selectionStatus: "detail_required",
    },
    {
      key: "joist_to_beam",
      quantity: joists,
      unit: "ea",
      specification:
        "One reviewed joist-to-beam connection at each joist; mechanical connector path requires minimum 100 lb capacity in both uplift and lateral directions",
      sourceId: "AWC-DCA6-2015:Figure-6:reference",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "joist_to_beam_fasteners",
      quantity: 0,
      unit: "ea",
      specification:
        "Use the selected joist-to-beam connector manufacturer's exact corrosion-compatible fastener schedule; quantity remains unresolved until the connector model is selected",
      sourceId: "AWC-DCA6-2015:Figure-6:manufacturer-schedule-required",
      selectionStatus: "detail_required",
    },
    {
      key: "rim_to_joist_restraint",
      quantity: joists * 3,
      unit: "ea",
      specification:
        "Selected rim-joist restraint path: three 10d (3 in × 0.128 in) nails or three No. 10 × 3 in wood screws at the end of every joist; select one corrosion-compatible allowed fastener product",
      sourceId: "IRC2024:R507.6.2",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "post_bases",
      quantity: posts!,
      unit: "ea",
      specification: `Approved post-to-footing lateral-restraint connector sized for ${d.postSize} post and concrete assembly; verify anchor and corrosion compatibility`,
      sourceId: "IRC2024:R507.4.1",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "post_base_anchors",
      quantity: posts!,
      unit: "ea",
      specification:
        "One anchor location per post base; exact anchor product, diameter, embedment, edge distance, and concrete compatibility require the selected base and manufacturer schedule",
      sourceId: "IRC2024:R507.4.1:approved-connector-path",
      selectionStatus: "detail_required",
    },
    {
      key: "post_caps",
      quantity: posts!,
      unit: "ea",
      specification: `Manufactured post-to-beam connector sized for ${d.postSize} post and ${plies}-${d.beamSize} beam, capable of resisting lateral displacement; verify bolts/washers and manufacturer schedule`,
      sourceId: "IRC2024:R507.5.2",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "post_cap_fasteners",
      quantity: 0,
      unit: "ea",
      specification:
        "Bolts, washers, nails, or screws must follow the selected post-cap manufacturer's schedule; quantity remains unresolved until model selection",
      sourceId: "IRC2024:R507.5.2:manufacturer-schedule-required",
      selectionStatus: "detail_required",
    },
    {
      key: "lateral_load_connections",
      quantity: 2,
      unit: "ea",
      specification:
        "Two hold-down tension-device locations, each minimum 1,500 lb ASD capacity and within 24 in of each deck end; verify house framing/load path and listed compatible device",
      sourceId: "IRC2024:R507.9.2:Figure-1-path",
      selectionStatus: "compatible_product_and_price_required",
    },
    {
      key: "lateral_load_fasteners",
      quantity: 0,
      unit: "ea",
      specification:
        "Use the selected hold-down manufacturer's exact fastener/rod/anchor schedule; verify house framing, joist orientation, sheathing/substrate, penetration, and continuous load path before purchase",
      sourceId: "IRC2024:R507.9.2:Figure-1:manufacturer-schedule-required",
      selectionStatus: "detail_required",
    },
    {
      key: "picture_frame_blocking_connectors",
      quantity: 0,
      unit: "ea",
      specification:
        "Only when the selected board layout uses a picture-frame/divider joint: reviewed blocking lumber, support layout, connectors, and manufacturer fasteners; quantity remains unresolved until that layout is selected",
      sourceId: "approved-decking-manufacturer-layout:detail-required",
      selectionStatus: "detail_required",
    },
  ];
  if (beamPlyNails > 0)
    hardwareSchedule.splice(8, 0, {
      key: "beam_ply_fasteners",
      quantity: beamPlyNails,
      unit: "ea",
      specification:
        "For this multi-ply beam: two rows of minimum 10d (3 in × 0.128 in) nails at 16 in on center along each edge; purchase quantity must cover the calculated minimum",
      sourceId: "IRC2024:R507.5",
      selectionStatus: "compatible_product_and_price_required",
    });
  if (d.railingsIncluded === "yes")
    hardwareSchedule.push({
      key: "guard_system_connections",
      quantity: 0,
      unit: "ea",
      specification:
        "Reviewed guard system layout must identify posts, corners, ends, blocking/load path, attachments, and manufacturer fasteners; do not rely on end-grain withdrawal",
      sourceId: "IRC2024:R507.10-R507.10.1",
      selectionStatus: "detail_required",
    });
  if (d.stairsIncluded === "yes")
    hardwareSchedule.push({
      key: "guard_stair_connections",
      quantity: 0,
      unit: "ea",
      specification:
        "Guard, handrail, stair-stringer, landing, and stair-footing connections require the reviewed stair/guard detail; no product or quantity is inferred",
      sourceId: "IRC2024:R507.10-and-R311.7:detail-required",
      selectionStatus: "detail_required",
    });
  const reference = `${KNOXVILLE_2024_DECK_PROFILE.id}; main deck framing only; ${args.lengthFeet}x${args.widthFeet} ft; ${d.joistSize}@${spacing}in OC; ${d.beamPlies}-${d.beamSize}; ${d.postSize} posts; ${footingDiameter}in footing pads; unresolved ${unresolvedPackages.join(",")}; rules ${KNOXVILLE_2024_DECK_PROFILE.rules.join(",")}`;
  return Object.freeze({
    evidenceVersion: "deck-framing-evidence-v2",
    status: "ready_for_human_review",
    profileId: KNOXVILLE_2024_DECK_PROFILE.id,
    inputs,
    checks: Object.freeze(checks),
    unresolvedPackages,
    exceptions: Object.freeze([]),
    quantities,
    bom: Object.freeze(bom),
    hardwareSchedule: Object.freeze(hardwareSchedule),
    reference,
  });
}

export function isCanonicalFramingEvidence(
  value: unknown,
): value is DeckPrescriptivePlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as DeckPrescriptivePlan;
  const top = new Set([
    "evidenceVersion",
    "status",
    "profileId",
    "inputs",
    "checks",
    "unresolvedPackages",
    "exceptions",
    "quantities",
    "bom",
    "hardwareSchedule",
    "reference",
  ]);
  if (
    Object.keys(plan).length !== top.size ||
    !Object.keys(plan).every((key) => top.has(key))
  )
    return false;
  if (
    plan.evidenceVersion !== "deck-framing-evidence-v2" ||
    plan.status !== "ready_for_human_review" ||
    plan.profileId !== KNOXVILLE_2024_DECK_PROFILE.id
  )
    return false;
  if (
    !plan.inputs ||
    typeof plan.inputs !== "object" ||
    Array.isArray(plan.inputs)
  )
    return false;
  const inputKeys = new Set(["lengthFeet", "widthFeet", "draft"]);
  if (
    Object.keys(plan.inputs).length !== inputKeys.size ||
    !Object.keys(plan.inputs).every((key) => inputKeys.has(key))
  )
    return false;
  const draftKeys = new Set(
    Object.keys(recommendedPrescriptiveDraft("ledger", false)),
  );
  const legacyDraftKeys = new Set(
    [...draftKeys].filter(
      (key) =>
        ![
          "beamDistanceFromHouseFeet",
          "postPositionsFeet",
          "postPlacementMode",
          "postDistancesFromHouseFeet",
          "postSnapInches",
        ].includes(key),
    ),
  );
  if (!plan.inputs.draft) return false;
  const actualDraftKeys = Object.keys(plan.inputs.draft);
  const isCurrentDraft =
    actualDraftKeys.length === draftKeys.size &&
    actualDraftKeys.every((key) => draftKeys.has(key));
  const isLegacyDraft =
    actualDraftKeys.length === legacyDraftKeys.size &&
    actualDraftKeys.every((key) => legacyDraftKeys.has(key));
  if (!isCurrentDraft && !isLegacyDraft) return false;
  if (
    !Number.isFinite(plan.inputs.lengthFeet) ||
    !Number.isFinite(plan.inputs.widthFeet)
  )
    return false;
  if (
    Object.values(plan.inputs.draft).some(
      (entry) => typeof entry === "string" && entry.length > 160,
    )
  )
    return false;
  const template = recommendedPrescriptiveDraft("ledger", false);
  if (
    Object.entries(plan.inputs.draft).some(
      ([key, entry]) =>
        typeof entry !== typeof template[key as keyof DeckPrescriptiveDraft],
    )
  )
    return false;
  const normalizedDraft = isLegacyDraft
    ? ({
        ...plan.inputs.draft,
        beamDistanceFromHouseFeet: String(plan.inputs.widthFeet),
        postPositionsFeet: defaultPostPositions(
          plan.inputs.lengthFeet,
          Number(plan.inputs.draft.postCount),
        ),
        postPlacementMode: "aligned",
        postDistancesFromHouseFeet: Array.from(
          { length: Number(plan.inputs.draft.postCount) },
          () => String(plan.inputs.widthFeet),
        ).join(","),
        postSnapInches: "1",
      } as DeckPrescriptiveDraft)
    : plan.inputs.draft;
  const rebuilt = buildPrescriptiveDeckPlan({
    ...plan.inputs,
    draft: normalizedDraft,
  });
  if (rebuilt.status !== "ready_for_human_review") return false;
  if (!isLegacyDraft) return JSON.stringify(rebuilt) === JSON.stringify(plan);
  const comparable = JSON.parse(JSON.stringify(rebuilt)) as {
    inputs: { draft: Record<string, unknown> };
  };
  delete comparable.inputs.draft.beamDistanceFromHouseFeet;
  delete comparable.inputs.draft.postPositionsFeet;
  delete comparable.inputs.draft.postPlacementMode;
  delete comparable.inputs.draft.postDistancesFromHouseFeet;
  delete comparable.inputs.draft.postSnapInches;
  return JSON.stringify(comparable) === JSON.stringify(plan);
}

export function assertPartialFramingEvidenceBinding(
  plan: Readonly<{
    buildPlanReference: string;
    buildPlanConfirmed: boolean;
    framingPlanEvidence?: DeckPrescriptivePlan | null;
    additionalLines: readonly Readonly<{
      key: string;
      description: string;
      quantity: string;
      unit: string;
    }>[];
    hardwareSelections?: readonly Readonly<{
      key: string;
      description: string;
      quantity: string;
      unit: string;
      verificationReference?: string;
    }>[];
  }>,
) {
  const evidence = plan.framingPlanEvidence;
  if (!evidence) return;
  if (
    !isCanonicalFramingEvidence(evidence) ||
    evidence.reference !== plan.buildPlanReference
  ) {
    throw new TypeError("The framing plan evidence binding is invalid.");
  }
  if (!evidence.unresolvedPackages.length || plan.buildPlanConfirmed) {
    throw new TypeError(
      "Partial framing evidence cannot confirm a complete build plan.",
    );
  }
  const groups: Record<string, readonly string[]> = {
    ledger_attachment: ["ledger"],
    joists: ["joists"],
    beams: ["beam_plies"],
    posts: ["posts"],
    footings: ["footing_concrete"],
    blocking: ["rim_long", "extra_blocking"],
  };
  for (const [lineKey, bomKeys] of Object.entries(groups)) {
    const members = evidence.bom.filter((item) => bomKeys.includes(item.key));
    const line = plan.additionalLines.find((item) => item.key === lineKey);
    const expectedDescription = members
      .map((item) => item.description)
      .join("; ");
    const expectedQuantity = String(
      members.reduce((sum, item) => sum + item.quantity, 0),
    );
    const expectedUnit = members[0]?.unit ?? "";
    if (
      !line ||
      line.description !== expectedDescription ||
      line.quantity !== expectedQuantity ||
      line.unit !== expectedUnit
    ) {
      throw new TypeError(
        "A generated structural line does not match the canonical framing evidence.",
      );
    }
  }
  const selections = plan.hardwareSelections ?? [];
  if (
    selections.length !== evidence.hardwareSchedule.length ||
    new Set(selections.map((item) => item.key)).size !== selections.length
  ) {
    throw new TypeError(
      "The hardware selection schedule does not match the canonical framing evidence.",
    );
  }
  for (const requirement of evidence.hardwareSchedule) {
    const selection = selections.find((item) => item.key === requirement.key);
    if (
      !selection ||
      selection.description !== requirement.specification ||
      selection.unit !== requirement.unit
    ) {
      throw new TypeError(
        "A hardware selection does not match the canonical framing requirement.",
      );
    }
  }
}
