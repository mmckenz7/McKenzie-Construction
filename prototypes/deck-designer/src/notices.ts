import type { DeckGeometry } from "./geometry";
import type { DeckDesignV1 } from "./model";

export type DesignNotice = Readonly<{
  id: string;
  severity: "review" | "information";
  message: string;
}>;

export function deriveDesignNotices(design: DeckDesignV1, geometry: DeckGeometry): readonly DesignNotice[] {
  const notices: DesignNotice[] = [];
  // This is a conservative prototype review trigger, not a code-compliance determination.
  if (design.platform.surfaceElevation >= 30) {
    for (const edge of geometry.platformEdges) {
      if (!design.construction.railing.enabledEdges.includes(edge.id)) {
        notices.push(Object.freeze({
          id: `open-elevated-edge:${edge.id}`,
          severity: "review",
          message: `${edge.label} is open at the recorded ${design.platform.surfaceElevation}-inch conceptual elevation; this prototype flags it for qualified railing and code review.`,
        }));
      }
    }
  }
  if (design.platform.kind === "l-shape") {
    const frontLeg = design.platform.width - design.platform.cutoutWidth;
    const sideLeg = design.platform.projection - design.platform.cutoutDepth;
    if (frontLeg < 36 || sideLeg < 36) {
      notices.push(Object.freeze({
        id: "narrow-l-shape-leg",
        severity: "review",
        message: `The cutout leaves ${frontLeg} inches on the front leg and ${sideLeg} inches on the side leg; confirm intended access and use.`,
      }));
    }
  }
  if (design.construction.stairs.enabled && !design.construction.stairs.landingEnabled) {
    notices.push(Object.freeze({
      id: "stairs-without-landing",
      severity: "information",
      message: "The conceptual stair run descends directly from the selected deck edge with no recorded top landing.",
    }));
  }
  if (
    design.construction.stairs.enabled &&
    design.construction.stairs.landingEnabled &&
    design.construction.stairs.landingDepth < design.construction.stairs.width
  ) {
    notices.push(Object.freeze({
      id: "landing-shallower-than-stair",
      severity: "review",
      message: `Landing depth is ${design.construction.stairs.landingDepth} inches versus a ${design.construction.stairs.width}-inch stair width; verify the intended landing geometry.`,
    }));
  }
  return Object.freeze(notices);
}
