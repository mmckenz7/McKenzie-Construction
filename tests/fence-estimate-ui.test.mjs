import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/estimates/fence-estimate-workflow.tsx", "utf8");
const editor = readFileSync("src/components/estimates/fence-layout-editor.tsx", "utf8");
const questions = readFileSync("src/components/estimates/fence-context-questions.tsx", "utf8");
const materials = readFileSync("src/components/estimates/fence-material-verification.tsx", "utf8");
const pricedPreview = readFileSync("src/components/estimates/fence-priced-preview.tsx", "utf8");
const estimateReview = readFileSync("src/components/estimates/fence-estimate-review.tsx", "utf8");
const applicationDesign = readFileSync("src/lib/fence-estimate-application.ts", "utf8");
const questionProjection = readFileSync("src/lib/fence-context-questions.ts", "utf8");
const builder = readFileSync("src/components/estimates/estimate-builder.tsx", "utf8");
const page = readFileSync("src/app/sales/estimates/[estimateId]/page.tsx", "utf8");
const route = readFileSync("src/app/api/estimates/[estimateId]/fence-draft/route.ts", "utf8");

test("Fence mode is hidden by default and enabled only by the explicit local query", () => {
  assert.match(page, /searchParams: Promise<Record<string, string \| string\[\] \| undefined>>/);
  assert.match(page, /showFenceWorkflow=\{query\.workflow === "fence"\}/);
  assert.match(builder, /showFenceWorkflow = false/);
  assert.match(builder, /const fenceWorkflow = showFenceWorkflow/);
  assert.match(builder, /\{fenceWorkflow \? <FenceEstimateWorkflow/);
  assert.match(builder, /returnHref=\{`\/sales\/estimates\/\$\{encodeURIComponent\(estimateId\)\}`\}/);
  assert.match(builder, /estimate: state\.estimate/);
  assert.match(builder, /editable: canMutate/);
  assert.match(builder, /fenceDataState: "ready"/);
});

test("the fence card keeps the local editor inside the projected current step", () => {
  for (const copy of [
    "Fence estimate",
    "One step at a time",
    "Versioned Fence draft",
    "Exit Fence view",
    "Manufacturer guide controls",
  ]) assert.match(component, new RegExp(copy));
  assert.match(component, /step\.expanded \?/);
  assert.match(component, /aria-current=\{step\.expanded \? "step"/);
  assert.match(component, /<FenceLayoutEditor/);
  assert.match(component, /workflow={workflow}/);
  assert.match(component, /estimateId=\{estimateId\}/);
  assert.match(component, /editable=\{editable\}/);
  assert.match(component, /propertyAddress: workflow\.propertyAddressKnown \? workflow\.propertyAddress : undefined/);
  assert.match(component, /status: workflow\.estimateStatus/);
  assert.doesNotMatch(component, /fetch\(|Mission Control/);
});

test("Step 2 delegates typed answer persistence without adding direct API or unrelated coupling", () => {
  const stepTwo = `${questions}\n${questionProjection}`;
  assert.doesNotMatch(stepTwo, /fetch\(|localStorage|sessionStorage|api\/|metadata|unitCost|priceAmount|material_catalog/);
  assert.doesNotMatch(stepTwo, /saveFenceDraft|loadFenceDraft|mission.control/i);
  assert.match(questions, /onSave\(\{ \.\.\.answers, \[key\]: value \}\)/);
  assert.match(questions, /Start answers over/);
  assert.match(questions, /onClick=\{\(\) => void onSave\(\{\}\)\}/);
  assert.match(questions, /disabled=\{pending\}/);
});

test("Fence persistence stays independent from estimate calculation, pricing, and Mission Control", () => {
  assert.match(editor, /loadFenceDraft\(fetch, estimateId\)/);
  assert.match(editor, /saveFenceDraft\(fetch, estimateId, revision, payload\)/);
  assert.match(editor, /Saved revision/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|unitCost|priceAmount|material_catalog/);
  assert.doesNotMatch(route, /calculation_revision.*\+|material_catalog|Mission Control/i);
});

test("the editor is a bounded connected-run draft and hands a ready draft to Step 2", () => {
  for (const copy of [
    "Draw connected fence runs",
    "ordinary corners; no corner products are inferred",
    "Shape is illustrative; typed lengths control",
    "Add connected run",
    "Remove last run",
  ]) assert.match(editor, new RegExp(copy));
  assert.match(editor, /runs\.length >= FENCE_DRAFT_MAX_RUNS/);
  assert.match(editor, /<FenceContextQuestions/);
  assert.match(editor, /needsGate=\{needsGate\}/);
  assert.match(editor, /revision > 0 && !dirty/);
  assert.doesNotMatch(editor, /openingId|gateAssemblyVersionId|unitCost|priceAmount|material_catalog|mapbox|supabase/i);
});

test("the hydrated editor advances one current step from questions to material verification", () => {
  assert.match(editor, /contextProjection\.status === "job_context_complete"/);
  assert.match(editor, /\? "verify_materials"/);
  assert.match(editor, /const expanded = step\.key === currentStep/);
  assert.match(editor, /aria-current=\{expanded \? "step" : undefined\}/);
  assert.match(editor, /step\.key === "verify_materials" && takeoff/);
  assert.match(editor, /<FenceMaterialVerification takeoff=\{takeoff\}/);
  assert.match(editor, /Continue to Verify materials/);
});

test("Step 3 shows manufacturer quantities and trace, or a blocker with no issuable quantities", () => {
  for (const copy of [
    "Verify manufacturer materials",
    "Panels",
    "End posts",
    "Line posts",
    "Corner posts",
    "Post caps",
    "How each run was counted",
    "Why this takeoff stops",
    "Field-verify the run",
    "No issuable material quantities are available",
  ]) assert.match(materials, new RegExp(copy, "i"));
  assert.match(materials, /takeoff\.status === "manual_review"/);
  assert.doesNotMatch(materials, /calculateEmblemFoundationTestFixture|concreteBagCount|gravelBagCount/);
  assert.doesNotMatch(materials, /unitCost|priceAmount|material_catalog|saveFenceDraft|fetch\(/i);
});

test("material verification requires an ephemeral confirmation before Step 4", () => {
  assert.match(editor, /const \[materialsConfirmed, setMaterialsConfirmed\] = useState\(false\)/);
  assert.match(editor, /!materialsConfirmed[\s\S]*\? "verify_materials"[\s\S]*: pricesConfirmed \? "review_estimate" : "apply_lowes_prices"/);
  assert.match(editor, /Materials look correct/);
  assert.match(editor, /lasts only for this browser session/);
  assert.match(editor, /It is not saved and does not change the estimate/);
  assert.match(editor, /setMaterialsConfirmed\(true\); setPricesConfirmed\(false\); setRequestedStep\(null\)/);
  assert.match(editor, /applyStoredDraft[\s\S]*setMaterialsConfirmed\(false\)/);
  assert.match(editor, /updateRun[\s\S]*setMaterialsConfirmed\(false\)/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage/);
});

test("Step 4 builds the accepted read-only projection only after material confirmation", () => {
  assert.match(editor, /materialsConfirmed && takeoff/);
  assert.match(editor, /projectFenceEmblemRetailPreview\(\{/);
  assert.match(editor, /evidence: buildFenceEmblemLowesEvidenceManifest\(\)/);
  assert.match(editor, /<FencePricedPreview preview=\{pricedPreview\}/);
  for (const copy of [
    "Step 4 · Read only",
    "Lowe&apos;s public retail preview",
    "Lowe&apos;s identity",
    "Unit retail",
    "Subtotal",
    "Material total",
    "Tax unknown",
    "Availability not guaranteed",
    "Product source",
    "Store source",
  ]) assert.match(pricedPreview, new RegExp(copy, "i"));
  assert.match(pricedPreview, /preview\.storeName.*preview\.storeNumber/);
  assert.match(pricedPreview, /preview\.observedAt/);
  assert.match(editor, /step\.key === "apply_lowes_prices"/);
  assert.doesNotMatch(`${editor}\n${pricedPreview}`, /applyEstimate|savePrice|publishPrice|material_catalog|catalog publication/i);
  assert.doesNotMatch(pricedPreview, /fetch\(|saveFenceDraft|loadFenceDraft/);
});

test("price confirmation is ephemeral and advances to a non-mutating Step 5 review", () => {
  assert.match(editor, /const \[pricesConfirmed, setPricesConfirmed\] = useState\(false\)/);
  assert.match(editor, /Prices look correct/);
  assert.match(editor, /setPricesConfirmed\(true\); setRequestedStep\(null\)/);
  assert.match(editor, /pricesConfirmed \? "review_estimate" : "apply_lowes_prices"/);
  assert.match(editor, /applyStoredDraft[\s\S]*setPricesConfirmed\(false\)/);
  assert.match(editor, /updateRun[\s\S]*setPricesConfirmed\(false\)/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage/);

  for (const copy of [
    "Step 5 · Review only",
    "Review Fence estimate preview",
    "No estimate has been changed",
    "Drawing",
    "Materials",
    "Retail preview",
    "Material authority",
    "Price authority",
    "availability not guaranteed",
    "tax unknown",
    "Add these materials to the estimate",
    "Set the job price",
    "OH&amp;P appears",
    "choose built in or a separate line",
    "Add materials — coming next",
  ]) assert.match(estimateReview, new RegExp(copy, "i"));
  assert.match(estimateReview, /applicationPlan\.lineCount\} material lines · \$\{applicationPlan\.materialTotalAmount\} Lowe&apos;s cost before tax/);
  assert.match(estimateReview, /<button type="button" disabled/);
  assert.match(estimateReview, /buildFenceEstimateApplicationPlan/);
  assert.doesNotMatch(estimateReview, /previewBinding|Application design token|Markup\/customer-price policy|Reapply behavior/);
  assert.doesNotMatch(estimateReview, /onClick|fetch\(|saveFenceDraft|applyEstimate|mutation\(/i);
  assert.doesNotMatch(`${estimateReview}\n${applicationDesign}`, /\/api\/|supabase|rpc\(|fetch\(|estimate_line_items/i);
});

test("the Fence API requires estimate authorization and an independent optimistic revision", () => {
  assert.match(route, /authorizeEstimateRequest\(request, estimateId\)/);
  assert.match(route, /canEditPrices/);
  assert.match(route, /expectedRevision/);
  assert.match(route, /save_fence_estimate_draft/);
  assert.match(route, /stale_fence_revision/);
  assert.match(route, /cache-control.*private, no-store/);
});

test("Step 2 asks progressive job questions and labels the working foundation fixture as test-only", () => {
  for (const copy of [
    "Answer only what the job must tell us",
    "Questions appear one at a time",
    "Manufacturer facts already resolved",
    "Company rules still needed",
    "Each answer is saved with the Fence revision",
  ]) assert.match(questions, new RegExp(copy, "i"));
  assert.match(questionProjection, /Test only: the 36 in foundation example/);
  assert.match(questionProjection, /not customer-authoritative job guidance/);
  assert.doesNotMatch(`${questions}\n${questionProjection}`, /\$\d|unit_price|priceAmount|material_catalog/);
});
