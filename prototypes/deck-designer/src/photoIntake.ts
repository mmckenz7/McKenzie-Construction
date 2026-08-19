import { DEFAULT_DESIGN, normalizeDesign, updateDesign, type HouseAttachment } from "./model";
import { migrateDeckDesignToV3, type DeckDesignV3 } from "./modelV3";

export type ConfirmedPhotoFacts = Readonly<{
  designName: string;
  width: number;
  projection: number;
  surfaceElevation: number | null;
  doorWidth: number | null;
  attachment: HouseAttachment;
}>;

export type PhotoIntakeReview = Readonly<{
  confirmed: readonly string[];
  fieldVerification: readonly string[];
}>;

const inches = (value: number, label: string, minimum: number, maximum: number): number => {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum} inches.`);
  }
  return Math.round(value * 100) / 100;
};

export function normalizeConfirmedPhotoFacts(facts: ConfirmedPhotoFacts): ConfirmedPhotoFacts {
  const designName = facts.designName.trim();
  if (!designName || designName.length > 120) throw new TypeError("Design name is required and must be 120 characters or fewer.");
  if (!["unknown", "ledger", "non-ledger"].includes(facts.attachment)) throw new TypeError("Choose a supported house attachment status.");
  return Object.freeze({
    designName,
    width: inches(facts.width, "Deck width", 48, 1200),
    projection: inches(facts.projection, "Deck projection", 48, 600),
    surfaceElevation: facts.surfaceElevation === null ? null : inches(facts.surfaceElevation, "Deck height", 6, 144),
    doorWidth: facts.doorWidth === null ? null : inches(facts.doorWidth, "Door width", 12, 240),
    attachment: facts.attachment,
  });
}

export function reviewConfirmedPhotoFacts(facts: ConfirmedPhotoFacts): PhotoIntakeReview {
  const normalized = normalizeConfirmedPhotoFacts(facts);
  return Object.freeze({
    confirmed: Object.freeze([
      `Deck footprint: ${normalized.width} × ${normalized.projection} inches`,
      ...(normalized.surfaceElevation === null ? [] : [`Deck height: ${normalized.surfaceElevation} inches`]),
      ...(normalized.doorWidth === null ? [] : [`Door width reference: ${normalized.doorWidth} inches`]),
      `House attachment response: ${normalized.attachment}`,
    ]),
    fieldVerification: Object.freeze([
      ...(normalized.surfaceElevation === null ? ["Deck height is carried from the current design until measured."] : []),
      ...(normalized.doorWidth === null ? ["Door width and wall position are not recorded."] : ["Door position is not recorded, so the opening is not placed automatically."]),
      ...(normalized.attachment === "unknown" ? ["House attachment remains unknown."] : ["Visible and concealed attachment conditions still require field verification."]),
      "Photos are reference evidence only and do not generate authoritative geometry.",
    ]),
  });
}

export function createDesignFromConfirmedPhotoFacts(base: DeckDesignV3, facts: ConfirmedPhotoFacts): DeckDesignV3 {
  const normalized = normalizeConfirmedPhotoFacts(facts);
  const currentElevation = base.platforms[0]?.elevation ?? DEFAULT_DESIGN.platform.surfaceElevation;
  const legacy = updateDesign(DEFAULT_DESIGN, {
    name: normalized.designName,
    kind: "rectangle",
    width: normalized.width,
    projection: normalized.projection,
    surfaceElevation: normalized.surfaceElevation ?? currentElevation,
    houseAttachment: normalized.attachment,
  });
  return migrateDeckDesignToV3(normalizeDesign({
    ...legacy,
    id: base.id,
    metadata: { ...legacy.metadata, revision: base.metadata.revision + 1 },
  }));
}
