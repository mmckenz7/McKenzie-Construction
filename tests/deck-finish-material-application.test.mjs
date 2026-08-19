import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDeckFinishMaterialMutation,
  deckFinishMaterialPreview,
} from "../src/lib/deck-finish-material-application.ts";
import { parseDeckFinishDraftSnapshot } from "../src/lib/deck-finish-draft.ts";

const route = readFileSync(
  "src/app/api/estimates/[estimateId]/deck-finish-materials/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260819110000_deck_finish_material_applications.sql",
  "utf8",
);
const planner = readFileSync(
  "src/components/estimates/deck-takeoff-planner.tsx",
  "utf8",
);
const takeoffRoute = readFileSync(
  "src/app/api/estimates/[estimateId]/deck-takeoff/route.ts",
  "utf8",
);

const selection = parseDeckFinishDraftSnapshot({
  version: "custom-deck-finish-draft-v2",
  deckingFamily: "composite",
  compositeColor: "brown",
  railingFamily: "wood",
  stairRailSides: 2,
  woodRailingRate: 25,
  board: {
    actualWidthInches: 5.5,
    gapInches: 0.125,
    stockLengthFeet: 16,
    wastePercent: 10,
  },
  lines: [
    {
      key: "custom_decking",
      description: "Trex grooved field boards",
      quantity: 37,
      unit: "ea",
      unitCost: 79.98,
      sourceReference: "https://www.lowes.com/pd/example-grooved/1",
      catalogMaterialId: null,
    },
    {
      key: "custom_decking_square_edge",
      description: "Trex square-edge border and divider boards",
      quantity: 6,
      unit: "ea",
      unitCost: 90,
      sourceReference: "https://www.lowes.com/pd/example-square/2",
      catalogMaterialId: null,
    },
    {
      key: "custom_railing",
      description: "Wood railing material allowance",
      quantity: 80,
      unit: "ln ft",
      unitCost: 25,
      sourceReference: "McKenzie reviewed per-foot allowance",
      catalogMaterialId: null,
    },
  ],
});

test("finish preview prices grooved, square-edge, and railing materials without framing", () => {
  const preview = deckFinishMaterialPreview({
    finishSelectionRevisionId: "11111111-1111-4111-8111-111111111111",
    finishSelectionRevision: 4,
    selection,
  });
  assert.deepEqual(
    preview.lines.map((line) => [line.key, line.lineTotal]),
    [
      ["custom_decking", 2959.26],
      ["custom_decking_square_edge", 540],
      ["custom_railing", 2000],
    ],
  );
  assert.equal(preview.materialSubtotal, 5499.26);
  assert.match(preview.previewBinding, /^[0-9a-f]{64}$/);
});

test("finish application creates material-only estimate lines bound to the reviewed preview", () => {
  const preview = deckFinishMaterialPreview({
    finishSelectionRevisionId: "11111111-1111-4111-8111-111111111111",
    finishSelectionRevision: 4,
    selection,
  });
  let next = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;
  const built = buildDeckFinishMaterialMutation({
    finishSelectionRevisionId: preview.finishSelectionRevisionId,
    finishSelectionRevision: preview.finishSelectionRevision,
    selection,
    previewBinding: preview.previewBinding,
    state: { estimate: {}, sections: [], items: [] },
    uuid,
  });
  assert.equal(built.newItems.length, 3);
  assert.ok(built.newItems.every((line) => line.materialUnitCost !== "0"));
  assert.ok(built.newItems.every((line) => line.laborUnitCost === "0"));
  assert.deepEqual(
    built.evidenceSnapshot.lines.map((line) => line.estimateLineItemId),
    built.newItems.map((line) => line.id),
  );
  assert.throws(
    () =>
      buildDeckFinishMaterialMutation({
        finishSelectionRevisionId: preview.finishSelectionRevisionId,
        finishSelectionRevision: preview.finishSelectionRevision,
        selection,
        previewBinding: "0".repeat(64),
        state: { estimate: {}, sections: [], items: [] },
      }),
    /preview changed/i,
  );
});

test("composite pricing fails closed when the square-edge purchase line is incomplete", () => {
  const incomplete = parseDeckFinishDraftSnapshot({
    ...selection,
    lines: selection.lines.map((line) =>
      line.key === "custom_decking_square_edge"
        ? { ...line, unitCost: null }
        : line,
    ),
  });
  assert.throws(
    () =>
      deckFinishMaterialPreview({
        finishSelectionRevisionId: "11111111-1111-4111-8111-111111111111",
        finishSelectionRevision: 4,
        selection: incomplete,
      }),
    /square edge is not ready/i,
  );
});

test("finish-cost persistence is tenant-scoped, immutable, idempotent, and exact", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  assert.match(migration, /deck_estimate_finish_material_applications/);
  assert.match(migration, /deck_estimate_finish_material_application_lines/);
  assert.match(migration, /unique\(estimate_id,visit_id\)/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /get_effective_user_access/);
  assert.match(migration, /assert_single_company_fence_estimate_scope/);
  assert.match(migration, /finish\.selection_snapshot/);
  assert.match(migration, /estimateLineItemId/);
  assert.match(migration, /persist_structured_estimate_outputs/);
  assert.match(migration, /revoke all on function public\.apply_reviewed_deck_finish_materials[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.apply_reviewed_deck_finish_materials[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
});

test("UI adds the visible finish subtotal now and full takeoff skips those keys later", () => {
  assert.match(planner, /Finish material estimate/);
  assert.match(planner, /Selected finish subtotal/);
  assert.match(planner, /addFinishMaterialsToEstimate/);
  assert.match(planner, /deck-finish-materials/);
  assert.match(planner, /does not wait for framing or labor/);
  assert.match(route, /authorizeEstimateRequest/);
  assert.match(route, /canEditPrices/);
  assert.match(route, /apply_reviewed_deck_finish_materials/);
  assert.match(takeoffRoute, /appliedFinishKeys/);
  assert.match(takeoffRoute, /remainingPreviewLines/);
  assert.match(takeoffRoute, /finishMaterialKeysAlreadyApplied/);
});
