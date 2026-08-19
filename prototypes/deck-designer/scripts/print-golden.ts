import { deriveGeometry } from "../src/geometry";
import { DEFAULT_DESIGN, designFingerprint } from "../src/model";
import { deriveQuantities } from "../src/quantities";
import { applyTemplateToDesign } from "../src/templates";

const designs = [
  ["rectangle-foundation", DEFAULT_DESIGN],
  ["l-shape-landing", applyTemplateToDesign(DEFAULT_DESIGN, "l-shape-landing")],
] as const;

for (const [name, design] of designs) {
  const geometry = deriveGeometry(design);
  const snapshot = {
    name,
    fingerprint: designFingerprint(design),
    footprint: geometry.footprint,
    edgeIds: geometry.platformEdges.map((edge) => edge.id),
    boardCount: geometry.surfaceBoards.length,
    joistCount: geometry.joists.length,
    railSegmentCount: geometry.railSegments.length,
    stairTreadCount: geometry.stairTreads.length,
    landingCenter: geometry.landing?.center ?? null,
    landingRailSegmentCount: geometry.landingRailSegments.length,
    landingRailPostCount: geometry.landingRailPosts.length,
    landingSupportPostCount: geometry.landingSupportPosts.length,
    quantities: Object.fromEntries(
      deriveQuantities(design, geometry).map((line) => [line.id, { quantity: line.quantity, unit: line.unit }]),
    ),
  };
  console.log(JSON.stringify(snapshot, null, 2));
}
