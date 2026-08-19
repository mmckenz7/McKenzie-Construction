import { createHash, randomUUID } from "node:crypto";

import type { DeckFinishDraftSnapshot, DeckFinishLineKey } from "./deck-finish-draft";
import type { CanonicalEstimateItem, MutationState } from "./estimate-mutations";

export const DECK_FINISH_MATERIAL_APPLICATION_VERSION =
  "deck-finish-material-application-v1" as const;

export const DECK_FINISH_MATERIAL_APPLICATION_FIELDS = new Set([
  "visitId",
  "finishSelectionRevisionId",
  "expectedFinishSelectionRevision",
  "expectedCalculationRevision",
  "applicationId",
  "idempotencyKey",
  "applicationVersion",
  "previewBinding",
]);

function pricedLine(
  selection: DeckFinishDraftSnapshot,
  key: DeckFinishLineKey,
) {
  const line = selection.lines.find((candidate) => candidate.key === key);
  if (
    !line ||
    !line.description.trim() ||
    !line.unit.trim() ||
    !line.sourceReference.trim() ||
    line.quantity === null ||
    !Number.isFinite(line.quantity) ||
    line.quantity <= 0 ||
    line.unitCost === null ||
    !Number.isFinite(line.unitCost) ||
    line.unitCost <= 0
  )
    throw new TypeError(`${key.replaceAll("_", " ")} is not ready to add to the estimate.`);
  return line;
}

export function requiredDeckFinishMaterialLines(
  selection: DeckFinishDraftSnapshot,
) {
  return [
    pricedLine(selection, "custom_decking"),
    ...(selection.deckingFamily === "composite"
      ? [pricedLine(selection, "custom_decking_square_edge")]
      : []),
    ...(selection.railingFamily !== "none"
      ? [pricedLine(selection, "custom_railing")]
      : []),
  ];
}

export function deckFinishMaterialPreview(input: Readonly<{
  finishSelectionRevisionId: string;
  finishSelectionRevision: number;
  selection: DeckFinishDraftSnapshot;
}>) {
  const lines = requiredDeckFinishMaterialLines(input.selection).map((line) =>
    Object.freeze({
      key: line.key,
      customerDescription: line.description.trim(),
      quantity: String(line.quantity),
      unit: line.unit.trim(),
      unitCost: String(line.unitCost),
      sourceReference: line.sourceReference.trim(),
      catalogMaterialId: line.catalogMaterialId,
      lineTotal: Number((line.quantity! * line.unitCost!).toFixed(2)),
      formula: `${line.quantity} ${line.unit.trim()} × $${line.unitCost} = $${(
        line.quantity! * line.unitCost!
      ).toFixed(2)}`,
    }),
  );
  const materialSubtotal = Number(
    lines.reduce((total, line) => total + line.lineTotal, 0).toFixed(2),
  );
  const previewBinding = createHash("sha256")
    .update(
      JSON.stringify({
        version: DECK_FINISH_MATERIAL_APPLICATION_VERSION,
        finishSelectionRevisionId: input.finishSelectionRevisionId,
        finishSelectionRevision: input.finishSelectionRevision,
        selection: input.selection,
        lines,
        materialSubtotal,
      }),
    )
    .digest("hex");
  return Object.freeze({
    version: DECK_FINISH_MATERIAL_APPLICATION_VERSION,
    finishSelectionRevisionId: input.finishSelectionRevisionId,
    finishSelectionRevision: input.finishSelectionRevision,
    lines: Object.freeze(lines),
    materialSubtotal,
    previewBinding,
  });
}

export function buildDeckFinishMaterialMutation(input: Readonly<{
  finishSelectionRevisionId: string;
  finishSelectionRevision: number;
  selection: DeckFinishDraftSnapshot;
  state: MutationState;
  previewBinding: string;
  uuid?: () => string;
}>) {
  const preview = deckFinishMaterialPreview(input);
  if (preview.previewBinding !== input.previewBinding)
    throw new TypeError("The reviewed Deck finish-cost preview changed.");
  const uuid = input.uuid ?? randomUUID;
  const sectionId = uuid();
  const firstSortOrder =
    input.state.items.reduce(
      (maximum, item) => Math.max(maximum, item.sortOrder),
      -1,
    ) + 1;
  const newItems: CanonicalEstimateItem[] = preview.lines.map((line, index) => ({
    id: uuid(),
    sectionId,
    itemType: "standard",
    quantity: line.quantity,
    unit: line.unit,
    customerDescription: line.customerDescription,
    internalDescription: `Deck finish material selected from saved finish revision ${input.finishSelectionRevision}. ${line.formula}. Structural framing, hardware, labor, and permit requirements remain separate.`,
    materialUnitCost: line.unitCost,
    laborUnitCost: "0",
    subcontractorUnitCost: "0",
    equipmentUnitCost: "0",
    otherDirectUnitCost: "0",
    materialWastePercent: "0",
    itemMarkupPercent: "0",
    taxable: false,
    included: true,
    fixedCustomerPrice: null,
    sortOrder: firstSortOrder + index,
  }));
  const evidenceSnapshot = Object.freeze({
    version: DECK_FINISH_MATERIAL_APPLICATION_VERSION,
    finishSelectionRevisionId: input.finishSelectionRevisionId,
    finishSelectionRevision: input.finishSelectionRevision,
    previewBinding: preview.previewBinding,
    materialSubtotal: preview.materialSubtotal,
    selection: input.selection,
    lines: Object.freeze(
      preview.lines.map((line, index) =>
        Object.freeze({
          ...line,
          estimateLineItemId: newItems[index].id,
        }),
      ),
    ),
  });
  return Object.freeze({
    preview,
    sectionId,
    newItems: Object.freeze(newItems),
    evidenceSnapshot,
  });
}
