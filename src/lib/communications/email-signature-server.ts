import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseEmailSignatureLayout,
  renderEmailSignature,
  type EmailSignatureFacts,
  type EmailSignaturePreview,
} from "@/lib/communications/email-signature";

const COMPANY_SIGNATURE_SELECT = [
  "company_name",
  "company_phone",
  "company_email",
  "website_url",
  "brand_logo_url",
  "brand_primary_color",
  "brand_accent_color",
  "email_signature_layout",
].join(",");

const LEGACY_COMPANY_SIGNATURE_SELECT = [
  "company_name",
  "company_phone",
  "company_email",
  "website_url",
  "brand_logo_url",
  "brand_primary_color",
  "brand_accent_color",
].join(",");

export type LoadedCompanyEmailSignature = Readonly<{
  layout: "off" | "compact" | "branded";
  facts: EmailSignatureFacts;
  preview: EmailSignaturePreview;
  schemaAvailable: boolean;
}>;

export async function loadCompanyEmailSignature(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<LoadedCompanyEmailSignature> {
  let schemaAvailable = true;
  let companyResult = await supabase
    .from("company_settings")
    .select(COMPANY_SIGNATURE_SELECT)
    .limit(1)
    .maybeSingle();

  if (companyResult.error?.code === "42703") {
    schemaAvailable = false;
    companyResult = await supabase
      .from("company_settings")
      .select(LEGACY_COMPANY_SIGNATURE_SELECT)
      .limit(1)
      .maybeSingle();
  }
  if (companyResult.error || !companyResult.data) {
    throw new Error("Company email signature settings could not be loaded.");
  }

  const memberResult = await supabase
    .from("team_members")
    .select("name,email,phone,job_title")
    .eq("auth_user_id", authUserId)
    .eq("status", "active")
    .maybeSingle();
  if (memberResult.error || !memberResult.data) {
    throw new Error("The active employee signature profile could not be loaded.");
  }

  const company = companyResult.data as unknown as Record<string, unknown>;
  const member = memberResult.data as unknown as Record<string, unknown>;
  const layout = schemaAvailable
    ? parseEmailSignatureLayout(company.email_signature_layout)
    : "off";
  const facts: EmailSignatureFacts = {
    companyName: company.company_name as string | null,
    companyPhone: company.company_phone as string | null,
    companyEmail: company.company_email as string | null,
    websiteUrl: company.website_url as string | null,
    logoUrl: company.brand_logo_url as string | null,
    primaryColor: company.brand_primary_color as string | null,
    accentColor: company.brand_accent_color as string | null,
    employeeName: member.name as string | null,
    employeeTitle: member.job_title as string | null,
    employeePhone: member.phone as string | null,
    employeeEmail: member.email as string | null,
  };
  const rendered = renderEmailSignature(layout, facts);
  return {
    layout,
    facts,
    schemaAvailable,
    preview: rendered?.preview ?? {
      layout: "off",
      label: "Automatic company signature is off",
      lines: [],
      logoUrl: null,
    },
  };
}
