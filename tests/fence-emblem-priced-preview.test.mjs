import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildFenceEmblemLowesEvidenceManifest } from "../src/lib/fence-emblem-lowes-evidence.ts";
import { projectEmblemManufacturerTakeoff } from "../src/lib/fence-emblem-takeoff.ts";
import { projectFenceEmblemRetailPreview } from "../src/lib/fence-emblem-priced-preview.ts";

const answers = Object.freeze({
  system: "emblem_6x8_white",
  measurementBasis: "post_centers",
  terrain: "level",
  corners: "exact_90",
  frostDepthInches: "36",
  conditions: "none",
});

function price(runLengthsInches) {
  const takeoff = projectEmblemManufacturerTakeoff({
    runLengthsInches,
    needsGate: false,
    answers,
  });
  return projectFenceEmblemRetailPreview({
    takeoff,
    evidence: buildFenceEmblemLowesEvidenceManifest(),
  });
}

test("99-inch golden takeoff prices exact panel, end posts, and caps", () => {
  const result = price(["99"]);
  assert.equal(result.status, "ready");
  assert.equal(result.materialTotalCents, "24161");
  assert.equal(result.materialTotalAmount, "241.61");
  assert.deepEqual(result.lines.map(({ demandKey, quantity, unitPriceCents, subtotalCents }) =>
    [demandKey, quantity, unitPriceCents, subtotalCents]), [
    ["emblem_panel_6x8_white", 1, "14979", "14979"],
    ["emblem_post_end_5x5x108_white", 2, "4154", "8308"],
    ["vinyl_post_cap_5x5_white_pyramid", 2, "437", "874"],
  ]);
});

test("198-inch golden takeoff adds exactly one line post", () => {
  const result = price(["198"]);
  assert.equal(result.status, "ready");
  assert.equal(result.materialTotalCents, "43731");
  assert.deepEqual(result.lines.map(({ demandKey, quantity, subtotalCents }) =>
    [demandKey, quantity, subtotalCents]), [
    ["emblem_panel_6x8_white", 2, "29958"],
    ["emblem_post_line_5x5x108_white", 1, "4154"],
    ["emblem_post_end_5x5x108_white", 2, "8308"],
    ["vinyl_post_cap_5x5_white_pyramid", 3, "1311"],
  ]);
});

test("two-run 90-degree L prices one corner instead of one line post", () => {
  const result = price(["99", "99"]);
  assert.equal(result.status, "ready");
  assert.equal(result.materialTotalAmount, "437.31");
  assert.deepEqual(result.lines.map(({ demandKey, quantity }) => [demandKey, quantity]), [
    ["emblem_panel_6x8_white", 2],
    ["emblem_post_corner_5x5x108_white", 1],
    ["emblem_post_end_5x5x108_white", 2],
    ["vinyl_post_cap_5x5_white_pyramid", 3],
  ]);
});

test("preview exposes provenance and conservative retail disclosures", () => {
  const result = price(["99"]);
  assert.equal(result.status, "ready");
  assert.deepEqual({
    authority: result.authority,
    supplier: result.supplierName,
    store: result.storeName,
    storeNumber: result.storeNumber,
    zip: result.storePostalCode,
    observedAt: result.observedAt,
    currency: result.currencyCode,
    taxIncluded: result.taxIncluded,
  }, {
    authority: "retail_evidence_preview",
    supplier: "Lowe's",
    store: "S. Knoxville Lowe's",
    storeNumber: "2239",
    zip: "37920",
    observedAt: "2026-08-12T17:53:29Z",
    currency: "USD",
    taxIncluded: null,
  });
  assert.match(result.disclosures.join(" "), /retail evidence only/i);
  assert.match(result.disclosures.join(" "), /tax is excluded and remains unknown/i);
  assert.match(result.disclosures.join(" "), /availability is not guaranteed/i);
  assert.match(result.disclosures.join(" "), /does not mutate the estimate/i);
});

test("manual-review takeoffs never expose a price preview", () => {
  const cutTakeoff = projectEmblemManufacturerTakeoff({
    runLengthsInches: ["250"],
    needsGate: false,
    answers,
  });
  const result = projectFenceEmblemRetailPreview({
    takeoff: cutTakeoff,
    evidence: buildFenceEmblemLowesEvidenceManifest(),
  });
  assert.deepEqual(result, {
    status: "manual_review",
    issueCode: "TAKEOFF_NOT_READY",
    issue: "A manual-review takeoff cannot receive an automatic price preview.",
  });
  assert.equal("materialTotalAmount" in result, false);
});

test("stale, missing, duplicate, tampered, or unsupported input fails closed", () => {
  const takeoff = projectEmblemManufacturerTakeoff({
    runLengthsInches: ["99"],
    needsGate: false,
    answers,
  });
  const accepted = buildFenceEmblemLowesEvidenceManifest();
  const cases = [
    [{ ...accepted, manifest: { ...accepted.manifest, version: "old" } }, "EVIDENCE_SCHEMA_NOT_CURRENT"],
    [{ ...accepted, manifest: { ...accepted.manifest, rows: accepted.manifest.rows.slice(0, 4) } }, "EVIDENCE_INTEGRITY_ERROR"],
    [{ ...accepted, manifest: { ...accepted.manifest, rows: [accepted.manifest.rows[0], ...accepted.manifest.rows.slice(0, 4)] } }, "EVIDENCE_INTEGRITY_ERROR"],
    [{ ...accepted, manifest: { ...accepted.manifest, rows: accepted.manifest.rows.map((row, index) =>
      index === 0 ? { ...row, evidence: { ...row.evidence, priceAmount: "1.00" } } : row) } }, "EVIDENCE_INTEGRITY_ERROR"],
  ];
  for (const [evidence, issueCode] of cases) {
    const result = projectFenceEmblemRetailPreview({ takeoff, evidence });
    assert.equal(result.status, "manual_review");
    assert.equal(result.issueCode, issueCode);
    assert.equal("lines" in result, false);
  }

  const invalidQuantity = {
    status: "ready",
    manufacturerTakeoff: { ...takeoff.manufacturerTakeoff, panelCount: 10_001 },
  };
  const result = projectFenceEmblemRetailPreview({ takeoff: invalidQuantity, evidence: accepted });
  assert.equal(result.status, "manual_review");
  assert.equal(result.issueCode, "UNSUPPORTED_QUANTITY");
});

test("client-bound evidence and preview modules contain no server-only dependency", () => {
  for (const path of [
    "src/lib/fence-emblem-lowes-evidence.ts",
    "src/lib/fence-emblem-priced-preview.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /from\s+["']node:|import\s+["']server-only["']/);
  }
});
