import { NextRequest, NextResponse } from "next/server";
import { authorizeGuidedSiteVisit } from "@/lib/guided-site-visits/access";
import { UUID } from "@/lib/guided-site-visits/core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string; attemptId: string }> },
) {
  const auth = await authorizeGuidedSiteVisit(request);
  if (auth.response) return auth.response;
  const { visitId, attemptId } = await params;
  if (!UUID.test(visitId) || !UUID.test(attemptId))
    return NextResponse.json(
      { success: false, error: "Photo reference is invalid." },
      { status: 400 },
    );

  const db = createAdminServerClient();
  const attempt = await db
    .from("guided_site_visit_intake_attempts")
    .select("asset_id,state")
    .eq("id", attemptId)
    .eq("visit_id", visitId)
    .eq("company_id", auth.authorization!.companyId)
    .maybeSingle();
  if (attempt.error || !attempt.data || attempt.data.state !== "confirmed")
    return NextResponse.json(
      { success: false, error: "Photo was not found." },
      { status: 404 },
    );

  const asset = await db
    .from("ai_estimator_assets")
    .select("storage_bucket,storage_path,status")
    .eq("id", attempt.data.asset_id)
    .eq("company_id", auth.authorization!.companyId)
    .maybeSingle();
  if (asset.error || !asset.data || asset.data.status !== "available")
    return NextResponse.json(
      { success: false, error: "Photo was not found." },
      { status: 404 },
    );

  const signed = await db.storage
    .from(asset.data.storage_bucket)
    .createSignedUrl(asset.data.storage_path, 300);
  if (signed.error || !signed.data.signedUrl)
    return NextResponse.json(
      { success: false, error: "Photo preview could not be created." },
      { status: 500 },
    );
  return NextResponse.redirect(signed.data.signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
