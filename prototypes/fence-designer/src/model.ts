export const SCHEMA_VERSION = 2 as const;
export const MM_PER_FOOT = 304.8;
export const MM_PER_INCH = 25.4;

export type Point = Readonly<{ id: string; xMm: number; yMm: number }>;
export type SegmentKind = "fence" | "gate";
export type GateType = "single" | "double";
export type Segment = Readonly<{
  id: string;
  fromPointId: string;
  toPointId: string;
  kind: SegmentKind;
  gateType?: GateType;
}>;
export type HouseReference = Readonly<{ xMm: number; yMm: number; lengthMm: number; widthMm: number }>;
export type FenceDesign = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  revision: number;
  house: HouseReference | null;
  points: readonly Point[];
  segments: readonly Segment[];
}>;

export const EMPTY_DESIGN: FenceDesign = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  id: "local-fence-design",
  name: "Untitled fence layout",
  revision: 0,
  house: null,
  points: Object.freeze([]),
  segments: Object.freeze([]),
});

const integer = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer.`);
  return value;
};

const text = (value: unknown, label: string, max = 120): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
};

export function normalizeDesign(input: unknown): FenceDesign {
  if (!input || typeof input !== "object") throw new TypeError("Fence design must be an object.");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== SCHEMA_VERSION) throw new TypeError("Unsupported fence design schema version.");
  if (!Array.isArray(raw.points) || !Array.isArray(raw.segments)) throw new TypeError("Fence design points and segments must be arrays.");
  const points = raw.points.map((item, index) => {
    if (!item || typeof item !== "object") throw new TypeError(`Point ${index + 1} must be an object.`);
    const point = item as Record<string, unknown>;
    return Object.freeze({ id: text(point.id, `Point ${index + 1} ID`, 80), xMm: integer(point.xMm, `Point ${index + 1} x`), yMm: integer(point.yMm, `Point ${index + 1} y`) });
  });
  if (new Set(points.map(({ id }) => id)).size !== points.length) throw new TypeError("Point IDs must be unique.");
  const pointIds = new Set(points.map(({ id }) => id));
  const segments = raw.segments.map((item, index) => {
    if (!item || typeof item !== "object") throw new TypeError(`Segment ${index + 1} must be an object.`);
    const segment = item as Record<string, unknown>;
    const kind = segment.kind === "gate" ? "gate" as const : segment.kind === "fence" ? "fence" as const : (() => { throw new TypeError(`Segment ${index + 1} kind is invalid.`); })();
    const gateType = kind === "gate"
      ? segment.gateType === undefined || segment.gateType === "single" ? "single" as const : segment.gateType === "double" ? "double" as const : (() => { throw new TypeError(`Segment ${index + 1} gate type is invalid.`); })()
      : undefined;
    const normalized = Object.freeze({
      id: text(segment.id, `Segment ${index + 1} ID`, 80),
      fromPointId: text(segment.fromPointId, `Segment ${index + 1} start`, 80),
      toPointId: text(segment.toPointId, `Segment ${index + 1} end`, 80),
      kind,
      ...(gateType ? { gateType } : {}),
    });
    if (!pointIds.has(normalized.fromPointId) || !pointIds.has(normalized.toPointId)) throw new TypeError(`Segment ${index + 1} references a missing point.`);
    if (normalized.fromPointId === normalized.toPointId) throw new TypeError(`Segment ${index + 1} cannot connect a point to itself.`);
    return normalized;
  });
  if (new Set(segments.map(({ id }) => id)).size !== segments.length) throw new TypeError("Segment IDs must be unique.");
  if (segments.length !== Math.max(0, points.length - 1)) throw new TypeError("A fence design must be one connected path.");
  segments.forEach((segment, index) => {
    if (segment.fromPointId !== points[index]?.id || segment.toPointId !== points[index + 1]?.id) throw new TypeError("Fence segments must connect adjacent points in order.");
  });
  let house: HouseReference | null = null;
  if (raw.schemaVersion === SCHEMA_VERSION && raw.house !== null) {
    if (!raw.house || typeof raw.house !== "object") throw new TypeError("House reference must be an object or null.");
    const item = raw.house as Record<string, unknown>;
    const lengthMm = integer(item.lengthMm, "House length");
    const widthMm = integer(item.widthMm, "House width");
    if (lengthMm < 305 || lengthMm > 304_800 || widthMm < 305 || widthMm > 304_800) throw new RangeError("House length and width must each be from 1 through 1,000 feet.");
    house = Object.freeze({ xMm: integer(item.xMm, "House x"), yMm: integer(item.yMm, "House y"), lengthMm, widthMm });
  }
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    id: text(raw.id, "Design ID", 80),
    name: text(raw.name, "Design name"),
    revision: integer(raw.revision, "Revision"),
    house,
    points: Object.freeze(points),
    segments: Object.freeze(segments),
  });
}

const revise = (design: FenceDesign, patch: Partial<Pick<FenceDesign, "points" | "segments" | "name" | "house">>): FenceDesign => normalizeDesign({ ...design, ...patch, revision: design.revision + 1 });

export function setHouseReference(design: FenceDesign, lengthMm: number, widthMm: number): FenceDesign {
  if (!Number.isSafeInteger(lengthMm) || lengthMm < 305 || lengthMm > 304_800 || !Number.isSafeInteger(widthMm) || widthMm < 305 || widthMm > 304_800) throw new RangeError("House length and width must each be from 1 through 1,000 feet.");
  const current = design.house;
  return revise(design, { house: Object.freeze({ xMm: current?.xMm ?? 0, yMm: current?.yMm ?? 0, lengthMm, widthMm }) });
}

export function removeHouseReference(design: FenceDesign): FenceDesign {
  return revise(design, { house: null });
}

export function snapPlanPosition(xMm: number, yMm: number, enabled: boolean, house: HouseReference | null, gridMm = 305, houseToleranceMm = 460): Readonly<{ xMm: number; yMm: number }> {
  const rounded = { xMm: Math.round(xMm), yMm: Math.round(yMm) };
  if (!enabled) return Object.freeze(rounded);
  const grid = { xMm: Math.round(xMm / gridMm) * gridMm, yMm: Math.round(yMm / gridMm) * gridMm };
  if (!house) return Object.freeze(grid);
  const left = house.xMm; const right = house.xMm + house.lengthMm;
  const top = house.yMm; const bottom = house.yMm + house.widthMm;
  const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
  const candidates = [
    ...(yMm >= top - houseToleranceMm && yMm <= bottom + houseToleranceMm ? [
      { distance: Math.abs(xMm - left), point: { xMm: left, yMm: clamp(grid.yMm, top, bottom) } },
      { distance: Math.abs(xMm - right), point: { xMm: right, yMm: clamp(grid.yMm, top, bottom) } },
    ] : []),
    ...(xMm >= left - houseToleranceMm && xMm <= right + houseToleranceMm ? [
      { distance: Math.abs(yMm - top), point: { xMm: clamp(grid.xMm, left, right), yMm: top } },
      { distance: Math.abs(yMm - bottom), point: { xMm: clamp(grid.xMm, left, right), yMm: bottom } },
    ] : []),
  ].filter(({ distance }) => distance <= houseToleranceMm).sort((first, second) => first.distance - second.distance);
  return Object.freeze(candidates[0]?.point ?? grid);
}

export function snapRunEndpoint(
  anchor: Readonly<{ xMm: number; yMm: number }>,
  candidate: Readonly<{ xMm: number; yMm: number }>,
  enabled: boolean,
  angleIncrementDegrees = 45,
): Readonly<{ xMm: number; yMm: number }> {
  if (!enabled) return Object.freeze({ xMm: Math.round(candidate.xMm), yMm: Math.round(candidate.yMm) });
  if (!Number.isFinite(angleIncrementDegrees) || angleIncrementDegrees <= 0 || angleIncrementDegrees > 180) throw new RangeError("Snap angle must be greater than 0 and no more than 180 degrees.");
  const dx = candidate.xMm - anchor.xMm;
  const dy = candidate.yMm - anchor.yMm;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return Object.freeze({ xMm: anchor.xMm, yMm: anchor.yMm });
  const increment = angleIncrementDegrees * Math.PI / 180;
  const angle = Math.round(Math.atan2(dy, dx) / increment) * increment;
  return Object.freeze({
    xMm: Math.round(anchor.xMm + Math.cos(angle) * distance),
    yMm: Math.round(anchor.yMm + Math.sin(angle) * distance),
  });
}

export function addPoint(design: FenceDesign, point: Point, segmentId?: string): FenceDesign {
  if (design.points.some(({ id }) => id === point.id)) throw new TypeError("Point ID already exists.");
  const previous = design.points.at(-1);
  const segment = previous ? Object.freeze({ id: segmentId ?? `segment-${design.segments.length + 1}`, fromPointId: previous.id, toPointId: point.id, kind: "fence" as const }) : null;
  return revise(design, { points: [...design.points, point], segments: segment ? [...design.segments, segment] : design.segments });
}

export function movePoint(design: FenceDesign, pointId: string, xMm: number, yMm: number): FenceDesign {
  integer(xMm, "Point x"); integer(yMm, "Point y");
  if (!design.points.some(({ id }) => id === pointId)) throw new TypeError("Point does not exist.");
  return revise(design, { points: design.points.map((point) => point.id === pointId ? Object.freeze({ ...point, xMm, yMm }) : point) });
}

export function deletePoint(design: FenceDesign, pointId: string, replacementSegmentId: string): FenceDesign {
  const index = design.points.findIndex(({ id }) => id === pointId);
  if (index < 0) throw new TypeError("Point does not exist.");
  const points = design.points.filter(({ id }) => id !== pointId);
  const segments = points.slice(0, -1).map((point, segmentIndex) => {
    const next = points[segmentIndex + 1];
    const existing = design.segments.find(({ fromPointId, toPointId }) => fromPointId === point.id && toPointId === next.id);
    return existing ?? Object.freeze({ id: replacementSegmentId, fromPointId: point.id, toPointId: next.id, kind: "fence" as const });
  });
  return revise(design, { points, segments });
}

export function setSegmentKind(design: FenceDesign, segmentId: string, kind: SegmentKind, gateType: GateType = "single"): FenceDesign {
  if (!design.segments.some(({ id }) => id === segmentId)) throw new TypeError("Segment does not exist.");
  return revise(design, { segments: design.segments.map((segment) => segment.id === segmentId
    ? Object.freeze({ id: segment.id, fromPointId: segment.fromPointId, toPointId: segment.toPointId, kind, ...(kind === "gate" ? { gateType } : {}) })
    : segment) });
}

export function setGateType(design: FenceDesign, segmentId: string, gateType: GateType): FenceDesign {
  const segment = design.segments.find(({ id }) => id === segmentId);
  if (!segment || segment.kind !== "gate") throw new TypeError("Gate segment does not exist.");
  return setSegmentKind(design, segmentId, "gate", gateType);
}

export function insertGateAtPoint(
  design: FenceDesign,
  pointId: string,
  widthMm: number,
  gateType: GateType,
  newPointId: string,
  newGateSegmentId: string,
): FenceDesign {
  if (!Number.isSafeInteger(widthMm) || widthMm < 25 || widthMm > 304_800) throw new RangeError("Total gate width must be from 1 inch through 1,000 feet.");
  if (gateType !== "single" && gateType !== "double") throw new TypeError("Choose a single or double gate.");
  const pointIndex = design.points.findIndex(({ id }) => id === pointId);
  if (pointIndex < 0) throw new TypeError("Gate anchor point does not exist.");
  if (design.points.some(({ id }) => id === newPointId) || design.segments.some(({ id }) => id === newGateSegmentId)) throw new TypeError("Gate point and segment IDs must be unique.");
  const anchor = design.points[pointIndex];
  const outgoing = design.segments[pointIndex];

  if (outgoing) {
    const end = design.points[pointIndex + 1];
    const runLength = segmentLengthMm(design, outgoing);
    if (widthMm > runLength) throw new RangeError(`Gate width must fit within the following ${formatFeetInches(runLength)} span.`);
    if (widthMm === runLength) return setSegmentKind(design, outgoing.id, "gate", gateType);
    const rawLength = Math.hypot(end.xMm - anchor.xMm, end.yMm - anchor.yMm);
    if (rawLength === 0) throw new RangeError("The following span needs a measurable direction before adding a gate.");
    const gateEnd = Object.freeze({
      id: newPointId,
      xMm: Math.round(anchor.xMm + (end.xMm - anchor.xMm) / rawLength * widthMm),
      yMm: Math.round(anchor.yMm + (end.yMm - anchor.yMm) / rawLength * widthMm),
    });
    const points = [...design.points.slice(0, pointIndex + 1), gateEnd, ...design.points.slice(pointIndex + 1)];
    const gate = Object.freeze({ id: newGateSegmentId, fromPointId: anchor.id, toPointId: gateEnd.id, kind: "gate" as const, gateType });
    const remainder = Object.freeze({ ...outgoing, fromPointId: gateEnd.id });
    const segments = [...design.segments.slice(0, pointIndex), gate, remainder, ...design.segments.slice(pointIndex + 1)];
    return revise(design, { points, segments });
  }

  if (pointIndex === 0) throw new RangeError("Draw one fence run first so the gate has a direction.");
  const previous = design.points[pointIndex - 1];
  const rawLength = Math.hypot(anchor.xMm - previous.xMm, anchor.yMm - previous.yMm);
  if (rawLength === 0) throw new RangeError("The preceding span needs a measurable direction before adding a gate.");
  const gateEnd = Object.freeze({
    id: newPointId,
    xMm: Math.round(anchor.xMm + (anchor.xMm - previous.xMm) / rawLength * widthMm),
    yMm: Math.round(anchor.yMm + (anchor.yMm - previous.yMm) / rawLength * widthMm),
  });
  const gate = Object.freeze({ id: newGateSegmentId, fromPointId: anchor.id, toPointId: gateEnd.id, kind: "gate" as const, gateType });
  return revise(design, { points: [...design.points, gateEnd], segments: [...design.segments, gate] });
}

export function pointById(design: FenceDesign, id: string): Point {
  const point = design.points.find((candidate) => candidate.id === id);
  if (!point) throw new TypeError(`Missing point ${id}.`);
  return point;
}

export function segmentLengthMm(design: FenceDesign, segment: Segment): number {
  const start = pointById(design, segment.fromPointId);
  const end = pointById(design, segment.toPointId);
  return Math.round(Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm));
}

export function totalLengthMm(design: FenceDesign): number {
  return design.segments.reduce((total, segment) => total + segmentLengthMm(design, segment), 0);
}

export function setSegmentLengthMm(design: FenceDesign, segmentId: string, lengthMm: number): FenceDesign {
  if (!Number.isSafeInteger(lengthMm) || lengthMm < 25 || lengthMm > 304_800) throw new RangeError("Segment length must be from 1 inch through 1,000 feet.");
  const segment = design.segments.find(({ id }) => id === segmentId);
  if (!segment) throw new TypeError("Segment does not exist.");
  const start = pointById(design, segment.fromPointId);
  const end = pointById(design, segment.toPointId);
  const current = Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm);
  const ux = current === 0 ? 1 : (end.xMm - start.xMm) / current;
  const uy = current === 0 ? 0 : (end.yMm - start.yMm) / current;
  return movePoint(design, end.id, Math.round(start.xMm + ux * lengthMm), Math.round(start.yMm + uy * lengthMm));
}

export function pointRole(design: FenceDesign, pointId: string): "open endpoint" | "corner" | "inline" {
  const index = design.points.findIndex(({ id }) => id === pointId);
  if (index < 0) throw new TypeError("Point does not exist.");
  if (index === 0 || index === design.points.length - 1) return "open endpoint";
  const before = design.points[index - 1];
  const point = design.points[index];
  const after = design.points[index + 1];
  const first = Math.atan2(point.yMm - before.yMm, point.xMm - before.xMm);
  const second = Math.atan2(after.yMm - point.yMm, after.xMm - point.xMm);
  let deflection = Math.abs(second - first);
  if (deflection > Math.PI) deflection = Math.PI * 2 - deflection;
  return deflection > Math.PI / 90 ? "corner" : "inline";
}

export function formatFeetInches(mm: number): string {
  const totalInches = Math.round(mm / MM_PER_INCH);
  return `${Math.floor(totalInches / 12)}′ ${totalInches % 12}″`;
}

export function feetAndInchesToMm(feet: number, inches: number): number {
  if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet < 0 || inches < 0 || inches >= 12) throw new RangeError("Use non-negative feet and inches from 0 through 11.99.");
  return Math.round(feet * MM_PER_FOOT + inches * MM_PER_INCH);
}

export function stableDesignJson(design: FenceDesign): string {
  return JSON.stringify(normalizeDesign(design), null, 2);
}
