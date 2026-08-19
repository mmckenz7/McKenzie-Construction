import { deriveGeometry } from "../src/geometry";
import { DEFAULT_DESIGN, designFingerprint, updateDesign } from "../src/model";
import { deriveQuantities } from "../src/quantities";
import { applyTemplateToDesign } from "../src/templates";

const designs = [
  ["rectangle-foundation", DEFAULT_DESIGN],
  ["l-shape-landing", applyTemplateToDesign(DEFAULT_DESIGN, "l-shape-landing")],
  ["multi-wall-context", updateDesign(DEFAULT_DESIGN, {
    name: "Multi-wall context concept",
    houseWalls: [
      {
        id: "house-wall-1",
        start: { x: -60, z: 0 },
        end: { x: 252, z: 0 },
        baseElevation: 0,
        height: 120,
        attachment: "ledger",
        openings: [{ id: "door-1", kind: "door", offset: 120, width: 36, sillHeight: 0, height: 80 }],
      },
      {
        id: "house-wall-2",
        start: { x: -60, z: 0 },
        end: { x: -60, z: 204 },
        baseElevation: -6,
        height: 126,
        attachment: "non-ledger",
        openings: [{ id: "window-1", kind: "window", offset: 78, width: 48, sillHeight: 36, height: 48 }],
      },
    ],
  })],
] as const;

for (const [name, design] of designs) {
  const geometry = deriveGeometry(design);
  const snapshot = {
    name,
    schemaVersion: design.schemaVersion,
    fingerprint: designFingerprint(design),
    footprint: geometry.footprint,
    edgeIds: geometry.platformEdges.map((edge) => edge.id),
    boardCount: geometry.surfaceBoards.length,
    joistCount: geometry.joists.length,
    railSegmentCount: geometry.railSegments.length,
    stairTreadCount: geometry.stairTreads.length,
    stairStringerCount: geometry.stairStringers.length,
    gradeElevation: design.siteContext.gradeElevation,
    houseWallPanelCount: geometry.houseWallPanels.length,
    houseOpeningCount: geometry.houseOpenings.length,
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
