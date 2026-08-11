export const ESTIMATE_PRESENTATION_VERSION = "estimate-presentation-v1" as const;

export type EstimatePresentationDetail =
  | "lump_sum"
  | "section_summary"
  | "itemized";

export type OhpPresentationMode = "separate_line_item" | "distributed";

export type EstimatePresentationTemplate = Readonly<{
  id: string;
  name: string;
  detailLevel: EstimatePresentationDetail;
  lumpSumLabel: string | null;
  showQuantities: boolean;
  showUnitPrices: boolean;
  showSectionSubtotals: boolean;
  ohpPresentationMode: OhpPresentationMode;
}>;

export type EstimatePresentationSnapshot = Readonly<
  EstimatePresentationTemplate & {
    version: typeof ESTIMATE_PRESENTATION_VERSION;
  }
>;

export type LumpSumPresentationRow = Readonly<{
  description: string;
  totalCents: string;
}>;

export const DEFAULT_ESTIMATE_PRESENTATION = Object.freeze({
  version: ESTIMATE_PRESENTATION_VERSION,
  id: "company-default",
  name: "Company default",
  detailLevel: "lump_sum" as const,
  lumpSumLabel: "Work described in this estimate",
  showQuantities: false,
  showUnitPrices: false,
  showSectionSubtotals: false,
  ohpPresentationMode: "distributed" as const,
});

export type CustomerPresentationRow = Readonly<{
  id: string;
  kind: "item" | "section" | "adjustment";
  description: string;
  totalCents: string;
  quantity?: string;
  unit?: string;
}>;

export type CustomerPresentation = Readonly<{
  detailLevel: EstimatePresentationDetail;
  rows: readonly CustomerPresentationRow[];
  totalCents: string;
}>;

const TEMPLATE_ID = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

function requiredText(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new RangeError(`${field} must be ${maximum} characters or fewer.`);
  }
  return normalized;
}

export function snapshotEstimatePresentation(
  template: EstimatePresentationTemplate,
  lumpSumLabelOverride?: string | null,
): EstimatePresentationSnapshot {
  const id = requiredText(template.id, "template.id", 64);
  if (!TEMPLATE_ID.test(id)) {
    throw new TypeError("template.id must be a stable lowercase key.");
  }
  const name = requiredText(template.name, "template.name", 100);
  if (!["lump_sum", "section_summary", "itemized"].includes(template.detailLevel)) {
    throw new TypeError("template.detailLevel is unsupported.");
  }
  if (!["separate_line_item", "distributed"].includes(template.ohpPresentationMode)) {
    throw new TypeError("template.ohpPresentationMode is unsupported.");
  }
  for (const field of ["showQuantities", "showUnitPrices", "showSectionSubtotals"] as const) {
    if (typeof template[field] !== "boolean") {
      throw new TypeError(`template.${field} must be boolean.`);
    }
  }

  let lumpSumLabel: string | null = null;
  if (template.detailLevel === "lump_sum") {
    lumpSumLabel = requiredText(
      lumpSumLabelOverride ?? template.lumpSumLabel,
      "template.lumpSumLabel",
      240,
    );
    if (template.showQuantities || template.showUnitPrices || template.showSectionSubtotals) {
      throw new TypeError("Lump-sum templates cannot expose item or section pricing details.");
    }
    if (template.ohpPresentationMode !== "distributed") {
      throw new TypeError("Lump-sum templates always include OH&P in the quoted total.");
    }
  } else {
    if (lumpSumLabelOverride !== undefined && lumpSumLabelOverride !== null) {
      throw new TypeError("A lump-sum label override requires a lump-sum template.");
    }
    if (template.detailLevel === "section_summary") {
      if (template.showQuantities || template.showUnitPrices || !template.showSectionSubtotals) {
        throw new TypeError("Section-summary templates show section subtotals without item quantities or unit prices.");
      }
    }
  }

  return Object.freeze({
    version: ESTIMATE_PRESENTATION_VERSION,
    id,
    name,
    detailLevel: template.detailLevel,
    lumpSumLabel,
    showQuantities: template.showQuantities,
    showUnitPrices: template.showUnitPrices,
    showSectionSubtotals: template.showSectionSubtotals,
    ohpPresentationMode: template.ohpPresentationMode,
  });
}

function cents(value: unknown, field: string) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${field} must be a nonnegative whole-cent value.`);
  }
  return BigInt(value);
}

function allocateTotal(
  total: bigint,
  weightedRows: readonly { id: string; weight: bigint }[],
) {
  const positive = weightedRows.filter((row) => row.weight > 0n);
  if (!positive.length) return new Map<string, bigint>();
  const weightTotal = positive.reduce((sum, row) => sum + row.weight, 0n);
  const allocations = positive.map((row) => ({
    ...row,
    amount: total * row.weight / weightTotal,
    remainder: total * row.weight % weightTotal,
  }));
  let leftover = total - allocations.reduce((sum, row) => sum + row.amount, 0n);
  const ranked = [...allocations].sort((left, right) =>
    left.remainder === right.remainder
      ? left.id.localeCompare(right.id)
      : left.remainder > right.remainder ? -1 : 1,
  );
  for (let index = 0; leftover > 0n; index += 1, leftover -= 1n) {
    ranked[index % ranked.length].amount += 1n;
  }
  return new Map(allocations.map((row) => [row.id, row.amount]));
}

export function buildCustomerPresentation(
  snapshot: EstimatePresentationSnapshot,
  sections: readonly { id: string; name: string }[],
  items: readonly {
    id: string;
    sectionId: string;
    customerDescription: string;
    quantity: string;
    unit: string;
    included: boolean;
    customerPriceCents: string | null;
  }[],
  calculation: {
    customerTotalCents?: string | null;
    overheadCents?: string | null;
    profitMarkupCents?: string | null;
    discountCents?: string | null;
    taxCents?: string | null;
  },
): CustomerPresentation | null {
  if (calculation.customerTotalCents === null || calculation.customerTotalCents === undefined) return null;
  const total = cents(calculation.customerTotalCents, "customerTotalCents");
  if (snapshot.detailLevel === "lump_sum") {
    const row = buildLumpSumPresentationRow(snapshot, total.toString());
    const rows: readonly CustomerPresentationRow[] = Object.freeze([
      Object.freeze({ id: "lump-sum", kind: "item" as const, ...row }),
    ]);
    return Object.freeze({
      detailLevel: snapshot.detailLevel,
      rows,
      totalCents: total.toString(),
    });
  }

  const includedItems = items.filter((item) => item.included && item.customerPriceCents !== null)
    .map((item) => ({ ...item, price: cents(item.customerPriceCents, `${item.id}.customerPriceCents`) }));
  const baseRows = snapshot.detailLevel === "section_summary"
    ? sections.map((section) => ({
        id: section.id,
        kind: "section" as const,
        description: section.name,
        price: includedItems.filter((item) => item.sectionId === section.id)
          .reduce((sum, item) => sum + item.price, 0n),
      })).filter((row) => row.price > 0n)
    : includedItems.map((item) => ({
        id: item.id,
        kind: "item" as const,
        description: item.customerDescription,
        quantity: snapshot.showQuantities ? item.quantity : undefined,
        unit: snapshot.showQuantities ? item.unit : undefined,
        price: item.price,
      }));

  if (snapshot.ohpPresentationMode === "distributed") {
    const allocations = allocateTotal(total, baseRows.map((row) => ({ id: row.id, weight: row.price })));
    const rows: readonly CustomerPresentationRow[] = baseRows.map((row) => Object.freeze({
      id: row.id,
      kind: row.kind,
      description: row.description,
      ...(snapshot.detailLevel === "itemized" && "quantity" in row ? { quantity: row.quantity, unit: row.unit } : {}),
      totalCents: (allocations.get(row.id) ?? 0n).toString(),
    }));
    return Object.freeze({ detailLevel: snapshot.detailLevel, rows: Object.freeze(rows), totalCents: total.toString() });
  }

  const rows: CustomerPresentationRow[] = baseRows.map(({ price, ...row }) => ({ ...row, totalCents: price.toString() }));
  const adjustments = [
    ["ohp", "Overhead & profit", calculation.overheadCents],
    ["profit", "Additional profit markup", calculation.profitMarkupCents],
    ["discount", "Discount", calculation.discountCents],
    ["tax", "Tax", calculation.taxCents],
  ] as const;
  for (const [id, description, value] of adjustments) {
    if (value === null || value === undefined || cents(value, id) === 0n) continue;
    const amount = cents(value, id);
    rows.push({ id, kind: "adjustment", description, totalCents: (id === "discount" ? -amount : amount).toString() });
  }
  const reconciled = rows.reduce((sum, row) => sum + BigInt(row.totalCents), 0n);
  if (reconciled !== total) throw new TypeError("Customer presentation rows do not reconcile to the estimate total.");
  return Object.freeze({ detailLevel: snapshot.detailLevel, rows: Object.freeze(rows.map((row) => Object.freeze(row))), totalCents: total.toString() });
}

export function buildLumpSumPresentationRow(
  snapshot: EstimatePresentationSnapshot,
  totalCents: string,
): LumpSumPresentationRow {
  if (snapshot.detailLevel !== "lump_sum" || !snapshot.lumpSumLabel) {
    throw new TypeError("A lump-sum presentation snapshot is required.");
  }
  if (!/^(?:0|[1-9]\d*)$/.test(totalCents)) {
    throw new TypeError("totalCents must be a nonnegative whole-cent value.");
  }
  return Object.freeze({ description: snapshot.lumpSumLabel, totalCents });
}
