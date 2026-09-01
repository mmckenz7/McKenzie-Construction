export const publicLeadAttributionFields = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
] as const;

export type PublicLeadAttribution = Partial<
  Record<(typeof publicLeadAttributionFields)[number] | "landing_path", string>
>;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/gu;

function clean(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function normalizePublicLeadAttribution(
  input: Readonly<Record<string, unknown>>,
): PublicLeadAttribution {
  const result: PublicLeadAttribution = {};
  for (const field of publicLeadAttributionFields) {
    const value = clean(input[field], 200);
    if (value) result[field] = value;
  }
  const landingPath = clean(input.landing_path, 240);
  if (landingPath?.startsWith("/") && !landingPath.startsWith("//")) {
    result.landing_path = landingPath;
  }
  return result;
}

export function publicLeadSource(attribution: PublicLeadAttribution) {
  const source = attribution.utm_source?.toLowerCase();
  const medium = attribution.utm_medium?.toLowerCase();
  if (
    attribution.gclid ||
    attribution.gbraid ||
    attribution.wbraid ||
    (source === "google" && ["cpc", "paid", "paid_search", "ppc"].includes(medium ?? ""))
  ) {
    return "google_ads";
  }
  return "website";
}
