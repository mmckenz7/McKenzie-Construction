import type { CSSProperties } from "react";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

export type CompanyBranding = Readonly<{
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}>;

export const DEFAULT_COMPANY_BRANDING: CompanyBranding = Object.freeze({
  companyName: "McKenzie Construction",
  logoUrl: "/branding/MCM_rev_black_horiz.jpg",
  primaryColor: "#3B82F6",
  accentColor: "#D2A679",
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

function safeLogoUrl(value: unknown) {
  if (typeof value !== "string") return DEFAULT_COMPANY_BRANDING.logoUrl;
  const trimmed = value.trim();
  return trimmed.startsWith("/") || /^https:\/\//i.test(trimmed)
    ? trimmed
    : DEFAULT_COMPANY_BRANDING.logoUrl;
}

export async function getCompanyBranding(): Promise<CompanyBranding> {
  const supabase = createAdminServerClient();
  const branded = await supabase
    .from("company_settings")
    .select("company_name, brand_logo_url, brand_primary_color, brand_accent_color")
    .limit(1)
    .maybeSingle();

  if (!branded.error && branded.data) {
    return Object.freeze({
      companyName: typeof branded.data.company_name === "string" && branded.data.company_name.trim()
        ? branded.data.company_name.trim()
        : DEFAULT_COMPANY_BRANDING.companyName,
      logoUrl: safeLogoUrl(branded.data.brand_logo_url),
      primaryColor: safeColor(branded.data.brand_primary_color, DEFAULT_COMPANY_BRANDING.primaryColor),
      accentColor: safeColor(branded.data.brand_accent_color, DEFAULT_COMPANY_BRANDING.accentColor),
    });
  }

  // The beta can render safely before the optional branding migration is applied.
  const legacy = await supabase
    .from("company_settings")
    .select("company_name")
    .limit(1)
    .maybeSingle();
  return Object.freeze({
    ...DEFAULT_COMPANY_BRANDING,
    companyName: typeof legacy.data?.company_name === "string" && legacy.data.company_name.trim()
      ? legacy.data.company_name.trim()
      : DEFAULT_COMPANY_BRANDING.companyName,
  });
}

export function companyBrandingStyle(branding: CompanyBranding): CSSProperties {
  return {
    "--company-primary": branding.primaryColor,
    "--company-accent": branding.accentColor,
  } as CSSProperties;
}
