import type { DeckGroundPointV5, DeckSiteContextProjectionV5 } from "./siteContextProjectionV5";

export type DeckSiteContextPresentationV5 = Readonly<{
  plane: "MCKENZIE_LOCAL_MM";
  revisionLabel: string;
  viewBox: string;
  platforms: readonly Readonly<{ id: string; outer: string; holes: readonly string[] }>[];
  houseWalls: readonly Readonly<{ id: string; x1: number; y1: number; x2: number; y2: number }>[];
  counts: Readonly<{ platforms: number; cutouts: number; houseWalls: number }>;
  readiness: "local_overlay_ready";
  connection: "awaiting_promoted_fence_contract";
  authority: "context_only_not_survey_or_construction";
}>;

function svgPoint(point: DeckGroundPointV5): string {
  return `${point.xMm},${-point.yMm}`;
}

function polygon(points: readonly DeckGroundPointV5[]): string {
  return points.map(svgPoint).join(" ");
}

function assertFrozenPoint(point: DeckGroundPointV5): void {
  if (!Object.isFrozen(point) || !Number.isSafeInteger(point.xMm) || !Number.isSafeInteger(point.yMm)) {
    throw new TypeError("Deck site context points must be frozen integer-millimeter values.");
  }
}

/**
 * Builds a provider-free presentation model from Deck's immutable local-plane
 * projection. It deliberately exposes no mount, search, map-edit, network,
 * persistence, key, or billing behavior owned by the Fence adapter.
 */
export function deriveDeckSiteContextPresentationV5(projection: DeckSiteContextProjectionV5): DeckSiteContextPresentationV5 {
  if (projection.plane !== "MCKENZIE_LOCAL_MM") throw new TypeError("Deck site context must use the McKenzie local ground plane.");
  if (!Object.isFrozen(projection) || !Object.isFrozen(projection.platforms) || !Object.isFrozen(projection.houseWalls)) throw new TypeError("Deck site context presentation requires a frozen read-only projection.");
  projection.platforms.forEach((platform) => {
    if (!Object.isFrozen(platform) || !Object.isFrozen(platform.outer) || !Object.isFrozen(platform.outer.points) || !Object.isFrozen(platform.holes)) throw new TypeError("Deck platform context must be recursively frozen.");
    platform.outer.points.forEach(assertFrozenPoint);
    platform.holes.forEach((hole) => {
      if (!Object.isFrozen(hole) || !Object.isFrozen(hole.points)) throw new TypeError("Deck cutout context must be recursively frozen.");
      hole.points.forEach(assertFrozenPoint);
    });
  });
  projection.houseWalls.forEach((wall) => {
    if (!Object.isFrozen(wall)) throw new TypeError("Deck house-wall context must be recursively frozen.");
    assertFrozenPoint(wall.start);
    assertFrozenPoint(wall.end);
  });
  const points = [
    ...projection.platforms.flatMap((platform) => [platform.outer, ...platform.holes].flatMap((ring) => ring.points)),
    ...projection.houseWalls.flatMap((wall) => [wall.start, wall.end]),
  ];
  if (points.length === 0) throw new RangeError("Deck site context requires local geometry to present.");
  const minX = Math.min(...points.map(({ xMm }) => xMm));
  const maxX = Math.max(...points.map(({ xMm }) => xMm));
  const minY = Math.min(...points.map(({ yMm }) => yMm));
  const maxY = Math.max(...points.map(({ yMm }) => yMm));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const padding = Math.max(3_048, Math.round(span * 0.08));
  const platforms = Object.freeze(projection.platforms.map((platform) => Object.freeze({
    id: platform.id,
    outer: polygon(platform.outer.points),
    holes: Object.freeze(platform.holes.map((hole) => polygon(hole.points))),
  })));
  const houseWalls = Object.freeze(projection.houseWalls.map((wall) => Object.freeze({
    id: wall.id,
    x1: wall.start.xMm,
    y1: -wall.start.yMm,
    x2: wall.end.xMm,
    y2: -wall.end.yMm,
  })));
  return Object.freeze({
    plane: "MCKENZIE_LOCAL_MM",
    revisionLabel: `Design revision ${projection.sourceRevision}`,
    viewBox: `${minX - padding} ${-(maxY + padding)} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
    platforms,
    houseWalls,
    counts: Object.freeze({ platforms: platforms.length, cutouts: platforms.reduce((total, platform) => total + platform.holes.length, 0), houseWalls: houseWalls.length }),
    readiness: "local_overlay_ready",
    connection: "awaiting_promoted_fence_contract",
    authority: "context_only_not_survey_or_construction",
  });
}
