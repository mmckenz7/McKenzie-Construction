export type DeckProposalDesign = Readonly<{
  lengthFeet: number;
  widthFeet: number;
  boardRunDirection: "along_length" | "along_width";
  deckingLayout: "seamless" | "picture_frame_divider";
  railingLengthFeet: number | null;
  attached: boolean | null;
  stairsPresent: boolean | null;
  stairWidthFeet: number | null;
  stairEdge: "left" | "right" | "yard" | "top";
  stairPosition: "start" | "center" | "end";
  stairOffsetFeet?: number | null;
}>;

export type DeckStairOpeningGeometry = Readonly<{
  edge: DeckProposalDesign["stairEdge"];
  start: number;
  end: number;
  center: number;
}>;

export function deckStairOpeningGeometry(
  design: DeckProposalDesign,
  drawing: Readonly<{ x: number; y: number; width: number; height: number }>,
): DeckStairOpeningGeometry | null {
  if (!design.stairsPresent) return null;
  const horizontal = design.stairEdge === "top" || design.stairEdge === "yard";
  const edgeStart = horizontal ? drawing.x : drawing.y;
  const edgePixels = horizontal ? drawing.width : drawing.height;
  const edgeFeet = horizontal ? design.lengthFeet : design.widthFeet;
  if (design.stairWidthFeet !== null && design.stairWidthFeet > edgeFeet)
    return null;
  const opening =
    design.stairWidthFeet === null
      ? edgePixels * 0.24
      : (edgePixels * design.stairWidthFeet) / edgeFeet;
  const requestedCenter =
    design.stairOffsetFeet == null
      ? null
      : edgeStart + (edgePixels * design.stairOffsetFeet) / edgeFeet;
  const center =
    requestedCenter ??
    (design.stairPosition === "start"
      ? edgeStart + opening / 2
      : design.stairPosition === "end"
        ? edgeStart + edgePixels - opening / 2
        : edgeStart + edgePixels / 2);
  if (
    center - opening / 2 < edgeStart ||
    center + opening / 2 > edgeStart + edgePixels
  )
    return null;
  return Object.freeze({
    edge: design.stairEdge,
    start: center - opening / 2,
    end: center + opening / 2,
    center,
  });
}

function finitePositive(value: unknown) {
  const number =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseDeckProposalDesign(
  value: unknown,
): DeckProposalDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const lengthFeet = finitePositive(source.lengthFeet);
  const widthFeet = finitePositive(source.widthFeet);
  const rawStairWidth = source.stairWidthFeet;
  const compatibleNoStairsZero =
    source.stairsPresent === false &&
    typeof rawStairWidth === "number" &&
    rawStairWidth === 0;
  const stairWidthFeet =
    rawStairWidth === null ||
    rawStairWidth === undefined ||
    compatibleNoStairsZero
      ? null
      : finitePositive(rawStairWidth);
  const stairEdge = source.stairEdge === undefined ? "yard" : source.stairEdge;
  const stairPosition =
    source.stairPosition === undefined ? "center" : source.stairPosition;
  const stairOffsetFeet =
    source.stairOffsetFeet === undefined || source.stairOffsetFeet === null
      ? null
      : finitePositive(source.stairOffsetFeet);
  if (
    !lengthFeet ||
    !widthFeet ||
    (source.boardRunDirection !== "along_length" &&
      source.boardRunDirection !== "along_width") ||
    (source.deckingLayout !== "seamless" &&
      source.deckingLayout !== "picture_frame_divider") ||
    (source.attached !== null && typeof source.attached !== "boolean") ||
    (source.stairsPresent !== null &&
      typeof source.stairsPresent !== "boolean") ||
    (rawStairWidth !== null &&
      rawStairWidth !== undefined &&
      !compatibleNoStairsZero &&
      stairWidthFeet === null) ||
    (stairEdge !== "left" &&
      stairEdge !== "right" &&
      stairEdge !== "yard" &&
      stairEdge !== "top") ||
    (stairPosition !== "start" &&
      stairPosition !== "center" &&
      stairPosition !== "end") ||
    (source.stairOffsetFeet !== undefined &&
      source.stairOffsetFeet !== null &&
      stairOffsetFeet === null) ||
    (source.stairsPresent === true &&
      source.attached === true &&
      stairEdge === "top")
  )
    return null;
  const railingLengthFeet =
    source.railingLengthFeet === null
      ? null
      : finitePositive(source.railingLengthFeet);
  if (
    source.railingLengthFeet !== null &&
    railingLengthFeet === null &&
    Number(source.railingLengthFeet) !== 0
  )
    return null;
  return Object.freeze({
    lengthFeet,
    widthFeet,
    boardRunDirection: source.boardRunDirection,
    deckingLayout: source.deckingLayout,
    railingLengthFeet:
      source.railingLengthFeet === null
        ? null
        : Number(source.railingLengthFeet),
    attached: source.attached,
    stairsPresent: source.stairsPresent,
    stairWidthFeet,
    stairEdge,
    stairPosition,
    ...(source.stairOffsetFeet === undefined ? {} : { stairOffsetFeet }),
  });
}

export async function loadDeckProposalDesign(
  supabase: SupabaseClient,
  companyId: string,
  estimateId: string,
) {
  const result = await supabase
    .from("deck_estimate_takeoff_applications")
    .select("evidence_snapshot")
    .eq("company_id", companyId)
    .eq("estimate_id", estimateId)
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const snapshot = result.data.evidence_snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return null;
  return parseDeckProposalDesign((snapshot as Record<string, unknown>).design);
}
import type { SupabaseClient } from "@supabase/supabase-js";
