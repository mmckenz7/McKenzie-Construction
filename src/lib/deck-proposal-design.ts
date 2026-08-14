export type DeckProposalDesign = Readonly<{
  lengthFeet: number;
  widthFeet: number;
  boardRunDirection: "along_length" | "along_width";
  deckingLayout: "seamless" | "picture_frame_divider";
  railingLengthFeet: number | null;
  attached: boolean | null;
  stairsPresent: boolean | null;
}>;

function finitePositive(value: unknown) {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseDeckProposalDesign(value: unknown): DeckProposalDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const lengthFeet = finitePositive(source.lengthFeet);
  const widthFeet = finitePositive(source.widthFeet);
  if (!lengthFeet || !widthFeet
    || (source.boardRunDirection !== "along_length" && source.boardRunDirection !== "along_width")
    || (source.deckingLayout !== "seamless" && source.deckingLayout !== "picture_frame_divider")
    || (source.attached !== null && typeof source.attached !== "boolean")
    || (source.stairsPresent !== null && typeof source.stairsPresent !== "boolean")) return null;
  const railingLengthFeet = source.railingLengthFeet === null ? null : finitePositive(source.railingLengthFeet);
  if (source.railingLengthFeet !== null && railingLengthFeet === null && Number(source.railingLengthFeet) !== 0) return null;
  return Object.freeze({
    lengthFeet, widthFeet,
    boardRunDirection: source.boardRunDirection,
    deckingLayout: source.deckingLayout,
    railingLengthFeet: source.railingLengthFeet === null ? null : Number(source.railingLengthFeet),
    attached: source.attached,
    stairsPresent: source.stairsPresent,
  });
}

export async function loadDeckProposalDesign(
  supabase: SupabaseClient,
  companyId: string,
  estimateId: string,
) {
  const result = await supabase.from("deck_estimate_takeoff_applications")
    .select("evidence_snapshot")
    .eq("company_id", companyId)
    .eq("estimate_id", estimateId)
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const snapshot = result.data.evidence_snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  return parseDeckProposalDesign((snapshot as Record<string, unknown>).design);
}
import type { SupabaseClient } from "@supabase/supabase-js";
