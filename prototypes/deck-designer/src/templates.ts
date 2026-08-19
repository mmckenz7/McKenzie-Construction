import { DEFAULT_DESIGN, normalizeDesign, type DeckDesignV1 } from "./model";

export type DeckTemplateId = "compact-ground" | "elevated-rectangle" | "l-shape-landing";

export type DeckTemplate = Readonly<{
  id: DeckTemplateId;
  label: string;
  description: string;
  design: DeckDesignV1;
}>;

function templateDesign(
  id: DeckTemplateId,
  name: string,
  platform: Partial<DeckDesignV1["platform"]>,
  construction: {
    railingEdges: DeckDesignV1["construction"]["railing"]["enabledEdges"];
    stairs?: Partial<DeckDesignV1["construction"]["stairs"]>;
  },
): DeckDesignV1 {
  return normalizeDesign({
    ...DEFAULT_DESIGN,
    id: `template-${id}`,
    name,
    platform: { ...DEFAULT_DESIGN.platform, ...platform },
    construction: {
      ...DEFAULT_DESIGN.construction,
      railing: { ...DEFAULT_DESIGN.construction.railing, enabledEdges: construction.railingEdges },
      stairs: { ...DEFAULT_DESIGN.construction.stairs, ...construction.stairs },
    },
    metadata: { status: "conceptual", revision: 1 },
  });
}

export const GENERIC_DECK_TEMPLATES: readonly DeckTemplate[] = Object.freeze([
  Object.freeze({
    id: "compact-ground",
    label: "Compact ground-level",
    description: "12′ × 10′ rectangle at 18 inches with no recorded railing or stairs.",
    design: templateDesign(
      "compact-ground",
      "Compact ground-level concept",
      { kind: "rectangle", width: 144, projection: 120, surfaceElevation: 18 },
      { railingEdges: [], stairs: { enabled: false, landingEnabled: false } },
    ),
  }),
  Object.freeze({
    id: "elevated-rectangle",
    label: "Elevated entertaining",
    description: "20′ × 14′ rectangle at 6 feet with a front stair opening.",
    design: templateDesign(
      "elevated-rectangle",
      "Elevated entertaining concept",
      { kind: "rectangle", width: 240, projection: 168, surfaceElevation: 72 },
      {
        railingEdges: ["front", "left", "right"],
        stairs: { enabled: true, edgeId: "front", offset: 96, width: 48, landingEnabled: false },
      },
    ),
  }),
  Object.freeze({
    id: "l-shape-landing",
    label: "L-shape with landing",
    description: "20′ × 15′ envelope with a 6′ × 5′ cutout and right-edge landing.",
    design: templateDesign(
      "l-shape-landing",
      "L-shape landing concept",
      { kind: "l-shape", width: 240, projection: 180, surfaceElevation: 54, cutoutWidth: 72, cutoutDepth: 60 },
      {
        railingEdges: ["front", "left", "right", "notch-horizontal", "notch-vertical"],
        stairs: { enabled: true, edgeId: "right", offset: 36, width: 48, landingEnabled: true, landingDepth: 48 },
      },
    ),
  }),
]);

export function getDeckTemplate(templateId: DeckTemplateId): DeckTemplate {
  const template = GENERIC_DECK_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new RangeError(`Unknown deck template: ${templateId}`);
  return template;
}

export function applyTemplateToDesign(design: DeckDesignV1, templateId: DeckTemplateId): DeckDesignV1 {
  const template = getDeckTemplate(templateId).design;
  return normalizeDesign({
    ...template,
    id: design.id,
    metadata: { ...template.metadata, revision: design.metadata.revision + 1 },
  });
}

export function duplicateDesign(design: DeckDesignV1, newId: string): DeckDesignV1 {
  const baseName = design.name.replace(/\s+copy$/i, "");
  const copyName = `${baseName.slice(0, 115).trimEnd()} copy`;
  return normalizeDesign({
    ...design,
    id: newId,
    name: copyName,
    metadata: { ...design.metadata, revision: 1 },
  });
}
