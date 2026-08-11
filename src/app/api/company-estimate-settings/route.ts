import { NextResponse } from "next/server";

import { createForbiddenApiResponse, createUnauthorizedApiResponse, getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const SELECT = "id, default_estimate_detail_level, default_estimate_ohp_mode, default_estimate_lump_sum_label";

async function authorize(request: Request) {
  const access = await getAuthenticatedAccess();
  if (!access) return createUnauthorizedApiResponse(request);
  if (!hasManagementAccess(access.teamMember.roles)) return createForbiddenApiResponse(request);
  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const { data, error } = await createAdminServerClient().from("company_settings").select(SELECT).limit(1).maybeSingle();
  if (error) return NextResponse.json({ success: false, code: "presentation_schema_unavailable", error: "Apply the estimate presentation migration before editing company defaults." }, { status: 503 });
  if (!data) return NextResponse.json({ success: false, error: "Company settings were not found." }, { status: 404 });
  return NextResponse.json({ success: true, settings: data });
}

export async function PATCH(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }
  const detailLevel = body.detailLevel;
  const requestedOhpMode = body.ohpMode;
  const lumpSumLabel = typeof body.lumpSumLabel === "string" ? body.lumpSumLabel.trim() : "";
  if (!["lump_sum", "section_summary", "itemized"].includes(String(detailLevel))
    || !["distributed", "separate_line_item"].includes(String(requestedOhpMode))
    || !lumpSumLabel || lumpSumLabel.length > 240) {
    return NextResponse.json({ success: false, error: "Choose valid presentation defaults and a lump-sum description up to 240 characters." }, { status: 400 });
  }
  const supabase = createAdminServerClient();
  const existing = await supabase.from("company_settings").select("id").limit(1).maybeSingle();
  if (existing.error || !existing.data) return NextResponse.json({ success: false, error: "Company settings were not found." }, { status: 404 });
  const { data, error } = await supabase.from("company_settings").update({
    default_estimate_detail_level: detailLevel,
    default_estimate_ohp_mode: detailLevel === "lump_sum" ? "distributed" : requestedOhpMode,
    default_estimate_lump_sum_label: lumpSumLabel,
    updated_at: new Date().toISOString(),
  }).eq("id", existing.data.id).select(SELECT).single();
  if (error) return NextResponse.json({ success: false, code: "presentation_schema_unavailable", error: "Company estimate defaults could not be saved. Confirm the presentation migration has been applied." }, { status: 503 });
  return NextResponse.json({ success: true, settings: data });
}
