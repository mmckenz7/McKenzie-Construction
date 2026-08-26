export const DISPLAYED_DECK_SURFACE_HEIGHT = 1;

export function displayedDeckSurfaceVerticalRange(elevation: number): Readonly<{ base: number; top: number }> {
  return Object.freeze({
    base: elevation - DISPLAYED_DECK_SURFACE_HEIGHT / 2,
    top: elevation + DISPLAYED_DECK_SURFACE_HEIGHT / 2,
  });
}

export function displayedVolumeIntersectsDeckSurface(base: number, top: number, elevation: number, epsilon = .01): boolean {
  const surface = displayedDeckSurfaceVerticalRange(elevation);
  return base < surface.top - epsilon && top > surface.base + epsilon;
}
