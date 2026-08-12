import assert from "node:assert/strict";
import test from "node:test";

import { buildFenceEstimateApplicationPlan } from "../src/lib/fence-estimate-application.ts";
import { buildFenceEmblemLowesEvidenceManifest } from "../src/lib/fence-emblem-lowes-evidence.ts";
import { projectFenceEmblemRetailPreview } from "../src/lib/fence-emblem-priced-preview.ts";
import { projectEmblemManufacturerTakeoff } from "../src/lib/fence-emblem-takeoff.ts";

function reviewedPlan(fenceRevision = 7) {
  const takeoff = projectEmblemManufacturerTakeoff({
    runLengthsInches: ["198"],
    needsGate: false,
    answers: {
      system: "emblem_6x8_white",
      measurementBasis: "post_centers",
      terrain: "level",
      frostDepthInches: "12",
      conditions: "none",
    },
  });
  const pricedPreview = projectFenceEmblemRetailPreview({
    takeoff,
    evidence: buildFenceEmblemLowesEvidenceManifest(),
  });
  assert.equal(takeoff.status, "ready");
  assert.equal(pricedPreview.status, "ready");
  return buildFenceEstimateApplicationPlan({
    fenceRevision,
    takeoff: takeoff.manufacturerTakeoff,
    pricedPreview,
  });
}

test("application design is deterministic and preserves every reviewed line's provenance", () => {
  const first = reviewedPlan();
  const second = reviewedPlan();
  assert.deepEqual(first, second);
  assert.equal(first.lineCount, 4);
  assert.equal(first.materialTotalAmount, "437.31");
  assert.equal(first.taxIncluded, null);
  assert.equal(first.previewOnly, true);
  assert.equal(first.takeoffAuthority, "source_derived_working_test_rule");
  assert.equal(first.priceAuthority, "retail_evidence_preview");
  assert.equal(first.evidenceVersion, "lowes-south-knoxville-emblem-public-retail-v0");
  assert.equal(first.storeNumber, "2239");
  assert.equal(first.observedAt, "2026-08-12T17:53:29Z");
  assert.match(first.storeSourceReference, /^https:\/\/www\.lowes\.com\/store\//);
  assert.ok(first.disclosures.some((value) => /tax/i.test(value)));
  assert.ok(first.disclosures.some((value) => /availability/i.test(value)));
  assert.match(first.previewBinding, /fenceRevision=7/);
  assert.match(first.previewBinding, /manifest=da75d9faf8314eb810e2e33479ccfa271efd1e31b96a6340e07665ac139d0a33/);
  for (const line of first.lines) {
    assert.equal(line.itemType, "standard");
    assert.equal(line.laborUnitCost, "0");
    assert.equal(line.subcontractorUnitCost, "0");
    assert.equal(line.equipmentUnitCost, "0");
    assert.equal(line.otherDirectUnitCost, "0");
    assert.equal(line.materialWastePercent, "0");
    assert.equal(line.itemMarkupPercent, "0");
    assert.equal(line.taxable, false);
    assert.equal(line.included, true);
    assert.equal(line.fixedCustomerPrice, null);
    assert.equal(line.internalDescription, `Lowe's item ${line.itemNumber} · model ${line.modelNumber}`);
    assert.match(line.itemNumber, /^\d+$/);
    assert.match(line.modelNumber, /^\d+$/);
    assert.match(line.identitySourceReference, /^https:\/\/www\.lowes\.com\/pd\//);
    assert.match(line.priceSourceReference, /^https:\/\/www\.lowes\.com\/pd\//);
    assert.equal(line.availabilityStatus, "unknown");
    assert.doesNotMatch(line.internalDescription, /Fence Engine|manifest|observed|source https/i);
  }
});

test("a different saved Fence revision produces a different preview binding", () => {
  assert.notEqual(reviewedPlan(7).previewBinding, reviewedPlan(8).previewBinding);
});

test("application design rejects an unsaved Fence revision", () => {
  assert.throws(() => reviewedPlan(0), /saved positive Fence revision/i);
});
