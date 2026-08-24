export const SCHEMA_VERSION = 1 as const;
export const MM_PER_FOOT = 304.8;
export const MM_PER_INCH = 25.4;

export type Point = Readonly<{ id: string; xMm: number; yMm: number }>;
export type SegmentKind = "fence" | "gate";
export type Segment = Readonly<{
  id: string;
  fromPointId: string;
  toPointId: string;
  kind: SegmentKind;
}>;
export type FenceDesign = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  revision: number;
  points: readonly Point[];
  segments: readonly Segment[];
}>;

export const EMPTY_DESIGN: FenceDesign = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  id: "local-fence-design",
  name: "Untitled fence layout",
  revision: 0,
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
  if (raw.schemaVersion !== SCHEMA_VERSION) throw new TypeError("Unsupported fence design schema version.");
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
    const normalized = Object.freeze({
      id: text(segment.id, `Segment ${index + 1} ID`, 80),
      fromPointId: text(segment.fromPointId, `Segment ${index + 1} start`, 80),
      toPointId: text(segment.toPointId, `Segment ${index + 1} end`, 80),
      kind: segment.kind === "gate" ? "gate" as const : segment.kind === "fence" ? "fence" as const : (() => { throw new TypeError(`Segment ${index + 1} kind is invalid.`); })(),
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
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    id: text(raw.id, "Design ID", 80),
    name: text(raw.name, "Design name"),
    revision: integer(raw.revision, "Revision"),
    points: Object.freeze(points),
    segments: Object.freeze(segments),
  });
}

const revise = (design: FenceDesign, patch: Partial<Pick<FenceDesign, "points" | "segments" | "name">>): FenceDesign => normalizeDesign({ ...design, ...patch, revision: design.revision + 1 });

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

export function setSegmentKind(design: FenceDesign, segmentId: string, kind: SegmentKind): FenceDesign {
  if (!design.segments.some(({ id }) => id === segmentId)) throw new TypeError("Segment does not exist.");
  return revise(design, { segments: design.segments.map((segment) => segment.id === segmentId ? Object.freeze({ ...segment, kind }) : segment) });
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
