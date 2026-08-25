export type ViewBox = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ViewPoint = Readonly<{ xMm: number; yMm: number }>;
export type DimensionLabelRequest = Readonly<{ id: string; start: ViewPoint; end: ViewPoint; widthMm: number; heightMm: number; preferredSide?: 1 | -1; fixedSide?: boolean }>;
export type DimensionLabelPlacement = Readonly<{ id: string; position: ViewPoint; side: 1 | -1; offsetMm: number }>;

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

export function placeDimensionLabels(requests: readonly DimensionLabelRequest[], baseOffsetMm: number, marginMm: number): readonly DimensionLabelPlacement[] {
  const occupied: { x: number; y: number; width: number; height: number }[] = [];
  return requests.map((request) => {
    const preferredSide = request.preferredSide ?? 1;
    const oppositeSide: 1 | -1 = preferredSide === 1 ? -1 : 1;
    let selected: DimensionLabelPlacement | null = null;
    for (let step = 0; step < 7 && !selected; step += 1) {
      const distance = baseOffsetMm * (1 + step * 0.75);
      const candidateSides: readonly (1 | -1)[] = request.fixedSide ? [preferredSide] : [preferredSide, oppositeSide];
      for (const side of candidateSides) {
        const position = offsetDimensionPosition(request.start, request.end, distance * side);
        const box = { x: position.xMm, y: position.yMm, width: request.widthMm, height: request.heightMm };
        if (!occupied.some((existing) => boxesOverlap(box, existing, marginMm))) {
          selected = { id: request.id, position, side, offsetMm: distance };
          occupied.push(box);
          break;
        }
      }
    }
    if (selected) return selected;
    const offsetMm = baseOffsetMm * 6;
    const position = offsetDimensionPosition(request.start, request.end, offsetMm * preferredSide);
    occupied.push({ x: position.xMm, y: position.yMm, width: request.widthMm, height: request.heightMm });
    return { id: request.id, position, side: preferredSide, offsetMm };
  });
}
