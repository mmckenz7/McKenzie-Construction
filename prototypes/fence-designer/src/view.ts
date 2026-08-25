export type ViewBox = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ViewPoint = Readonly<{ xMm: number; yMm: number }>;
export type DimensionLabelRequest = Readonly<{ id: string; start: ViewPoint; end: ViewPoint; widthMm: number; heightMm: number; preferredSide?: 1 | -1; fixedSide?: boolean }>;
export type DimensionLabelPlacement = Readonly<{ id: string; position: ViewPoint; side: 1 | -1; offsetMm: number }>;
export type DimensionAvoidSegment = Readonly<{ id: string; start: ViewPoint; end: ViewPoint }>;
export type DimensionPlacementOptions = Readonly<{ bounds?: ViewBox; boundsPaddingMm?: number; avoidSegments?: readonly DimensionAvoidSegment[] }>;

export const MIN_VIEW_WIDTH = 2_000;
export const MAX_VIEW_WIDTH = 104_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function zoomViewAt(view: ViewBox, scale: number, focusX = 0.5, focusY = 0.5): ViewBox {
  if (!Number.isFinite(scale) || scale <= 0) return view;
  const width = clamp(view.width * scale, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
  const appliedScale = width / view.width;
  const height = view.height * appliedScale;
  const xRatio = clamp(focusX, 0, 1);
  const yRatio = clamp(focusY, 0, 1);
  return {
    x: view.x + (view.width - width) * xRatio,
    y: view.y + (view.height - height) * yRatio,
    width,
    height,
  };
}

export function panView(view: ViewBox, deltaX: number, deltaY: number, viewportWidth: number, viewportHeight: number): ViewBox {
  if (viewportWidth <= 0 || viewportHeight <= 0) return view;
  return {
    ...view,
    x: view.x - deltaX / viewportWidth * view.width,
    y: view.y - deltaY / viewportHeight * view.height,
  };
}

export function offsetDimensionPosition(start: ViewPoint, end: ViewPoint, offsetMm: number): ViewPoint {
  const midX = (start.xMm + end.xMm) / 2;
  const midY = (start.yMm + end.yMm) / 2;
  const dx = end.xMm - start.xMm;
  const dy = end.yMm - start.yMm;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(offsetMm) || length === 0) return { xMm: midX, yMm: midY };
  return { xMm: midX + dy / length * offsetMm, yMm: midY - dx / length * offsetMm };
}

function boxesOverlap(a: Readonly<{ x: number; y: number; width: number; height: number }>, b: Readonly<{ x: number; y: number; width: number; height: number }>, marginMm: number) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + marginMm && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + marginMm;
}

type LabelBox = Readonly<{ x: number; y: number; width: number; height: number }>;

function boxWithinBounds(box: LabelBox, bounds: ViewBox, paddingMm: number) {
  return box.x - box.width / 2 >= bounds.x + paddingMm
    && box.x + box.width / 2 <= bounds.x + bounds.width - paddingMm
    && box.y - box.height / 2 >= bounds.y + paddingMm
    && box.y + box.height / 2 <= bounds.y + bounds.height - paddingMm;
}

function pointInsideBox(point: ViewPoint, box: LabelBox) {
  return point.xMm >= box.x - box.width / 2 && point.xMm <= box.x + box.width / 2
    && point.yMm >= box.y - box.height / 2 && point.yMm <= box.y + box.height / 2;
}

function cross(a: ViewPoint, b: ViewPoint, c: ViewPoint) {
  return (b.xMm - a.xMm) * (c.yMm - a.yMm) - (b.yMm - a.yMm) * (c.xMm - a.xMm);
}

function between(value: number, a: number, b: number) {
  return value >= Math.min(a, b) && value <= Math.max(a, b);
}

function segmentsIntersect(a: ViewPoint, b: ViewPoint, c: ViewPoint, d: ViewPoint) {
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  if (abC === 0 && between(c.xMm, a.xMm, b.xMm) && between(c.yMm, a.yMm, b.yMm)) return true;
  if (abD === 0 && between(d.xMm, a.xMm, b.xMm) && between(d.yMm, a.yMm, b.yMm)) return true;
  if (cdA === 0 && between(a.xMm, c.xMm, d.xMm) && between(a.yMm, c.yMm, d.yMm)) return true;
  return cdB === 0 && between(b.xMm, c.xMm, d.xMm) && between(b.yMm, c.yMm, d.yMm);
}

function segmentIntersectsBox(start: ViewPoint, end: ViewPoint, box: LabelBox, marginMm: number) {
  const expanded = { ...box, width: box.width + marginMm * 2, height: box.height + marginMm * 2 };
  if (pointInsideBox(start, expanded) || pointInsideBox(end, expanded)) return true;
  const left = expanded.x - expanded.width / 2; const right = expanded.x + expanded.width / 2;
  const top = expanded.y - expanded.height / 2; const bottom = expanded.y + expanded.height / 2;
  const corners = [{ xMm: left, yMm: top }, { xMm: right, yMm: top }, { xMm: right, yMm: bottom }, { xMm: left, yMm: bottom }];
  return corners.some((corner, index) => segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length]));
}

export function placeDimensionLabels(requests: readonly DimensionLabelRequest[], baseOffsetMm: number, marginMm: number, options: DimensionPlacementOptions = {}): readonly DimensionLabelPlacement[] {
  const occupied: { x: number; y: number; width: number; height: number }[] = [];
  return requests.map((request) => {
    const preferredSide = request.preferredSide ?? 1;
    const oppositeSide: 1 | -1 = preferredSide === 1 ? -1 : 1;
    let selected: DimensionLabelPlacement | null = null;
    const unrelatedSegments = options.avoidSegments?.filter(({ id }) => id !== request.id) ?? [];
    const midpoint = { xMm: (request.start.xMm + request.end.xMm) / 2, yMm: (request.start.yMm + request.end.yMm) / 2 };
    for (const avoidRuns of [true, false]) {
      for (let step = 0; step < 7 && !selected; step += 1) {
        const distance = baseOffsetMm * (1 + step * 0.75);
        const candidateSides: readonly (1 | -1)[] = request.fixedSide ? [preferredSide] : [preferredSide, oppositeSide];
        for (const side of candidateSides) {
          const position = offsetDimensionPosition(request.start, request.end, distance * side);
          const box = { x: position.xMm, y: position.yMm, width: request.widthMm, height: request.heightMm };
          const outsideBounds = options.bounds && !boxWithinBounds(box, options.bounds, options.boundsPaddingMm ?? 0);
          const crossesRun = avoidRuns && unrelatedSegments.some((segment) => segmentIntersectsBox(segment.start, segment.end, box, marginMm) || segmentsIntersect(midpoint, position, segment.start, segment.end));
          if (!outsideBounds && !crossesRun && !occupied.some((existing) => boxesOverlap(box, existing, marginMm))) {
            selected = { id: request.id, position, side, offsetMm: distance };
            occupied.push(box);
            break;
          }
        }
      }
      if (selected) break;
    }
    if (selected) return selected;
    const offsetMm = baseOffsetMm * 6;
    let position = offsetDimensionPosition(request.start, request.end, offsetMm * preferredSide);
    if (options.bounds) {
      const paddingMm = options.boundsPaddingMm ?? 0;
      position = {
        xMm: clamp(position.xMm, options.bounds.x + paddingMm + request.widthMm / 2, options.bounds.x + options.bounds.width - paddingMm - request.widthMm / 2),
        yMm: clamp(position.yMm, options.bounds.y + paddingMm + request.heightMm / 2, options.bounds.y + options.bounds.height - paddingMm - request.heightMm / 2),
      };
    }
    occupied.push({ x: position.xMm, y: position.yMm, width: request.widthMm, height: request.heightMm });
    return { id: request.id, position, side: preferredSide, offsetMm };
  });
}
