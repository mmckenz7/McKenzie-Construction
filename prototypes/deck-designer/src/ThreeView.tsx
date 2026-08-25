import type { DeckGeometry } from "./geometry";
import type { DeckDesign } from "./model";
import type { RenderQuality } from "./renderQuality";
import { ThreeViewV3, type ThreeViewGeometry, type ThreeViewPlatform } from "./ThreeViewV3";

export type CameraPreset = "perspective" | "top" | "front";

type Props = Readonly<{
  design: DeckDesign;
  geometry: DeckGeometry;
  preset: CameraPreset;
  presetRequest: number;
  showFraming: boolean;
  quality: RenderQuality;
}>;

/**
 * The first-run screen still uses the legacy rectangle/L-shape document. Adapt
 * its already-derived geometry into the current renderer so both experiences
 * share one camera, touch-control, lighting, and disposal implementation.
 */
export function ThreeView({ design, geometry, preset, presetRequest, showFraming, quality }: Props) {
  const platform = {
    id: "legacy-platform",
    elevation: design.platform.surfaceElevation,
    construction: {
      decking: { boardWidth: design.construction.decking.boardWidth },
      railing: { height: design.construction.railing.height },
    },
  } satisfies ThreeViewPlatform;
  const adaptedGeometry = {
    footprint: geometry.footprint,
    surfaceBoards: geometry.surfaceBoards,
    joists: geometry.joists,
    beams: geometry.beams,
    supportPosts: geometry.supportPosts,
    railSegments: geometry.railSegments,
    railPosts: geometry.railPosts,
    stairRailSegments: [],
    stairRailPosts: [],
    stairTreads: geometry.stairTreads,
    landings: geometry.landing ? [geometry.landing] : [],
    landingRailSegments: geometry.landingRailSegments.map((segment) => ({
      ...segment,
      y: geometry.landing?.y ?? design.platform.surfaceElevation,
    })),
    landingRailPosts: geometry.landingRailPosts,
    landingSupportPosts: geometry.landingSupportPosts,
  } satisfies ThreeViewGeometry;

  return <ThreeViewV3
    platform={platform}
    geometry={adaptedGeometry}
    houseGeometry={{ houseWallPanels: geometry.houseWallPanels, houseOpenings: geometry.houseOpenings }}
    gradeElevation={design.siteContext.gradeElevation}
    preset={preset}
    presetRequest={presetRequest}
    showFraming={showFraming}
    quality={quality}
  />;
}
