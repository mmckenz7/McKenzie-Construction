import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

import { buildFenceEstimateApplicationPlan } from "../src/lib/fence-estimate-application.ts";
import { buildFenceEmblemLowesEvidenceManifest } from "../src/lib/fence-emblem-lowes-evidence.ts";
import { projectFenceEmblemRetailPreview } from "../src/lib/fence-emblem-priced-preview.ts";
import { projectEmblemManufacturerTakeoff } from "../src/lib/fence-emblem-takeoff.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { calculateMutation } = await import("../src/lib/estimate-mutations.ts");
const { buildReviewedFenceMaterialMutation } = await import("../src/lib/fence-material-application.ts");

const route = readFileSync("src/app/api/estimates/[estimateId]/fence-materials/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260812140000_fence_reviewed_material_application.sql", "utf8");
const ui = readFileSync("src/components/estimates/fence-estimate-review.tsx", "utf8");

function reviewedBinding() {
  const takeoff = projectEmblemManufacturerTakeoff({
    runLengthsInches: ["198"], needsGate: false,
    answers: { system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level", frostDepthInches: "12", conditions: "none" },
  });
  assert.equal(takeoff.status, "ready");
  const preview = projectFenceEmblemRetailPreview({ takeoff, evidence: buildFenceEmblemLowesEvidenceManifest() });
  assert.equal(preview.status, "ready");
  return buildFenceEstimateApplicationPlan({ fenceRevision: 7, takeoff: takeoff.manufacturerTakeoff, pricedPreview: preview }).previewBinding;
}

function state() {
  return {
    estimate: {
      calculation_policy_version: "structured-estimate-v2-material-tax",
      overhead_percent_text: "10.000", profit_markup_percent_text: "20.000",
      tax_rate_percent_text: "9.25", discount_value_text: "5.00",
    },
    items: [], sections: [],
  };
}

test("server reconstruction creates canonical zero-markup raw-cost lines and immutable evidence linkage", () => {
  let index = 1;
  const built = buildReviewedFenceMaterialMutation({
    draft: { revision: 7, runLengthsInches: [198], needsGate: false,
      contextAnswers: { system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level", frostDepthInches: 12, conditions: "none" } },
    state: state(), expectedFenceRevision: 7, previewBinding: reviewedBinding(),
    uuid: () => `71000000-0000-4000-8000-${String(index++).padStart(12, "0")}`,
  });
  assert.equal(built.newItems.length, 4);
  assert.equal(built.evidenceSnapshot.lines.length, 4);
  for (const [lineIndex, item] of built.newItems.entries()) {
    assert.equal(item.materialWastePercent, "0");
    assert.equal(item.itemMarkupPercent, "0");
    assert.equal(item.materialUnitCost, built.evidenceSnapshot.lines[lineIndex].materialUnitCost);
    assert.equal(item.id, built.evidenceSnapshot.lines[lineIndex].estimateLineItemId);
  }
  const calculated = calculateMutation(state().estimate, built.newItems);
  assert.equal(calculated.calculation.policyVersion, "structured-estimate-v2-material-tax");
  assert.equal(calculated.itemCalculations.length, 4);
});

test("server reconstruction rejects stale or tampered review bindings", () => {
  assert.throws(() => buildReviewedFenceMaterialMutation({
    draft: { revision: 7, runLengthsInches: [198], needsGate: false,
      contextAnswers: { system: "emblem_6x8_white", measurementBasis: "post_centers", terrain: "level", frostDepthInches: 12, conditions: "none" } },
    state: state(), expectedFenceRevision: 7, previewBinding: `${reviewedBinding()}tampered`,
  }), /stale or has been changed/);
});

test("route exposes only an explicit authorized action and reconstructs lines server-side", () => {
  assert.match(route, /authorizeEstimateRequest\(request, estimateId\)/);
  assert.match(route, /canEditPrices/);
  assert.match(route, /FENCE_MATERIAL_APPLICATION_FIELDS/);
  assert.match(route, /buildReviewedFenceMaterialMutation/);
  assert.match(route, /expectedFenceRevision/);
  assert.match(route, /expectedCalculationRevision/);
  assert.match(route, /applicationId/);
  assert.match(route, /idempotencyKey/);
  assert.match(route, /apply_reviewed_fence_materials/);
  assert.doesNotMatch(route, /material_catalog|publish/i);
});

test("database transaction is append-only, revision-fenced, all-or-none, and catalog-independent", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /fence_material_application_revision_unique unique \(estimate_id, fence_revision\)/);
  assert.match(migration, /fence_material_application_idempotency_unique unique \(company_id, idempotency_key\)/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /for update/);
  assert.match(migration, /calculation_policy_version is distinct from 'structured-estimate-v2-material-tax'/);
  assert.match(migration, /requested_expected_fence_revision/);
  assert.match(migration, /requested_expected_calculation_revision/);
  assert.match(migration, /perform public\.persist_structured_estimate_outputs/);
  assert.match(migration, /jsonb_typeof\(requested_evidence_snapshot -> 'lines'\) is distinct from 'array'/);
  assert.match(migration, /when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value/);
  assert.match(migration, /resulting_calculation_revision = expected_calculation_revision \+ 1/);
  assert.match(migration, /material_catalog_id[\s\S]*?null/);
  assert.doesNotMatch(migration, /insert into public\.material_catalog|update public\.material_catalog/i);
  assert.doesNotMatch(migration, /set\s+(?:overhead_percent|profit_markup_percent|discount_value|scope_notes|presentation_detail_level|presentation_ohp_mode)\s*=/i);
});

test("the UI action remains disabled in this server package", () => {
  assert.match(ui, /<button type="button" disabled/);
  assert.doesNotMatch(ui, /fence-materials|apply_reviewed_fence_materials|onClick/);
});
