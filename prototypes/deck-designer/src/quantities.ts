import type { DeckDesignV1 } from "./model";
import type { DeckGeometry } from "./geometry";

export type QuantityLine = Readonly<{
  id: string;
  label: string;
  quantity: number;
  unit: "sq ft" | "lin ft" | "each";
  explanation: string;
}>;

const feet = (inches: number) => Math.round((inches / 12) * 100) / 100;
const squareFeet = (squareInches: number) => Math.round((squareInches / 144) * 100) / 100;

export function deriveQuantities(design: DeckDesignV1, geometry: DeckGeometry): readonly QuantityLine[] {
  const { width, projection, kind, cutoutWidth, cutoutDepth } = design.platform;
  const platformSquareInches = width * projection - (kind === "l-shape" ? cutoutWidth * cutoutDepth : 0);
  const boardInches = geometry.surfaceBoards.reduce(
    (total, board) => total + Math.hypot(board.end.x - board.start.x, board.end.z - board.start.z),
    0,
  );
  const joistInches = geometry.joists.reduce(
    (total, joist) => total + Math.hypot(joist.end.x - joist.start.x, joist.end.z - joist.start.z),
    0,
  );
  const beamInches = geometry.beams.reduce(
    (total, beam) => total + Math.hypot(beam.end.x - beam.start.x, beam.end.z - beam.start.z),
    0,
  );
  const railInches = geometry.railSegments.reduce(
    (total, rail) => total + Math.hypot(rail.end.x - rail.start.x, rail.end.z - rail.start.z),
    0,
  );
  const surfaceIntersections = geometry.surfaceBoards.reduce(
    (total, board) => total + geometry.joists.filter((joist) =>
      joist.start.x >= Math.min(board.start.x, board.end.x) &&
      joist.start.x <= Math.max(board.start.x, board.end.x) &&
      joist.end.z >= board.start.z,
    ).length,
    0,
  );
  return Object.freeze([
    Object.freeze({
      id: "platform-area",
      label: "Platform area",
      quantity: squareFeet(platformSquareInches),
      unit: "sq ft" as const,
      explanation: kind === "rectangle"
        ? `${width} in × ${projection} in ÷ 144`
        : `(${width} in × ${projection} in − ${cutoutWidth} in × ${cutoutDepth} in cutout) ÷ 144`,
    }),
    Object.freeze({
      id: "deck-board-rows",
      label: "Deck board rows",
      quantity: geometry.surfaceBoards.length,
      unit: "each" as const,
      explanation: `Ceiling of ${projection} in ÷ (${design.construction.decking.boardWidth} in board + ${design.construction.decking.gap} in gap)`,
    }),
    Object.freeze({
      id: "decking-linear-feet",
      label: "Decking length",
      quantity: feet(boardInches),
      unit: "lin ft" as const,
      explanation: `${geometry.surfaceBoards.length} projected board-row segments totaling ${Math.round(boardInches * 100) / 100} in`,
    }),
    Object.freeze({
      id: "joist-count",
      label: "Joists",
      quantity: geometry.joists.length,
      unit: "each" as const,
      explanation: `Ceiling of ${width} in ÷ ${design.construction.framing.joistSpacing} in spacing, plus one edge joist`,
    }),
    Object.freeze({
      id: "joist-linear-feet",
      label: "Joist length",
      quantity: feet(joistInches),
      unit: "lin ft" as const,
      explanation: `${geometry.joists.length} projected joists totaling ${Math.round(joistInches * 100) / 100} in`,
    }),
    Object.freeze({
      id: "beam-linear-feet",
      label: "Beam line",
      quantity: feet(beamInches),
      unit: "lin ft" as const,
      explanation: `${geometry.beams.length} conceptual beam segment totaling ${Math.round(beamInches * 100) / 100} in`,
    }),
    Object.freeze({
      id: "support-post-count",
      label: "Support posts",
      quantity: geometry.supportPosts.length,
      unit: "each" as const,
      explanation: `Even bays not exceeding ${design.construction.framing.maxPostSpacing} in`,
    }),
    Object.freeze({
      id: "railing-linear-feet",
      label: "Railing",
      quantity: feet(railInches),
      unit: "lin ft" as const,
      explanation: `${design.construction.railing.enabledEdges.join(" + ") || "No enabled edges"}`,
    }),
    Object.freeze({
      id: "railing-post-count",
      label: "Railing posts",
      quantity: geometry.railPosts.length,
      unit: "each" as const,
      explanation: `Unique edge posts in bays not exceeding ${design.construction.framing.maxPostSpacing} in`,
    }),
    Object.freeze({
      id: "surface-screw-allowance",
      label: "Surface screw allowance",
      quantity: surfaceIntersections * 2,
      unit: "each" as const,
      explanation: `${surfaceIntersections} projected board/joist intersections × 2; visualization allowance only`,
    }),
    ...(design.construction.stairs.enabled
      ? [
          Object.freeze({
            id: "stair-tread-count",
            label: "Stair treads",
            quantity: geometry.stairTreads.length,
            unit: "each" as const,
            explanation: `${design.construction.stairs.edgeId} edge: ceiling of ${design.platform.surfaceElevation} in elevation ÷ ${design.construction.stairs.maxRiserHeight} in maximum riser`,
          }),
          Object.freeze({
            id: "stair-run",
            label: "Stair run",
            quantity: feet(geometry.stairTreads.length * design.construction.stairs.treadDepth),
            unit: "lin ft" as const,
            explanation: `${geometry.stairTreads.length} treads × ${design.construction.stairs.treadDepth} in conceptual tread depth`,
          }),
          Object.freeze({
            id: "stair-stringer-count",
            label: "Stair side stringers",
            quantity: geometry.stairStringers.length,
            unit: "each" as const,
            explanation: "Two conceptual side stringer paths for visualization; structural count is not determined",
          }),
          Object.freeze({
            id: "stair-stringer-linear-feet",
            label: "Stringer path",
            quantity: feet(geometry.stairStringers.reduce(
              (total, stringer) => total + Math.hypot(
                stringer.end.x - stringer.start.x,
                stringer.end.y - stringer.start.y,
                stringer.end.z - stringer.start.z,
              ),
              0,
            )),
            unit: "lin ft" as const,
            explanation: `Two conceptual side paths across ${geometry.stairTreads.length * design.construction.stairs.treadDepth} in run and ${design.platform.surfaceElevation} in rise`,
          }),
          ...(geometry.landing
            ? [
                Object.freeze({
                  id: "stair-landing-area",
                  label: "Landing area",
                  quantity: squareFeet(geometry.landing.width * geometry.landing.depth),
                  unit: "sq ft" as const,
                  explanation: `${geometry.landing.width} in × ${geometry.landing.depth} in conceptual top landing`,
                }),
                Object.freeze({
                  id: "landing-support-post-count",
                  label: "Landing support posts",
                  quantity: geometry.landingSupportPosts.length,
                  unit: "each" as const,
                  explanation: "Two conceptual outer landing support locations; visualization intent only",
                }),
                Object.freeze({
                  id: "landing-railing-linear-feet",
                  label: "Landing side railing",
                  quantity: feet(geometry.landingRailSegments.reduce(
                    (total, rail) => total + Math.hypot(rail.end.x - rail.start.x, rail.end.z - rail.start.z),
                    0,
                  )),
                  unit: "lin ft" as const,
                  explanation: `Two conceptual landing sides × ${geometry.landing.depth} in depth`,
                }),
                Object.freeze({
                  id: "landing-railing-post-count",
                  label: "Landing railing posts",
                  quantity: geometry.landingRailPosts.length,
                  unit: "each" as const,
                  explanation: "Four conceptual landing-side endpoints; visualization intent only",
                }),
              ]
            : []),
        ]
      : []),
  ]);
}
