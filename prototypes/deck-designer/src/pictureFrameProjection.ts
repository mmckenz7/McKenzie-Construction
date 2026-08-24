import { deriveGeometricPolygonEdges } from "./polygon";
import { deriveExpandedPolygon, deriveInsetPolygon } from "./polygonInset";
import { normalizePolygonRegion, type PolygonRegion } from "./polygonRegion";
import {
  derivePolygonMembers,
  type DeckBoardDirection,
  type ProjectedMember,
} from "./polygonProjection";

export type DeckSurfacePattern = "standard" | "picture_frame";

export type PictureFrameBoardProjection = Readonly<{
  borderBoards: readonly ProjectedMember[];
  fieldBoards: readonly ProjectedMember[];
  surfaceBoards: readonly ProjectedMember[];
  borderBoardLength: number;
  fieldBoardLength: number;
  surfaceBoardLength: number;
}>;

const round = (value: number): number => Math.round(value * 100) / 100;
const memberLength = (member: ProjectedMember): number =>
  Math.hypot(member.end.x - member.start.x, member.end.z - member.start.z);

/**
 * Projects one mitered outer picture-frame course and clips field boards to a
 * separate inset region. Cutout borders expand into the usable deck surface;
 * normalization rejects any border that collides with the outer ring or another cutout.
 */
export function derivePictureFrameBoards(
  region: PolygonRegion,
  options: Readonly<{
    boardWidth: number;
    gap: number;
    joistSpacing: number;
    boardDirection: DeckBoardDirection;
  }>,
): PictureFrameBoardProjection {
  const normalized = normalizePolygonRegion(region);
  if (!Number.isFinite(options.boardWidth) || options.boardWidth < 2 || options.boardWidth > 12) {
    throw new RangeError("Picture-frame board width must be between 2 and 12 inches.");
  }
  if (!Number.isFinite(options.gap) || options.gap < 0.05 || options.gap > 1) {
    throw new RangeError("Picture-frame board gap must be between 0.05 and 1 inch.");
  }

  const borderCenterline = deriveInsetPolygon(normalized.outer, options.boardWidth / 2);
  const fieldOuter = deriveInsetPolygon(normalized.outer, options.boardWidth + options.gap);
  const outerBorderBoards = deriveGeometricPolygonEdges(borderCenterline).map((edge, index) => Object.freeze({
    id: `picture-frame-border-${index + 1}`,
    start: edge.start,
    end: edge.end,
  }));
  const holeBorderBoards = normalized.holes.flatMap((hole, holeIndex) =>
    deriveGeometricPolygonEdges(deriveExpandedPolygon(hole, options.boardWidth / 2)).map((edge, edgeIndex) => Object.freeze({
      id: `picture-frame-hole-${holeIndex + 1}-border-${edgeIndex + 1}`,
      start: edge.start,
      end: edge.end,
    })),
  );
  const borderBoards = Object.freeze([...outerBorderBoards, ...holeBorderBoards]);
  const fieldHoles = Object.freeze(normalized.holes.map((hole) =>
    deriveExpandedPolygon(hole, options.boardWidth + options.gap),
  ));
  const fieldProjection = derivePolygonMembers(
    normalizePolygonRegion(Object.freeze({ outer: fieldOuter, holes: fieldHoles })),
    options,
  );
  const fieldBoards = Object.freeze(fieldProjection.surfaceBoards.map((board) => Object.freeze({
    ...board,
    id: `picture-frame-field-${board.id}`,
  })));
  const surfaceBoards = Object.freeze([...borderBoards, ...fieldBoards]);
  const borderBoardLength = round(borderBoards.reduce((sum, board) => sum + memberLength(board), 0));
  const fieldBoardLength = round(fieldBoards.reduce((sum, board) => sum + memberLength(board), 0));
  return Object.freeze({
    borderBoards,
    fieldBoards,
    surfaceBoards,
    borderBoardLength,
    fieldBoardLength,
    surfaceBoardLength: round(borderBoardLength + fieldBoardLength),
  });
}
