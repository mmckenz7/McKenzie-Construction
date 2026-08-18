import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPartialFramingEvidenceBinding,
  buildPrescriptiveDeckPlan,
  deckEstimatingImmediateIssueIds,
  drawingClientToDeckPoint,
  isCanonicalFramingEvidence,
  insertOutlinePointOnNearestEdge,
  isValidDeckOutline,
  KNOXVILLE_2024_DECK_PROFILE,
  nextDeckDrawingZoom,
  parseDeckPostPositions,
  recommendedPrescriptiveDraft,
  snapDeckOutlinePoint,
  moveDeckOutlineEdge,
  nearestDeckStairPlacement,
  steadyGradeHeightAtPoint,
} from "../src/lib/deck-prescriptive-plan.ts";
import {
  buildDeckTakeoffPreview,
  COMPLETE_REBUILD_LINE_KEYS,
} from "../src/lib/deck-takeoff-v0.ts";

const verified = {
  ...recommendedPrescriptiveDraft("ledger", false, 14, 12),
  jurisdiction: "city_knoxville_verified",
  attachmentConfirmed: true,
  stairsConfirmed: true,
  ledgerSubstrate: "verified_band_rim",
  postHeightFeet: "8",
  footingDiameterInches: "24",
  footingThicknessInches: "8",
  footingDepthInches: "24",
  frostBasis: "City permit reviewer confirmed 24 in basis",
  hardwareBasis:
    "Complete quoted connector schedule: Manufacturer quote H1, all applicable connection groups",
};
const withLayout = (
  draft,
  lengthFeet,
  widthFeet = 12,
  postCount = Number(draft.postCount || 3),
) => ({
  ...draft,
  beamDistanceFromHouseFeet: String(widthFeet),
  postCount: String(postCount),
  footingCount: String(postCount),
  postPositionsFeet: Array.from({ length: postCount }, (_, index) =>
    String((lengthFeet * index) / Math.max(1, postCount - 1)),
  ).join(","),
});

test("bounded 2024 evaluator checks spans, posts, footings and emits purchasable BOM", () => {
  const plan = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: verified,
  });
  assert.equal(plan.status, "ready_for_human_review");
  assert.equal(plan.quantities.joists, 12);
  assert.ok(plan.checks.every((check) => check.result === "pass"));
  assert.match(
    plan.checks.map((x) => x.sourceId).join(" "),
    /R507\.6.*R507\.5.*R507\.4.*R507\.3\.1/,
  );
  assert.deepEqual(
    plan.bom.slice(0, 4).map((line) => [line.key, line.quantity, line.unit]),
    [
      ["joists", 12, "ea"],
      ["beam_plies", 1, "ea"],
      ["posts", 3, "ea"],
      ["footing_concrete", 0.233, "cu yd"],
    ],
  );
  assert.match(plan.bom[0].description, /2x10 × 12 ft/);
  assert.match(plan.bom[1].description, /2x12 × 14 ft beam plies/);
  assert.match(plan.bom[2].description, /6x6 × 8 ft posts/);
  assert.equal(isCanonicalFramingEvidence(plan), true);
  const legacyPlan = structuredClone(plan);
  delete legacyPlan.inputs.draft.beamDistanceFromHouseFeet;
  delete legacyPlan.inputs.draft.postPositionsFeet;
  delete legacyPlan.inputs.draft.postPlacementMode;
  delete legacyPlan.inputs.draft.postDistancesFromHouseFeet;
  delete legacyPlan.inputs.draft.postSnapInches;
  assert.equal(
    isCanonicalFramingEvidence(legacyPlan),
    true,
    "previously saved canonical plans remain readable",
  );
  assert.equal(
    isCanonicalFramingEvidence({
      ...plan,
      bom: [{ ...plan.bom[0], quantity: 999 }],
    }),
    false,
  );
  assert.equal(
    isCanonicalFramingEvidence({
      ...plan,
      quantities: { ...plan.quantities, posts: 99 },
    }),
    false,
  );
  assert.equal(isCanonicalFramingEvidence({ ...plan, extra: true }), false);
  assert.equal(
    isCanonicalFramingEvidence({
      ...plan,
      inputs: {
        ...plan.inputs,
        draft: { ...plan.inputs.draft, unexpected: "field" },
      },
    }),
    false,
  );
  assert.equal(
    isCanonicalFramingEvidence({
      ...plan,
      inputs: {
        ...plan.inputs,
        draft: { ...plan.inputs.draft, hardwareBasis: "x".repeat(161) },
      },
    }),
    false,
  );
  assert.match(
    plan.bom.find((line) => line.key === "ledger").description,
    /2x8/,
  );
  assert.match(
    plan.bom.find((line) => line.key === "footing_concrete").description,
    /pad-only.*pier\/stem concrete not included/i,
  );
  assert.deepEqual(
    plan.bom
      .filter((line) => line.key.startsWith("rim_"))
      .map((line) => line.quantity),
    [1],
  );
  assert.deepEqual(
    plan.hardwareSchedule.map((item) => [item.key, item.quantity]),
    [
      ["ledger_fasteners", 13],
      ["ledger_washers", 13],
      ["ledger_flashing", 14],
      ["wrb_counterflashing_integration", 14],
      ["joist_hangers", 12],
      ["hanger_fasteners", 0],
      ["joist_to_beam", 12],
      ["joist_to_beam_fasteners", 0],
      ["rim_to_joist_restraint", 36],
      ["post_bases", 3],
      ["post_base_anchors", 3],
      ["post_caps", 3],
      ["post_cap_fasteners", 0],
      ["lateral_load_connections", 2],
      ["lateral_load_fasteners", 0],
      ["picture_frame_blocking_connectors", 0],
      ["guard_system_connections", 0],
    ],
  );
  assert.ok(
    plan.hardwareSchedule.every((item) =>
      ["compatible_product_and_price_required", "detail_required"].includes(
        item.selectionStatus,
      ),
    ),
  );
  assert.match(
    plan.hardwareSchedule.find((item) => item.key === "ledger_fasteners")
      .sourceId,
    /Table-R507\.9\.1\.3/,
  );
  assert.match(
    plan.hardwareSchedule.find(
      (item) => item.key === "lateral_load_connections",
    ).specification,
    /1,500 lb.*within 24 in/i,
  );
  assert.match(
    plan.hardwareSchedule.find((item) => item.key === "post_caps").sourceId,
    /R507\.5\.2/,
  );
  assert.equal(
    plan.hardwareSchedule.some((item) => item.key === "beam_ply_fasteners"),
    false,
  );
  const twoPly = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: { ...verified, beamSize: "2x8", beamPlies: "2" },
  });
  assert.equal(
    twoPly.hardwareSchedule.find((item) => item.key === "beam_ply_fasteners")
      .quantity,
    24,
  );
});

test("current 14x12 job produces preliminary quantities while readiness assumptions remain unresolved", () => {
  const draft = {
    ...recommendedPrescriptiveDraft("ledger", true, 14, 12, true),
    jurisdiction: "city_knoxville_estimating_assumption",
    attachmentConfirmed: true,
    stairsConfirmed: true,
    ledgerSubstrate: "estimating_band_rim_assumption",
    joistSize: "2x10",
    joistSpacingInches: "16",
    beamSize: "2x12",
    beamPlies: "1",
    postSize: "6x6",
    postCount: "3",
    postHeightFeet: "10",
    footingDepthInches: "24",
    frostBasis:
      "24 in local frost-depth basis — estimating assumption pending AHJ verification",
  };
  const beforePlacement = deckEstimatingImmediateIssueIds({
    lengthFeet: 14,
    widthFeet: 12,
    draft,
    stairPlacementConfirmed: false,
  });
  const afterPlacement = deckEstimatingImmediateIssueIds({
    lengthFeet: 14,
    widthFeet: 12,
    draft,
    stairPlacementConfirmed: true,
  });
  assert.deepEqual(beforePlacement, ["stairs-fact"]);
  assert.deepEqual(afterPlacement, []);
  const plan = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft,
  });
  assert.equal(plan.status, "ready_for_human_review");
  assert.equal(plan.quantities.joists, 12);
  assert.equal(plan.quantities.posts, 3);
  assert.equal(
    Boolean(plan.quantities) && beforePlacement.length === 0,
    false,
    "approval unavailable before stair placement",
  );
  assert.equal(
    Boolean(plan.quantities) && afterPlacement.length === 0,
    true,
    "approval available after stair placement",
  );
  assert.deepEqual(plan.unresolvedPackages, [
    "stairs",
    "guard_schedule",
    "jurisdiction",
    "ledger_detail",
    "soil_frost",
    "connector_schedule",
  ]);
  assert.equal(isCanonicalFramingEvidence(plan), true);
});

test("simple editor geometry preserves exact post locations and uses the largest real beam span", () => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 12 },
    { x: 0, y: 12 },
  ];
  assert.deepEqual(
    insertOutlinePointOnNearestEdge(rectangle, { x: 5, y: 0.5 }),
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 12 },
      { x: 0, y: 12 },
    ],
  );
  assert.deepEqual(
    insertOutlinePointOnNearestEdge(rectangle, { x: 13.5, y: 4 }),
    [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 4 },
      { x: 14, y: 12 },
      { x: 0, y: 12 },
    ],
  );
  assert.equal(
    insertOutlinePointOnNearestEdge(rectangle, { x: 0.05, y: 0.05 }),
    rectangle,
  );
  assert.equal(
    insertOutlinePointOnNearestEdge(rectangle, { x: 7, y: 6 }),
    rectangle,
  );
  const diagonal = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const diagonalInsert = insertOutlinePointOnNearestEdge(
    diagonal,
    { x: 5.2, y: 4.9 },
    1,
  );
  assert.ok(Math.abs(diagonalInsert[1].x - diagonalInsert[1].y) < 0.0001);
  assert.equal(isValidDeckOutline(rectangle), true);
  assert.equal(
    isValidDeckOutline([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]),
    false,
  );
  assert.equal(
    isValidDeckOutline([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]),
    false,
  );
  assert.equal(
    isValidDeckOutline([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 10 },
    ]),
    false,
  );
  assert.equal(
    isValidDeckOutline([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: 10 },
    ]),
    false,
  );
  assert.deepEqual(parseDeckPostPositions("0,4,14", 14), [0, 4, 14]);
  assert.equal(parseDeckPostPositions("0,14,4", 14)?.join(","), "0,4,14");
  assert.equal(parseDeckPostPositions("0,14,14", 14), null);
  const uneven = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: { ...verified, postPositionsFeet: "0,4,14" },
  });
  assert.equal(
    uneven.checks.find((check) => check.sourceId.includes("R507.5"))?.actual,
    "10.00 ft",
  );
  const inset = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: { ...verified, postPositionsFeet: "1,7,13" },
  });
  assert.match(
    inset.exceptions.join(" "),
    /overhanging beam needs a reviewed design/i,
  );
  const free = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: {
      ...verified,
      postPlacementMode: "free",
      postDistancesFromHouseFeet: "10,10.1667,10",
    },
  });
  assert.match(
    free.exceptions.join(" "),
    /reviewed custom beam\/support plan/i,
  );
});

test("shape editor uses magnetic angle and grid snapping without locking freehand movement", () => {
  assert.deepEqual(
    snapDeckOutlinePoint(
      { x: 10.2, y: 0.2 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ),
    { x: 10.202, y: 0 },
  );
  assert.deepEqual(
    snapDeckOutlinePoint(
      { x: 4.24, y: 1.74 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ),
    { x: 4.24, y: 1.74 },
  );
  const gridOnly = snapDeckOutlinePoint(
    { x: 4.42, y: 1.62 },
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  );
  assert.deepEqual(gridOnly, { x: 4.5, y: 1.5 });
});

test("stairs attach to the nearest wall and steady grade estimates their local height", () => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 12 },
    { x: 0, y: 12 },
  ];
  assert.deepEqual(nearestDeckStairPlacement(rectangle, { x: 13.8, y: 8 }, 4, 3), {
    edgeIndex: 1,
    offsetFeet: 8,
    widthFeet: 4,
    projectionFeet: 3,
  });
  const heights = {
    houseLeftFeet: 8,
    houseRightFeet: 10,
    yardLeftFeet: 10,
    yardRightFeet: 12,
  };
  assert.equal(steadyGradeHeightAtPoint({ x: 0, y: 0 }, { minX: 0, maxX: 14, minY: 0, maxY: 12 }, heights), 8);
  assert.equal(steadyGradeHeightAtPoint({ x: 14, y: 12 }, { minX: 0, maxX: 14, minY: 0, maxY: 12 }, heights), 12);
  assert.equal(steadyGradeHeightAtPoint({ x: 7, y: 6 }, { minX: 0, maxX: 14, minY: 0, maxY: 12 }, heights), 10);
});

test("moving a wall translates both edge corners and updates its adjoining measurements", () => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 12 },
    { x: 0, y: 12 },
  ];
  const moved = moveDeckOutlineEdge(rectangle, 1, 2, false);
  assert.deepEqual(moved, [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 12 },
    { x: 0, y: 12 },
  ]);
  assert.equal(Math.hypot(moved[2].x - moved[1].x, moved[2].y - moved[1].y), 12);
  assert.equal(Math.hypot(moved[1].x - moved[0].x, moved[1].y - moved[0].y), 12);
  assert.equal(Math.hypot(moved[3].x - moved[2].x, moved[3].y - moved[2].y), 12);

  const magneticallyMoved = moveDeckOutlineEdge(rectangle, 2, 1.42, true);
  assert.equal(magneticallyMoved[2].y, 10.5);
  assert.equal(magneticallyMoved[3].y, 10.5);
  assert.equal(moveDeckOutlineEdge(rectangle, 9, 1), rectangle);
});

test("drawing zoom preserves fit boundaries and pointer geometry", () => {
  assert.equal(nextDeckDrawingZoom(50, -25, false), 50);
  assert.equal(nextDeckDrawingZoom(75, -25, false), 50);
  assert.equal(nextDeckDrawingZoom(100, -25, true), 100);
  assert.equal(nextDeckDrawingZoom(175, 25, true), 200);
  assert.equal(nextDeckDrawingZoom(200, 25, false), 200);
  for (const zoom of [50, 100, 200]) {
    const width = 340 * (zoom / 100);
    const height = 230 * (zoom / 100);
    assert.deepEqual(
      drawingClientToDeckPoint(
        { x: width / 2, y: (105 / 230) * height },
        { left: 0, top: 0, width, height },
        { lengthFeet: 14, widthFeet: 12 },
      ),
      { x: 7, y: 6 },
    );
  }
});

test("every encoded IRC 2024 Table R507.5(1) 12-and-0 beam cell has an exact at/over boundary", () => {
  const cells = {
    "2x6": { 1: 4, 2: 71 / 12, 3: 89 / 12 },
    "2x8": { 1: 61 / 12, 2: 91 / 12, 3: 114 / 12 },
    "2x10": { 1: 6, 2: 9, 3: 134 / 12 },
    "2x12": { 1: 85 / 12, 2: 127 / 12, 3: 159 / 12 },
  };
  for (const [size, plies] of Object.entries(cells))
    for (const [ply, limit] of Object.entries(plies)) {
      const atLength = limit * 2;
      const at = buildPrescriptiveDeckPlan({
        lengthFeet: atLength,
        widthFeet: 12,
        draft: withLayout(
          {
            ...verified,
            beamSize: size,
            beamPlies: ply,
            footingDiameterInches: "40",
            footingThicknessInches: "15",
          },
          atLength,
        ),
      });
      assert.equal(
        at.checks.find((check) => check.sourceId.includes("R507.5"))?.result,
        "pass",
        `${ply}-${size} at limit`,
      );
      const overLength = limit * 2 + 0.02;
      const over = buildPrescriptiveDeckPlan({
        lengthFeet: overLength,
        widthFeet: 12,
        draft: withLayout(
          {
            ...verified,
            beamSize: size,
            beamPlies: ply,
            footingDiameterInches: "40",
            footingThicknessInches: "15",
          },
          overLength,
        ),
      });
      assert.equal(
        over.checks.find((check) => check.sourceId.includes("R507.5"))?.result,
        "exception",
        `${ply}-${size} over limit`,
      );
    }
});

test("4x4 post limits are enforced at and over each encoded tributary-area column", () => {
  const rows = [
    [20, 14],
    [40, 13 + 8 / 12],
    [60, 11],
    [80, 9 + 5 / 12],
    [100, 8 + 4 / 12],
    [120, 7 + 5 / 12],
    [140, 6 + 9 / 12],
    [160, 6 + 2 / 12],
  ];
  for (const [area, height] of rows) {
    const length = area / 3; // 12-ft joist span × (length/2 post span) ÷ 2 = 3×length tributary area.
    const at = buildPrescriptiveDeckPlan({
      lengthFeet: length,
      widthFeet: 12,
      draft: withLayout(
        {
          ...verified,
          postSize: "4x4",
          postHeightFeet: String(height),
          footingDiameterInches: "40",
          footingThicknessInches: "15",
        },
        length,
      ),
    });
    assert.equal(
      at.checks.find((check) => check.sourceId.includes("R507.4"))?.result,
      "pass",
      `post at ${area}`,
    );
    const over = buildPrescriptiveDeckPlan({
      lengthFeet: length,
      widthFeet: 12,
      draft: withLayout(
        {
          ...verified,
          postSize: "4x4",
          postHeightFeet: String(height + 0.01),
          footingDiameterInches: "40",
          footingThicknessInches: "15",
        },
        length,
      ),
    });
    assert.equal(
      over.checks.find((check) => check.sourceId.includes("R507.4"))?.result,
      "exception",
      `post over ${area}`,
    );
  }
});

test("evaluator fails at rule boundaries and rejects unsupported assumptions", () => {
  const overJoist = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 14.1,
    draft: withLayout(verified, 14, 14.1),
  });
  assert.match(overJoist.exceptions.join(" "), /joist size\/spacing\/span/i);
  const overBeam = buildPrescriptiveDeckPlan({
    lengthFeet: 19,
    widthFeet: 12,
    draft: withLayout(verified, 19),
  });
  assert.match(overBeam.exceptions.join(" "), /beam check/i);
  const overPost = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: { ...verified, postSize: "4x4", postHeightFeet: "14" },
  });
  assert.match(overPost.exceptions.join(" "), /post size\/height/i);
  const underFooting = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: { ...verified, footingDiameterInches: "10" },
  });
  assert.match(underFooting.exceptions.join(" "), /footing diameter/i);
  const unknown = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: {
      ...verified,
      speciesGrade: "",
      ledgerSubstrate: "concrete_or_other",
      roofOrSpecialLoad: true,
    },
  });
  assert.match(
    unknown.exceptions.join(" "),
    /band\/rim.*Southern Pine.*special loads/i,
  );
  const freestanding = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: {
      ...verified,
      attachment: "freestanding",
      ledgerSubstrate: "unknown",
      beamLineCount: "2",
    },
  });
  assert.match(
    freestanding.exceptions.join(" "),
    /Freestanding support geometry is not supported/i,
  );
  const stairs = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: {
      ...verified,
      stairsIncluded: "yes",
      stairStringerCount: "3",
      stairLandingFootingCount: "2",
    },
  });
  assert.equal(stairs.status, "ready_for_human_review");
  assert.deepEqual(stairs.unresolvedPackages, [
    "stairs",
    "guard_schedule",
    "connector_schedule",
  ]);
  assert.equal(isCanonicalFramingEvidence(stairs), true);
  assert.equal(stairs.quantities.stairStringers, 0);
  assert.equal(
    stairs.bom.some((line) =>
      /stair|stringer|connector_schedule_quote/.test(line.key),
    ),
    false,
  );
  assert.equal(
    stairs.hardwareSchedule.find(
      (item) => item.key === "guard_stair_connections",
    )?.selectionStatus,
    "detail_required",
  );
  const noStairs = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: verified,
  });
  assert.deepEqual(noStairs.unresolvedPackages, [
    "guard_schedule",
    "connector_schedule",
  ]);
});

test("blueprint facts seed confirmations and UI renders real geometry markers", () => {
  const initial = recommendedPrescriptiveDraft("freestanding", false);
  assert.equal(initial.attachment, "freestanding");
  assert.equal(initial.stairsIncluded, "no");
  assert.equal(initial.attachmentConfirmed, false);
  const ui = readFileSync(
    "src/components/estimates/deck-prescriptive-plan-generator.tsx",
    "utf8",
  );
  const compactUi = ui.replace(/\s+/g, " ");
  const planner = readFileSync(
    "src/components/estimates/deck-takeoff-planner.tsx",
    "utf8",
  );
  const route = readFileSync(
    "src/app/api/estimates/[estimateId]/deck-takeoff/route.ts",
    "utf8",
  );
  assert.equal(
    KNOXVILLE_2024_DECK_PROFILE.id,
    "city-knoxville-2024-irc-r507-southern-pine-v2",
  );
  for (const marker of [
    'data-plan-member="joist"',
    'data-plan-member="beam"',
    'data-plan-member="post"',
    'data-plan-member="footing"',
    'data-plan-member="stair-opening"',
  ])
    assert.match(ui, new RegExp(marker));
  assert.match(ui, /Required framing source for a full rebuild/);
  assert.match(ui, /not stamped/i);
  assert.match(
    planner,
    /blueprintAttachment=\{[\s\S]*railingGeometry\.attached/,
  );
  assert.match(planner, /framingPlanEvidence: approvedPlan/);
  assert.match(
    planner,
    /generatedShapeChanged[\s\S]*framingPlanEvidence:[\s\S]*generatedShapeChanged[\s\S]*\?[\s\S]*null/,
  );
  assert.match(route, /isCanonicalFramingEvidence/);
  assert.match(route, /assertPartialFramingEvidenceBinding\(parsed\)/);
  assert.match(planner, /bounded profile generated and checked/i);
  assert.match(
    planner,
    /buildPlanConfirmed: false,[\s\S]*framingPlanEvidence: approvedPlan/,
  );
  assert.match(planner, /structural_connectors: ""/);
  assert.match(planner, /stairs: stairsIncluded \? "" : "not_in_scope"/);
  assert.match(ui, /Main deck framing draft is partially ready/);
  assert.match(ui, /drag stairs/);
  assert.doesNotMatch(ui, /Complete quoted connector schedule:/);
  assert.match(
    ui,
    /Compatible connector products, manufacturer fasteners, prices,[\s\S]*and traceable sources/,
  );
  assert.match(planner, /Price compatible hardware/);
  assert.match(ui, /Generate draft blueprint/);
  assert.match(ui, /Edit blueprint details/);
  assert.match(ui, /What this draft still needs/);
  assert.match(ui, /data-plan-member="blueprint-callout"/);
  assert.match(ui, /aria-labelledby="blueprint-callouts-heading"/);
  assert.match(
    ui,
    /The numbered markers show where missing or unsupported decisions[\s\S]*affect the drawing/,
  );
  assert.match(
    ui,
    /setGenerated\(true\);[\s\S]*setDetailsOpen\(false\);[\s\S]*setStep\(4\)/,
  );
  assert.match(ui, /detailsOpen && step === 0/);
  assert.ok(
    planner.indexOf("<DeckPrescriptivePlanGenerator") <
      planner.indexOf("Edit board layout and stair placement"),
  );
  assert.doesNotMatch(planner, /<DeckPlanVisual/);
  assert.match(
    planner,
    /blueprintAttachment=\{[\s\S]*railingGeometry\.attached === null[\s\S]*\? null/,
  );
  assert.match(ui, /type BlueprintCallout/);
  for (const stableId of [
    "stale-field-facts",
    "dimensions-profile",
    "attachment-fact",
    "stairs-fact",
    "railings-fact",
    "outside-profile",
  ])
    assert.match(ui, new RegExp(`id: "${stableId}"`));
  for (const laterOnly of [
    "jurisdiction",
    "ledger-substrate",
    "support-foundation",
    "package-stairs",
    "package-guards",
    "package-connectors",
  ])
    assert.doesNotMatch(ui, new RegExp(`id: "${laterOnly}"`));
  assert.match(ui, /data-plan-member="callout-leader"/);
  assert.match(
    ui,
    /callout\.kind === "package"\)[\s\S]*openPackageGuidance\(callout\.id\)/,
  );
  assert.match(ui, /Open package guidance/);
  assert.match(ui, /Complete the Stairs category in the takeoff checklist/);
  assert.match(ui, /Complete the Structural connectors category/);
  assert.match(ui, /data-edit-handle=\{layoutEditorOpen \? "stairs"/);
  assert.match(
    ui,
    /stairEdge === "left" \|\| stairEdge === "right" \? 25 : 40/,
  );
  assert.match(
    ui,
    /ESTIMATING DRAFT — NOT FOR PERMIT OR CONSTRUCTION — NOT STAMPED/,
  );
  assert.match(
    ui,
    /aria-labelledby=\{`\$\{svgTitleId\} \$\{svgDescriptionId\}`\}/,
  );
  assert.match(ui, /Outdated field facts — approval blocked/);
  assert.match(ui, /Rebuild from updated field facts/);
  assert.match(ui, /Keep current draft for comparison only/);
  assert.match(
    compactUi,
    /disabled=\{ ?!plan\.quantities \|\| callouts\.length > 0 \|\| Boolean\(pendingFacts\) ?\}/,
  );
  assert.match(
    compactUi,
    /disabled=\{ ?disabled \|\| !approved \|\| !plan\.quantities \|\| callouts\.length > 0 \|\| Boolean\(pendingFacts\) ?\}/,
  );
  assert.doesNotMatch(ui, /permit-preparation plan/);
  assert.match(ui, /sticky bottom-2/);
  assert.match(ui, /Observed existing — completed human site visit/);
  assert.match(ui, /Proposed estimating assumptions — reviewable/);
  assert.match(
    ui,
    /They are not[\s\S]*automatically declared to be the replacement design/,
  );
  assert.match(ui, /Later: design, ordering, and permit readiness/);
  assert.match(ui, /No immediate layout questions remain/);
  assert.match(planner, /deckBlueprintVisitSeed\(visitItems\)/);
  assert.match(ui, /Measured deck drawing/);
  assert.match(ui, /Edit this drawing/);
  assert.match(ui, /Support beam distance from house/);
  assert.match(ui, /Add post/);
  assert.match(ui, /Space posts evenly/);
  assert.match(ui, /There is intentionally no AI instruction box/);
  assert.match(ui, /Draw a new shape/);
  assert.match(ui, /Finish shape/);
  assert.match(ui, /Undo last point/);
  assert.match(ui, /Reset to saved rectangle/);
  assert.match(ui, /click corner \{outlinePoints\.length \+ 1\}/);
  assert.match(ui, /addOutlinePointFromDrawing/);
  assert.match(ui, /Points snap to one-inch measurements/);
  assert.match(ui, /Edge \$\{index \+ 1\} length in feet/);
  assert.match(
    ui,
    /resizeOutlineEdge\(\s*index,\s*Number\(event\.target\.value\),?\s*\)/,
  );
  assert.match(ui, /editedHorizontal && followingVertical/);
  assert.match(ui, /editedVertical && followingHorizontal/);
  assert.match(ui, /<foreignObject/);
  assert.match(ui, /data-plan-member="drawing-background"/);
  assert.match(ui, /data-edit-handle="outline-click-surface"/);
  assert.match(ui, /selectedOutlinePoint === index \? "#facc15" : "#f97316"/);
  assert.match(ui, /event\.currentTarget\.setPointerCapture/);
  assert.match(ui, /onLostPointerCapture/);
  assert.match(ui, /Add corner points for a bump-out or notch/);
  assert.match(ui, /Done adding corner points/);
  assert.match(ui, /insertOutlinePointFromDrawing/);
  assert.match(ui, /No point added\. Tap closer to an existing deck edge/);
  assert.match(ui, /Undo last added corner/);
  assert.match(ui, /Remove selected corner/);
  assert.match(ui, /isValidDeckOutline\(moved\)/);
  assert.match(ui, /outlineDrawingActive \|\| outlinePointAddingActive/);
  assert.match(ui, /r="24"/);
  assert.match(ui, /outlinePoints\.length >= 24/);
  assert.match(
    ui,
    /if \(next === outlinePoints\)[\s\S]*?return;[\s\S]*?setOutlinePoints\(\[\.\.\.next\]\);[\s\S]*?markCustomOutline\(\)/,
  );
  assert.match(ui, /aria-label={`Select deck corner \${index \+ 1}`}/);
  assert.match(ui, /pauses automatic structural quantities/);
  assert.match(ui, /Fit whole drawing/);
  assert.match(ui, /Drawing zoom percentage/);
  assert.match(ui, /nextDeckDrawingZoom\(current, -25, layoutEditorOpen\)/);
  assert.match(ui, /nextDeckDrawingZoom\(current, 25, layoutEditorOpen\)/);
  assert.match(ui, /width: `\$\{drawingZoom\}%`/);
  assert.match(ui, /drawingViewportRef\.current\.scrollLeft = 0/);
  assert.match(ui, /drawingZoom < 100 \? " · view only" : ""/);
  assert.match(ui, /min=\{layoutEditorOpen \? 100 : 50\}/);
  assert.match(ui, /if \(!layoutEditorOpen && drawingZoom < 100\)/);
  assert.match(ui, /aria-valuetext=/);
  assert.match(ui, /colorScheme: "light"/);
  assert.match(ui, />ft<\/span>/);
  assert.match(ui, /Framing markers — optional for later/);
  assert.match(ui, /activeDrawingDrag\.type === "corner"/);
  assert.match(ui, /activeDrawingDrag\.type === "stair"/);
  assert.match(ui, /onStairPlacementChange\(nearest\.edge, snapped\)/);
  assert.match(
    ui,
    /draft\.postPlacementMode === "free"[\s\S]*movePostDistance/,
  );
  assert.match(ui, /Drag the support line toward or away from the house/);
  assert.match(ui, /data-edit-handle/);
  assert.match(ui, /onPointerMove/);
  assert.match(ui, /setPointerCapture/);
  assert.match(ui, /Snap to structural lines \(recommended\)/);
  assert.match(ui, /Free placement/);
  assert.match(ui, /1 inch \(recommended\)/);
  assert.match(ui, /Automatic structural quantities pause/);
  assert.match(ui, /within 6 inches of a perimeter snap exactly/);
  assert.match(ui, /snapToStructuralLine/);
  assert.match(ui, /postPositions\.map/);
  assert.match(ui, /260 \* position/);
  assert.match(ui, /fill="#dbeafe"/);
  assert.match(ui, /stroke="#0f172a"/);
  assert.doesNotMatch(ui, /selectedOutlineEdge/);
  assert.doesNotMatch(ui, /fill="#22d3ee"/);
  assert.match(ui, /border-2 border-slate-950 bg-white/);
  assert.match(planner, /framingPlanEvidence\.inputs\.lengthFeet/);
});

test("exact partial stairs payload passes route binding while tampering and false completion reject", () => {
  const evidence = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: { ...verified, stairsIncluded: "yes" },
  });
  assert.equal(evidence.status, "ready_for_human_review");
  const groups = {
    ledger_attachment: ["ledger"],
    joists: ["joists"],
    beams: ["beam_plies"],
    posts: ["posts"],
    footings: ["footing_concrete"],
    blocking: ["rim_long", "extra_blocking"],
  };
  const lines = Object.entries(groups).map(([key, keys]) => {
    const members = evidence.bom.filter((item) => keys.includes(item.key));
    return {
      key,
      description: members.map((item) => item.description).join("; "),
      quantity: String(members.reduce((sum, item) => sum + item.quantity, 0)),
      unit: members[0].unit,
    };
  });
  const hardwareSelections = evidence.hardwareSchedule.map((item) => ({
    key: item.key,
    description: item.specification,
    quantity: item.quantity > 0 ? String(item.quantity) : "",
    unit: item.unit,
    verificationReference: "",
  }));
  const payload = {
    buildPlanReference: evidence.reference,
    buildPlanConfirmed: false,
    framingPlanEvidence: evidence,
    additionalLines: lines,
    hardwareSelections,
  };
  assert.doesNotThrow(() => assertPartialFramingEvidenceBinding(payload));
  assert.throws(
    () =>
      assertPartialFramingEvidenceBinding({
        ...payload,
        buildPlanConfirmed: true,
      }),
    /cannot confirm a complete build plan/,
  );
  assert.throws(
    () =>
      assertPartialFramingEvidenceBinding({
        ...payload,
        buildPlanReference: "changed",
      }),
    /binding is invalid/,
  );
  assert.throws(
    () =>
      assertPartialFramingEvidenceBinding({
        ...payload,
        additionalLines: lines.map((line) =>
          line.key === "joists" ? { ...line, quantity: "999" } : line,
        ),
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      assertPartialFramingEvidenceBinding({
        ...payload,
        hardwareSelections: hardwareSelections.slice(1),
      }),
    /does not match/,
  );
});

test("canonical hardware quantities cannot be under-ordered while detail-required rows remain unresolved", () => {
  const evidence = buildPrescriptiveDeckPlan({
    lengthFeet: 14,
    widthFeet: 12,
    draft: verified,
  });
  const groups = {
    ledger_attachment: ["ledger"],
    joists: ["joists"],
    beams: ["beam_plies"],
    posts: ["posts"],
    footings: ["footing_concrete"],
    blocking: ["rim_long", "extra_blocking"],
  };
  const generated = Object.entries(groups).map(([key, keys]) => {
    const members = evidence.bom.filter((item) => keys.includes(item.key));
    return {
      key,
      category: "material",
      description: members.map((item) => item.description).join("; "),
      quantity: String(members.reduce((sum, item) => sum + item.quantity, 0)),
      unit: members[0].unit,
      unitCost: "10",
      catalogMaterialId: null,
      sourceReference: "Reviewed price source",
    };
  });
  const additionalLines = COMPLETE_REBUILD_LINE_KEYS.map(
    (key) =>
      generated.find((line) => line.key === key) ?? {
        key,
        category: key === "labor" ? "labor" : "material",
        description: key,
        quantity: key === "structural_connectors" ? "" : "1",
        unit: key === "structural_connectors" ? "" : "ea",
        unitCost: key === "structural_connectors" ? "" : "10",
        catalogMaterialId: null,
        sourceReference:
          key === "structural_connectors" ? "" : "Reviewed price source",
      },
  );
  const hardwareSelections = evidence.hardwareSchedule.map((item) => ({
    key: item.key,
    description: item.specification,
    quantity: String(item.quantity || 1),
    unit: item.unit,
    unitCost: "1",
    catalogMaterialId: null,
    sourceReference: "Manufacturer product page",
    verificationReference:
      "Reviewed model, coating, substrate, and installation schedule",
  }));
  const plan = {
    takeoffScope: "complete_rebuild",
    completeRebuildConfirmed: true,
    buildPlanReference: evidence.reference,
    buildPlanConfirmed: false,
    framingPlanEvidence: evidence,
    hardwareSelections,
    scopeDecisions: Object.fromEntries(
      COMPLETE_REBUILD_LINE_KEYS.map((key) => [
        key,
        key === "stairs" || key === "delivery" || key === "equipment"
          ? "not_in_scope"
          : "include",
      ]),
    ),
    boardRunDirection: "along_length",
    stairEdge: "yard",
    stairPosition: "center",
    stairPlacementConfirmed: true,
    boardActualWidthInches: "5.5",
    boardGapInches: "0.125",
    boardStockLengthFeet: "14",
    boardWastePercent: "10",
    boardCatalogMaterialId: null,
    boardUnitCost: "10",
    boardSourceReference: "Board product page",
    screwCoverageSquareFeetPerPack: "100",
    screwCatalogMaterialId: null,
    screwPackUnitCost: "20",
    screwSourceReference: "Fastener manufacturer coverage and product page",
    railingSectionLengthFeet: "6",
    railingCatalogMaterialId: null,
    railingUnitCost: "100",
    railingSourceReference: "Railing product page",
    additionalLines,
  };
  const items = [
    {
      itemKey: "full_deck_yard",
      observation: {
        measurements: {
          length: { value: "14", unit: "ft" },
          width: { value: "12", unit: "ft" },
        },
      },
    },
    { itemKey: "house_ledger", observation: { conditionStatus: "applies" } },
    {
      itemKey: "stairs_landings",
      observation: { conditionStatus: "not_applicable" },
    },
    { itemKey: "guards_railings", observation: { conditionStatus: "applies" } },
  ];
  const exact = buildDeckTakeoffPreview({ items, plan, catalog: new Map() });
  assert.equal(
    exact.unresolved.some((message) =>
      /rim to joist restraint needs/.test(message),
    ),
    false,
  );
  assert.equal(
    evidence.hardwareSchedule.find(
      (item) => item.key === "rim_to_joist_restraint",
    ).quantity,
    36,
  );
  const under = buildDeckTakeoffPreview({
    items,
    catalog: new Map(),
    plan: {
      ...plan,
      hardwareSelections: hardwareSelections.map((item) =>
        item.key === "rim_to_joist_restraint"
          ? { ...item, quantity: "35" }
          : item,
      ),
    },
  });
  assert.ok(
    under.unresolved.some((message) =>
      /rim to joist restraint.*at least 36/.test(message),
    ),
  );
  const over = buildDeckTakeoffPreview({
    items,
    catalog: new Map(),
    plan: {
      ...plan,
      hardwareSelections: hardwareSelections.map((item) =>
        item.key === "rim_to_joist_restraint"
          ? { ...item, quantity: "40" }
          : item,
      ),
    },
  });
  assert.equal(
    over.unresolved.some((message) =>
      /rim to joist restraint needs/.test(message),
    ),
    false,
  );
  const missingDetail = buildDeckTakeoffPreview({
    items,
    catalog: new Map(),
    plan: {
      ...plan,
      hardwareSelections: hardwareSelections.map((item) =>
        item.key === "hanger_fasteners" ? { ...item, quantity: "" } : item,
      ),
    },
  });
  assert.ok(
    missingDetail.unresolved.some((message) =>
      /hanger fasteners needs/.test(message),
    ),
  );
});
