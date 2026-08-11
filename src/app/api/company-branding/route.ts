import { NextResponse } from "next/server";

import { createForbiddenApiResponse, createUnauthorizedApiResponse, getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const BRAND_SELECT = "id, company_name, brand_logo_url, brand_primary_color, brand_accent_color";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function logoUrl(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.startsWith("/") || /^https:\/\//i.test(trimmed) ? trimmed : undefined;
}

async function managementAccess(request: Request) {
  const access = await getAuthenticatedAccess();
  if (!access) return { response: createUnauthorizedApiResponse(request), access: null };
  if (!hasManagementAccess(access.teamMember.roles)) return { response: createForbiddenApiResponse(request), access: null };
  return { response: null, access };
}

export async function GET(request: Request) {
  const auth = await managementAccess(request);
  if (auth.response) return auth.response;
  const { data, error } = await createAdminServerClient().from("company_settings").select(BRAND_SELECT).limit(1).maybeSingle();
  if (error) return NextResponse.json({ success: false, code: "branding_schema_unavailable", error: "Company branding settings are not available until the branding migration is applied." }, { status: 503 });
  if (!data) return NextResponse.json({ success: false, error: "Company settings were not found." }, { status: 404 });
  return NextResponse.json({ success: true, branding: data });
}

export async function PATCH(request: Request) {
  const auth = await managementAccess(request);
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }
  const primaryColor = typeof body.primaryColor === "string" ? body.primaryColor.trim().toUpperCase() : "";
  const accentColor = typeof body.accentColor === "string" ? body.accentColor.trim().toUpperCase() : "";
  const parsedLogoUrl = logoUrl(body.logoUrl);
  if (!HEX_COLOR.test(primaryColor) || !HEX_COLOR.test(accentColor) || parsedLogoUrl === undefined) {
    return NextResponse.json({ success: false, error: "Enter two six-digit hex colors and a local path or HTTPS logo URL." }, { status: 400 });
  }
  const supabase = createAdminServerClient();
  const existing = await supabase.from("company_settings").select("id").limit(1).maybeSingle();
  if (existing.error) {
    console.error("Unable to load company settings for branding update:", existing.error);
    return NextResponse.json(
      { success: false, error: "Company branding settings could not be loaded." },
      { status: 500 },
    );
  }
  if (!existing.data) return NextResponse.json({ success: false, error: "Company settings were not found." }, { status: 404 });
  const { data, error } = await supabase.from("company_settings").update({
    brand_logo_url: parsedLogoUrl,
    brand_primary_color: primaryColor,
    brand_accent_color: accentColor,
    updated_at: new Date().toISOString(),
  }).eq("id", existing.data.id).select(BRAND_SELECT).single();
  if (error) return NextResponse.json({ success: false, code: "branding_schema_unavailable", error: "Company branding could not be saved. Confirm the branding migration has been applied." }, { status: 503 });
  return NextResponse.json({ success: true, branding: data });
}
