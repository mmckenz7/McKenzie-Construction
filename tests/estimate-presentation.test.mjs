import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.match(/\.[a-z]+$/i)) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const {
  ESTIMATE_PRESENTATION_VERSION,
  buildCustomerPresentation,
  buildLumpSumPresentationRow,
  snapshotEstimatePresentation,
} = await import("../src/lib/estimate-presentation.ts");

test("deck presentation snapshots one editable public lump-sum line", () => {
  const snapshot = snapshotEstimatePresentation({
    id: "deck-lump-sum",
    name: "Deck – Lump Sum",
    detailLevel: "lump_sum",
    lumpSumLabel: "Construct deck according to the described scope",
    showQuantities: false,
    showUnitPrices: false,
    showSectionSubtotals: false,
    ohpPresentationMode: "distributed",
  }, "Build the deck described in this proposal");

  assert.deepEqual(snapshot, {
    version: ESTIMATE_PRESENTATION_VERSION,
    id: "deck-lump-sum",
    name: "Deck – Lump Sum",
    detailLevel: "lump_sum",
    lumpSumLabel: "Build the deck described in this proposal",
    showQuantities: false,
    showUnitPrices: false,
    showSectionSubtotals: false,
    ohpPresentationMode: "distributed",
  });
  assert.equal(Object.isFrozen(snapshot), true);
});

test("supports section-summary and detailed itemized templates", () => {
  const section = snapshotEstimatePresentation({
    id: "section-summary",
    name: "Section Summary",
    detailLevel: "section_summary",
    lumpSumLabel: null,
    showQuantities: false,
    showUnitPrices: false,
    showSectionSubtotals: true,
    ohpPresentationMode: "separate_line_item",
  });
  const itemized = snapshotEstimatePresentation({
    id: "detailed-itemized",
    name: "Detailed Itemized",
    detailLevel: "itemized",
    lumpSumLabel: null,
    showQuantities: true,
    showUnitPrices: true,
    showSectionSubtotals: true,
    ohpPresentationMode: "distributed",
  });
  assert.equal(section.detailLevel, "section_summary");
  assert.equal(itemized.showUnitPrices, true);
});

test("presentation modes fail closed instead of leaking unintended detail", () => {
  const lump = {
    id: "deck",
    name: "Deck",
    detailLevel: "lump_sum",
    lumpSumLabel: "Deck scope",
    showQuantities: false,
    showUnitPrices: false,
    showSectionSubtotals: false,
    ohpPresentationMode: "distributed",
  };
  assert.throws(
    () => snapshotEstimatePresentation({ ...lump, showUnitPrices: true }),
    /cannot expose/,
  );
  assert.throws(
    () => snapshotEstimatePresentation({ ...lump, lumpSumLabel: " " }),
    /lumpSumLabel is required/,
  );
  assert.throws(
    () => snapshotEstimatePresentation({ ...lump, id: "Deck Public" }),
    /stable lowercase key/,
  );
  assert.throws(
    () => snapshotEstimatePresentation({ ...lump, detailLevel: "itemized" }, "Override"),
    /requires a lump-sum template/,
  );
});

test("section summaries cannot accidentally expose item detail", () => {
  const section = {
    id: "section-summary",
    name: "Section Summary",
    detailLevel: "section_summary",
    lumpSumLabel: null,
    showQuantities: false,
    showUnitPrices: false,
    showSectionSubtotals: true,
    ohpPresentationMode: "separate_line_item",
  };
  assert.throws(
    () => snapshotEstimatePresentation({ ...section, showQuantities: true }),
    /without item quantities/,
  );
  assert.throws(
    () => snapshotEstimatePresentation({ ...section, showSectionSubtotals: false }),
    /show section subtotals/,
  );
});

test("lump-sum customer rows contain only the description and total", () => {
  const snapshot = snapshotEstimatePresentation({
    id: "deck-lump-sum",
    name: "Deck – Lump Sum",
    detailLevel: "lump_sum",
    lumpSumLabel: "Build the deck described in this proposal",
    showQuantities: false,
    showUnitPrices: false,
    showSectionSubtotals: false,
    ohpPresentationMode: "distributed",
  });
  const row = buildLumpSumPresentationRow(snapshot, "1250000");
  assert.deepEqual(row, {
    description: "Build the deck described in this proposal",
    totalCents: "1250000",
  });
  assert.equal("quantity" in row, false);
  assert.equal("unit" in row, false);
  assert.equal("unitPrice" in row, false);
});

test("distributed itemized pricing buries OH&P and reconciles to the customer total", () => {
  const snapshot = snapshotEstimatePresentation({ id: "itemized", name: "Itemized", detailLevel: "itemized", lumpSumLabel: null, showQuantities: true, showUnitPrices: true, showSectionSubtotals: true, ohpPresentationMode: "distributed" });
  const presentation = buildCustomerPresentation(snapshot, [{ id: "s1", name: "Deck" }], [
    { id: "a", sectionId: "s1", customerDescription: "Lumber", quantity: "1", unit: "package", included: true, customerPriceCents: "10000" },
    { id: "b", sectionId: "s1", customerDescription: "Labor", quantity: "10", unit: "hr", included: true, customerPriceCents: "5000" },
  ], { customerTotalCents: "18001", overheadCents: "3001", profitMarkupCents: "0", discountCents: "0", taxCents: "0" });
  assert.deepEqual(presentation.rows.map((row) => row.totalCents), ["12001", "6000"]);
  assert.equal(presentation.rows.reduce((sum, row) => sum + BigInt(row.totalCents), 0n), 18001n);
});

test("separate OH&P is an honest adjustment line and still reconciles", () => {
  const snapshot = snapshotEstimatePresentation({ id: "itemized-ohp", name: "Itemized OH&P", detailLevel: "itemized", lumpSumLabel: null, showQuantities: true, showUnitPrices: true, showSectionSubtotals: true, ohpPresentationMode: "separate_line_item" });
  const presentation = buildCustomerPresentation(snapshot, [{ id: "s1", name: "Deck" }], [
    { id: "a", sectionId: "s1", customerDescription: "Lumber", quantity: "1", unit: "package", included: true, customerPriceCents: "10000" },
  ], { customerTotalCents: "11500", overheadCents: "1000", profitMarkupCents: "0", discountCents: "0", taxCents: "500" });
  assert.deepEqual(presentation.rows.map(({ description, totalCents }) => ({ description, totalCents })), [
    { description: "Lumber", totalCents: "10000" },
    { description: "Overhead & profit", totalCents: "1000" },
    { description: "Tax", totalCents: "500" },
  ]);
});

test("lump sum rejects a separate OH&P line", () => {
  assert.throws(() => snapshotEstimatePresentation({ id: "bad-lump", name: "Bad", detailLevel: "lump_sum", lumpSumLabel: "Deck", showQuantities: false, showUnitPrices: false, showSectionSubtotals: false, ohpPresentationMode: "separate_line_item" }), /always include OH&P/);
});

test("a 100-line customer presentation remains ordered and reconciled", () => {
  const snapshot = snapshotEstimatePresentation({
    id: "large-itemized",
    name: "Large itemized estimate",
    detailLevel: "itemized",
    lumpSumLabel: null,
    showQuantities: true,
    showUnitPrices: false,
    showSectionSubtotals: true,
    ohpPresentationMode: "distributed",
  });
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: `item-${String(index).padStart(3, "0")}`,
    sectionId: "section-1",
    customerDescription: `Line ${index + 1}`,
    quantity: String(index + 1),
    unit: "ea",
    included: true,
    customerPriceCents: String((index + 1) * 100),
  }));
  const baseTotal = items.reduce((sum, item) => sum + BigInt(item.customerPriceCents), 0n);
  const customerTotal = baseTotal + 12_345n;
  const presentation = buildCustomerPresentation(
    snapshot,
    [{ id: "section-1", name: "Large scope" }],
    items,
    { customerTotalCents: customerTotal.toString() },
  );

  assert.equal(presentation.rows.length, 100);
  assert.equal(presentation.rows[0].description, "Line 1");
  assert.equal(presentation.rows[99].description, "Line 100");
  assert.equal(
    presentation.rows.reduce((sum, row) => sum + BigInt(row.totalCents), 0n),
    customerTotal,
  );
});
