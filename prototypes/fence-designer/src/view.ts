export type ViewBox = Readonly<{ x: number; y: number; width: number; height: number }>;

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
