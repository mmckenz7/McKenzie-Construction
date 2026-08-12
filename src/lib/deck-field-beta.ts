export const DECK_FIELD_BLOCK_START = "[DECK FIELD VISIT — UNVERIFIED START]";
export const DECK_FIELD_BLOCK_END = "[DECK FIELD VISIT — UNVERIFIED END]";

export const DECK_FIELD_LIMITATIONS =
  "FIELD BETA: No automatic deck engineering, code, load, bill-of-materials, or labor calculation. Michael must verify every measurement and quantity. Recheck every product, store, price, package quantity, tax, and availability before estimating.";

export type DeckFieldDraft = Readonly<{
  projectCondition: string;
  length: string;
  width: string;
  heightAboveGrade: string;
  supportType: string;
  stairs: string;
  stairWidth: string;
  railingNotes: string;
  surfaceAndFramingNotes: string;
  accessAndDemolitionNotes: string;
  utilitiesAndObstructions: string;
  fieldNotes: string;
}>;

const FIELD_LABELS: ReadonlyArray<readonly [keyof DeckFieldDraft, string]> = [
  ["projectCondition", "Project condition"],
  ["length", "Field length"],
  ["width", "Field width"],
  ["heightAboveGrade", "Height above grade"],
  ["supportType", "Attached / freestanding"],
  ["stairs", "Stairs"],
  ["stairWidth", "Approximate stair width"],
  ["railingNotes", "Railing areas / notes"],
  ["surfaceAndFramingNotes", "Surface / framing condition"],
  ["accessAndDemolitionNotes", "Access / demolition"],
  ["utilitiesAndObstructions", "Utilities / obstructions"],
  ["fieldNotes", "Other field notes"],
];

export function buildDeckFieldBlock(draft: DeckFieldDraft) {
  const facts = FIELD_LABELS.flatMap(([key, label]) => {
    const value = draft[key].trim();
    if (!value) return [];
    if (value.length > 2_000) throw new TypeError(`${label} is too long.`);
    if (value.includes(DECK_FIELD_BLOCK_START) || value.includes(DECK_FIELD_BLOCK_END)) {
      throw new TypeError(`${label} contains a reserved Deck field marker.`);
    }
    return [`${label}: ${value}`];
  });
  if (!facts.length) throw new TypeError("Enter at least one field observation before previewing.");
  return [
    DECK_FIELD_BLOCK_START,
    "DECK FIELD VISIT — UNVERIFIED",
    DECK_FIELD_LIMITATIONS,
    ...facts,
    DECK_FIELD_BLOCK_END,
  ].join("\n");
}

export function replaceDeckFieldBlock(internalNotes: string | null | undefined, block: string) {
  const current = internalNotes ?? "";
  const starts = current.split(DECK_FIELD_BLOCK_START).length - 1;
  const ends = current.split(DECK_FIELD_BLOCK_END).length - 1;
  if (starts > 1 || ends > 1) throw new TypeError("Multiple Deck field blocks need manual cleanup before saving.");
  if (starts !== ends) throw new TypeError("The existing Deck field block is incomplete. Repair it manually before saving.");
  if (starts === 0) return current ? `${current}\n\n${block}` : block;
  const start = current.indexOf(DECK_FIELD_BLOCK_START);
  const end = current.indexOf(DECK_FIELD_BLOCK_END, start) + DECK_FIELD_BLOCK_END.length;
  return `${current.slice(0, start)}${block}${current.slice(end)}`;
}
