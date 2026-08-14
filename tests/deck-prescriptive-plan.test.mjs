import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertPartialFramingEvidenceBinding, buildPrescriptiveDeckPlan, isCanonicalFramingEvidence, KNOXVILLE_2024_DECK_PROFILE, recommendedPrescriptiveDraft } from "../src/lib/deck-prescriptive-plan.ts";
import { buildDeckTakeoffPreview, COMPLETE_REBUILD_LINE_KEYS } from "../src/lib/deck-takeoff-v0.ts";

const verified = { ...recommendedPrescriptiveDraft("ledger", false, 14, 12), jurisdiction: "city_knoxville_verified", attachmentConfirmed: true, stairsConfirmed: true, ledgerSubstrate: "verified_band_rim", postHeightFeet: "8", footingDiameterInches: "24", footingThicknessInches: "8", footingDepthInches: "24", frostBasis: "City permit reviewer confirmed 24 in basis", hardwareBasis: "Complete quoted connector schedule: Manufacturer quote H1, all applicable connection groups" };

test("bounded 2024 evaluator checks spans, posts, footings and emits purchasable BOM", () => {
  const plan = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: verified });
  assert.equal(plan.status, "ready_for_human_review");
  assert.equal(plan.quantities.joists, 12);
  assert.ok(plan.checks.every((check) => check.result === "pass"));
  assert.match(plan.checks.map((x) => x.sourceId).join(" "), /R507\.6.*R507\.5.*R507\.4.*R507\.3\.1/);
  assert.deepEqual(plan.bom.slice(0, 4).map((line) => [line.key, line.quantity, line.unit]), [["joists",12,"ea"],["beam_plies",1,"ea"],["posts",3,"ea"],["footing_concrete",0.233,"cu yd"]]);
  assert.match(plan.bom[0].description, /2x10 × 12 ft/);
  assert.match(plan.bom[1].description, /2x12 × 14 ft beam plies/);
  assert.match(plan.bom[2].description, /6x6 × 8 ft posts/);
  assert.equal(isCanonicalFramingEvidence(plan), true);
  assert.equal(isCanonicalFramingEvidence({ ...plan, bom: [{ ...plan.bom[0], quantity: 999 }] }), false);
  assert.equal(isCanonicalFramingEvidence({ ...plan, quantities: { ...plan.quantities, posts: 99 } }), false);
  assert.equal(isCanonicalFramingEvidence({ ...plan, extra: true }), false);
  assert.equal(isCanonicalFramingEvidence({ ...plan, inputs: { ...plan.inputs, draft: { ...plan.inputs.draft, unexpected: "field" } } }), false);
  assert.equal(isCanonicalFramingEvidence({ ...plan, inputs: { ...plan.inputs, draft: { ...plan.inputs.draft, hardwareBasis: "x".repeat(161) } } }), false);
  assert.match(plan.bom.find((line) => line.key === "ledger").description, /2x8/);
  assert.match(plan.bom.find((line) => line.key === "footing_concrete").description, /pad-only.*pier\/stem concrete not included/i);
  assert.deepEqual(plan.bom.filter((line) => line.key.startsWith("rim_")).map((line) => line.quantity), [1]);
  assert.deepEqual(plan.hardwareSchedule.map((item) => [item.key, item.quantity]), [
    ["ledger_fasteners", 13], ["ledger_washers", 13], ["ledger_flashing", 14], ["wrb_counterflashing_integration", 14],
    ["joist_hangers", 12], ["hanger_fasteners", 0], ["joist_to_beam", 12], ["joist_to_beam_fasteners", 0], ["rim_to_joist_restraint", 36],
    ["post_bases", 3], ["post_base_anchors", 3], ["post_caps", 3], ["post_cap_fasteners", 0], ["lateral_load_connections", 2], ["lateral_load_fasteners", 0],
    ["picture_frame_blocking_connectors", 0], ["guard_system_connections", 0],
  ]);
  assert.ok(plan.hardwareSchedule.every((item) => ["compatible_product_and_price_required", "detail_required"].includes(item.selectionStatus)));
  assert.match(plan.hardwareSchedule.find((item) => item.key === "ledger_fasteners").sourceId, /Table-R507\.9\.1\.3/);
  assert.match(plan.hardwareSchedule.find((item) => item.key === "lateral_load_connections").specification, /1,500 lb.*within 24 in/i);
  assert.match(plan.hardwareSchedule.find((item) => item.key === "post_caps").sourceId, /R507\.5\.2/);
  assert.equal(plan.hardwareSchedule.some((item) => item.key === "beam_ply_fasteners"), false);
  const twoPly = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, beamSize: "2x8", beamPlies: "2" } });
  assert.equal(twoPly.hardwareSchedule.find((item) => item.key === "beam_ply_fasteners").quantity, 24);
});

test("every encoded IRC 2024 Table R507.5(1) 12-and-0 beam cell has an exact at/over boundary", () => {
  const cells = { "2x6": { "1": 4, "2": 71/12, "3": 89/12 }, "2x8": { "1": 61/12, "2": 91/12, "3": 114/12 }, "2x10": { "1": 6, "2": 9, "3": 134/12 }, "2x12": { "1": 85/12, "2": 127/12, "3": 159/12 } };
  for (const [size, plies] of Object.entries(cells)) for (const [ply, limit] of Object.entries(plies)) {
    const at = buildPrescriptiveDeckPlan({ lengthFeet: limit * 2, widthFeet: 12, draft: { ...verified, beamSize: size, beamPlies: ply, footingDiameterInches: "40", footingThicknessInches: "15" } });
    assert.equal(at.checks.find((check) => check.sourceId.includes("R507.5"))?.result, "pass", `${ply}-${size} at limit`);
    const over = buildPrescriptiveDeckPlan({ lengthFeet: limit * 2 + 0.02, widthFeet: 12, draft: { ...verified, beamSize: size, beamPlies: ply, footingDiameterInches: "40", footingThicknessInches: "15" } });
    assert.equal(over.checks.find((check) => check.sourceId.includes("R507.5"))?.result, "exception", `${ply}-${size} over limit`);
  }
});

test("4x4 post limits are enforced at and over each encoded tributary-area column", () => {
  const rows = [[20,14],[40,13+8/12],[60,11],[80,9+5/12],[100,8+4/12],[120,7+5/12],[140,6+9/12],[160,6+2/12]];
  for (const [area, height] of rows) {
    const length = area / 3; // 12-ft joist span × (length/2 post span) ÷ 2 = 3×length tributary area.
    const at = buildPrescriptiveDeckPlan({ lengthFeet: length, widthFeet: 12, draft: { ...verified, postCount: "3", postSize: "4x4", postHeightFeet: String(height), footingDiameterInches: "40", footingThicknessInches: "15" } });
    assert.equal(at.checks.find((check) => check.sourceId.includes("R507.4"))?.result, "pass", `post at ${area}`);
    const over = buildPrescriptiveDeckPlan({ lengthFeet: length, widthFeet: 12, draft: { ...verified, postCount: "3", postSize: "4x4", postHeightFeet: String(height + 0.01), footingDiameterInches: "40", footingThicknessInches: "15" } });
    assert.equal(over.checks.find((check) => check.sourceId.includes("R507.4"))?.result, "exception", `post over ${area}`);
  }
});

test("evaluator fails at rule boundaries and rejects unsupported assumptions", () => {
  const overJoist = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 14.1, draft: verified });
  assert.match(overJoist.exceptions.join(" "), /joist size\/spacing\/span/i);
  const overBeam = buildPrescriptiveDeckPlan({ lengthFeet: 19, widthFeet: 12, draft: verified });
  assert.match(overBeam.exceptions.join(" "), /beam check/i);
  const overPost = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, postSize: "4x4", postHeightFeet: "14" } });
  assert.match(overPost.exceptions.join(" "), /post size\/height/i);
  const underFooting = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, footingDiameterInches: "10" } });
  assert.match(underFooting.exceptions.join(" "), /footing diameter/i);
  const unknown = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, speciesGrade: "", ledgerSubstrate: "concrete_or_other", roofOrSpecialLoad: true } });
  assert.match(unknown.exceptions.join(" "), /band\/rim.*Southern Pine.*special loads/i);
  const freestanding = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, attachment: "freestanding", ledgerSubstrate: "unknown", beamLineCount: "2" } });
  assert.match(freestanding.exceptions.join(" "), /Freestanding support geometry is not supported/i);
  const stairs = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, stairsIncluded: "yes", stairStringerCount: "3", stairLandingFootingCount: "2" } });
  assert.equal(stairs.status, "ready_for_human_review");
  assert.deepEqual(stairs.unresolvedPackages, ["stairs", "guard_schedule", "connector_schedule"]);
  assert.equal(isCanonicalFramingEvidence(stairs), true);
  assert.equal(stairs.quantities.stairStringers, 0);
  assert.equal(stairs.bom.some((line) => /stair|stringer|connector_schedule_quote/.test(line.key)), false);
  assert.equal(stairs.hardwareSchedule.find((item) => item.key === "guard_stair_connections")?.selectionStatus, "detail_required");
  const noStairs = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: verified });
  assert.deepEqual(noStairs.unresolvedPackages, ["guard_schedule", "connector_schedule"]);
});

test("blueprint facts seed confirmations and UI renders real geometry markers", () => {
  const initial = recommendedPrescriptiveDraft("freestanding", false);
  assert.equal(initial.attachment, "freestanding"); assert.equal(initial.stairsIncluded, "no"); assert.equal(initial.attachmentConfirmed, false);
  const ui = readFileSync("src/components/estimates/deck-prescriptive-plan-generator.tsx", "utf8");
  const planner = readFileSync("src/components/estimates/deck-takeoff-planner.tsx", "utf8");
  const route = readFileSync("src/app/api/estimates/[estimateId]/deck-takeoff/route.ts", "utf8");
  assert.equal(KNOXVILLE_2024_DECK_PROFILE.id, "city-knoxville-2024-irc-r507-southern-pine-v2");
  for (const marker of ['data-plan-member="joist"','data-plan-member="beam"','data-plan-member="post"','data-plan-member="footing"','data-plan-member="stair-opening"']) assert.match(ui, new RegExp(marker));
  assert.match(ui, /Required framing source for a full rebuild/);
  assert.match(ui, /not stamped/i);
  assert.match(planner, /blueprintAttachment=.*railingGeometry\.attached/);
  assert.match(planner, /framingPlanEvidence: approvedPlan/);
  assert.match(planner, /generatedShapeChanged[\s\S]*framingPlanEvidence: generatedShapeChanged \? null/);
  assert.match(route, /isCanonicalFramingEvidence/);
  assert.match(route, /assertPartialFramingEvidenceBinding\(parsed\)/);
  assert.match(planner, /bounded profile generated and checked/i);
  assert.match(planner, /buildPlanConfirmed: false, framingPlanEvidence: approvedPlan/);
  assert.match(planner, /structural_connectors: ""/);
  assert.match(planner, /stairs: stairsIncluded \? "" : "not_in_scope"/);
  assert.match(ui, /Main deck framing ready/);
  assert.match(ui, /detail required/);
  assert.doesNotMatch(ui, /Complete quoted connector schedule:/);
  assert.match(ui, /Hardware requirements — products and prices still required/);
  assert.match(planner, /Price compatible hardware/);
});

test("exact partial stairs payload passes route binding while tampering and false completion reject", () => {
  const evidence = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: { ...verified, stairsIncluded: "yes" } });
  assert.equal(evidence.status, "ready_for_human_review");
  const groups = { ledger_attachment: ["ledger"], joists: ["joists"], beams: ["beam_plies"], posts: ["posts"], footings: ["footing_concrete"], blocking: ["rim_long", "extra_blocking"] };
  const lines = Object.entries(groups).map(([key, keys]) => {
    const members = evidence.bom.filter((item) => keys.includes(item.key));
    return { key, description: members.map((item) => item.description).join("; "), quantity: String(members.reduce((sum, item) => sum + item.quantity, 0)), unit: members[0].unit };
  });
  const hardwareSelections = evidence.hardwareSchedule.map((item) => ({ key: item.key, description: item.specification, quantity: item.quantity > 0 ? String(item.quantity) : "", unit: item.unit, verificationReference: "" }));
  const payload = { buildPlanReference: evidence.reference, buildPlanConfirmed: false, framingPlanEvidence: evidence, additionalLines: lines, hardwareSelections };
  assert.doesNotThrow(() => assertPartialFramingEvidenceBinding(payload));
  assert.throws(() => assertPartialFramingEvidenceBinding({ ...payload, buildPlanConfirmed: true }), /cannot confirm a complete build plan/);
  assert.throws(() => assertPartialFramingEvidenceBinding({ ...payload, buildPlanReference: "changed" }), /binding is invalid/);
  assert.throws(() => assertPartialFramingEvidenceBinding({ ...payload, additionalLines: lines.map((line) => line.key === "joists" ? { ...line, quantity: "999" } : line) }), /does not match/);
  assert.throws(() => assertPartialFramingEvidenceBinding({ ...payload, hardwareSelections: hardwareSelections.slice(1) }), /does not match/);
});

test("canonical hardware quantities cannot be under-ordered while detail-required rows remain unresolved", () => {
  const evidence = buildPrescriptiveDeckPlan({ lengthFeet: 14, widthFeet: 12, draft: verified });
  const groups = { ledger_attachment: ["ledger"], joists: ["joists"], beams: ["beam_plies"], posts: ["posts"], footings: ["footing_concrete"], blocking: ["rim_long", "extra_blocking"] };
  const generated = Object.entries(groups).map(([key, keys]) => { const members = evidence.bom.filter((item) => keys.includes(item.key)); return { key, category: "material", description: members.map((item) => item.description).join("; "), quantity: String(members.reduce((sum, item) => sum + item.quantity, 0)), unit: members[0].unit, unitCost: "10", catalogMaterialId: null, sourceReference: "Reviewed price source" }; });
  const additionalLines = COMPLETE_REBUILD_LINE_KEYS.map((key) => generated.find((line) => line.key === key) ?? ({ key, category: key === "labor" ? "labor" : "material", description: key, quantity: key === "structural_connectors" ? "" : "1", unit: key === "structural_connectors" ? "" : "ea", unitCost: key === "structural_connectors" ? "" : "10", catalogMaterialId: null, sourceReference: key === "structural_connectors" ? "" : "Reviewed price source" }));
  const hardwareSelections = evidence.hardwareSchedule.map((item) => ({ key: item.key, description: item.specification, quantity: String(item.quantity || 1), unit: item.unit, unitCost: "1", catalogMaterialId: null, sourceReference: "Manufacturer product page", verificationReference: "Reviewed model, coating, substrate, and installation schedule" }));
  const plan = { takeoffScope: "complete_rebuild", completeRebuildConfirmed: true, buildPlanReference: evidence.reference, buildPlanConfirmed: false, framingPlanEvidence: evidence, hardwareSelections, scopeDecisions: Object.fromEntries(COMPLETE_REBUILD_LINE_KEYS.map((key) => [key, key === "stairs" || key === "delivery" || key === "equipment" ? "not_in_scope" : "include"])), boardRunDirection: "along_length", stairEdge: "yard", stairPosition: "center", stairPlacementConfirmed: true, boardActualWidthInches: "5.5", boardGapInches: "0.125", boardStockLengthFeet: "14", boardWastePercent: "10", boardCatalogMaterialId: null, boardUnitCost: "10", boardSourceReference: "Board product page", screwCoverageSquareFeetPerPack: "100", screwCatalogMaterialId: null, screwPackUnitCost: "20", screwSourceReference: "Fastener manufacturer coverage and product page", railingSectionLengthFeet: "6", railingCatalogMaterialId: null, railingUnitCost: "100", railingSourceReference: "Railing product page", additionalLines };
  const items = [{ itemKey: "full_deck_yard", observation: { measurements: { length: { value: "14", unit: "ft" }, width: { value: "12", unit: "ft" } } } }, { itemKey: "house_ledger", observation: { conditionStatus: "applies" } }, { itemKey: "stairs_landings", observation: { conditionStatus: "not_applicable" } }, { itemKey: "guards_railings", observation: { conditionStatus: "applies" } }];
  const exact = buildDeckTakeoffPreview({ items, plan, catalog: new Map() });
  assert.equal(exact.unresolved.some((message) => /rim to joist restraint needs/.test(message)), false);
  assert.equal(evidence.hardwareSchedule.find((item) => item.key === "rim_to_joist_restraint").quantity, 36);
  const under = buildDeckTakeoffPreview({ items, catalog: new Map(), plan: { ...plan, hardwareSelections: hardwareSelections.map((item) => item.key === "rim_to_joist_restraint" ? { ...item, quantity: "35" } : item) } });
  assert.ok(under.unresolved.some((message) => /rim to joist restraint.*at least 36/.test(message)));
  const over = buildDeckTakeoffPreview({ items, catalog: new Map(), plan: { ...plan, hardwareSelections: hardwareSelections.map((item) => item.key === "rim_to_joist_restraint" ? { ...item, quantity: "40" } : item) } });
  assert.equal(over.unresolved.some((message) => /rim to joist restraint needs/.test(message)), false);
  const missingDetail = buildDeckTakeoffPreview({ items, catalog: new Map(), plan: { ...plan, hardwareSelections: hardwareSelections.map((item) => item.key === "hanger_fasteners" ? { ...item, quantity: "" } : item) } });
  assert.ok(missingDetail.unresolved.some((message) => /hanger fasteners needs/.test(message)));
});
