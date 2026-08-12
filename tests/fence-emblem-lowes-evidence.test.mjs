import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFenceEmblemLowesEvidence,
  buildFenceEmblemLowesEvidenceManifest,
  FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS,
  FENCE_EMBLEM_LOWES_OBSERVED_AT,
  FENCE_EMBLEM_LOWES_STORE,
} from "../src/lib/fence-emblem-lowes-evidence.ts";

test("the bounded evidence set covers only the supported gate-free Emblem takeoff", () => {
  assert.deepEqual(
    FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS.map((item) => [
      item.demandKey,
      item.itemNumber,
      item.modelNumber,
      item.priceAmount,
    ]),
    [
      ["emblem_panel_6x8_white", "667016", "73014714", "149.79"],
      ["emblem_post_line_5x5x108_white", "1944652", "73045783", "41.54"],
      ["emblem_post_corner_5x5x108_white", "1944653", "73045784", "41.54"],
      ["emblem_post_end_5x5x108_white", "1944654", "73045785", "41.54"],
      ["vinyl_post_cap_5x5_white_pyramid", "385320", "73003093", "4.37"],
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS),
    /gate|insert|adhesive|cement|concrete|gravel|foundation/i,
  );
});

test("evidence preserves the authoritative South Knoxville store and exact observation time", () => {
  assert.deepEqual(FENCE_EMBLEM_LOWES_STORE, {
    supplierName: "Lowe's",
    supplierSlug: "lowes",
    storeNumber: "2239",
    name: "S. Knoxville Lowe's",
    addressLine1: "7520 Mountain Grove Drive",
    city: "Knoxville",
    state: "TN",
    postalCode: "37920",
    sourceReference: "https://www.lowes.com/store/TN-Knoxville/2239",
  });
  assert.equal(FENCE_EMBLEM_LOWES_OBSERVED_AT, "2026-08-12T17:53:29Z");

  for (const item of FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS) {
    const evidence = buildFenceEmblemLowesEvidence(item);
    assert.equal(evidence.observedAt, "2026-08-12T17:53:29Z");
    assert.equal(evidence.availabilityStatus, "unknown");
    assert.equal(evidence.taxIncluded, null);
    assert.equal(evidence.storeNumber, "2239");
    assert.equal(evidence.currencyCode, "USD");
    assert.equal(evidence.priceType, "retail");
    assert.match(evidence.priceAmount, /^\d+\.\d{2}$/);
    assert.match(evidence.rawRecordSha256, /^[0-9a-f]{64}$/);
    assert.match(evidence.identitySourceReference, /^https:\/\/www\.lowes\.com\/pd\//);
    assert.equal(evidence.priceSourceReference, evidence.identitySourceReference);
  }
});

test("raw availability display is retained without converting it into inventory", () => {
  const evidence = FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS.map(buildFenceEmblemLowesEvidence);
  for (const row of evidence.slice(0, 4)) {
    assert.equal(row.availabilityDisplayText, "5,000+ Available");
    assert.equal(row.availabilityDisplayInterpretation, "display_only_not_inventory_quantity");
    assert.equal(row.availabilityStatus, "unknown");
    assert.equal("availabilityQuantity" in row, false);
  }
  assert.equal(evidence[4].availabilityDisplayText, null);
  assert.equal(evidence[4].availabilityDisplayInterpretation, "not_captured");
  assert.equal(evidence[4].availabilityStatus, "unknown");
});

test("the evidence manifest is deterministic and explicitly cannot publish", () => {
  const first = buildFenceEmblemLowesEvidenceManifest();
  const second = buildFenceEmblemLowesEvidenceManifest();
  assert.deepEqual(first, second);
  assert.match(first.manifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.manifest.scope, "evidence_only_not_approved_for_publication");
  assert.equal(first.manifest.rows.length, 5);
  assert.equal(Object.isFrozen(first.manifest.rows), true);
  assert.equal(Object.isFrozen(first.manifest.rows[0]?.evidence), true);
});

test("arbitrary evidence URLs and non-decimal prices fail closed", () => {
  const base = FENCE_EMBLEM_LOWES_EVIDENCE_ITEMS[0];
  assert.throws(() => buildFenceEmblemLowesEvidence({
    ...base,
    identitySourceReference: "https://example.com/product/667016",
  }), /invalid lowe's evidence url/i);
  assert.throws(() => buildFenceEmblemLowesEvidence({
    ...base,
    priceSourceReference: "https://www.lowes.com/search?searchTerm=667016",
  }), /invalid lowe's evidence url/i);
  assert.throws(() => buildFenceEmblemLowesEvidence({
    ...base,
    priceAmount: "149.790",
  }), /invalid exact retail price/i);
});
