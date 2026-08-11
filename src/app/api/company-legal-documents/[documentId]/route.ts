import { NextResponse } from "next/server";

import { createForbiddenApiResponse, createUnauthorizedApiResponse, getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type Context = { params: Promise<{ documentId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize(request: Request) {
  const access = await getAuthenticatedAccess();
  if (!access) return { access: null, response: createUnauthorizedApiResponse(request) };
  if (!hasManagementAccess(access.teamMember.roles)) return { access: null, response: createForbiddenApiResponse(request) };
  const effective = await createAdminServerClient().rpc("get_effective_user_access", {
    requested_auth_user_id: access.user.id,
  });
  const appUserId = effective.data && typeof effective.data === "object" && "user_id" in effective.data
    ? String(effective.data.user_id)
    : null;
  if (effective.error || !appUserId) {
    return {
      access: null,
      response: NextResponse.json({ success: false, error: "Application user access could not be verified." }, { status: 500 }),
    };
  }
  return { access: { ...access, appUserId }, response: null };
}

async function companyId() {
  const result = await createAdminServerClient().from("company_settings").select("id").limit(2);
  if (result.error || result.data?.length !== 1) return null;
  return String(result.data[0].id);
}

export async function PATCH(request: Request, context: Context) {
  const checked = await authorize(request);
  if (checked.response) return checked.response;
  const { documentId } = await context.params;
  if (!UUID.test(documentId)) return NextResponse.json({ success: false, error: "Invalid document ID." }, { status: 400 });
  const currentCompanyId = await companyId();
  if (!currentCompanyId) return NextResponse.json({ success: false, error: "Exactly one company must be configured." }, { status: 409 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }
  const action = body.action;
  const supabase = createAdminServerClient();
  if (action === "set_default") {
    const owned = await supabase.from("company_legal_documents").select("id")
      .eq("id", documentId).eq("company_id", currentCompanyId).maybeSingle();
    if (owned.error) return NextResponse.json({ success: false, error: "The legal document could not be verified." }, { status: 500 });
    if (!owned.data) return NextResponse.json({ success: false, error: "Legal document not found." }, { status: 404 });
    const result = await supabase.rpc("set_company_legal_document_default", {
      requested_document_id: documentId,
      requested_app_user_id: checked.access!.appUserId,
    });
    if (result.error) return NextResponse.json({ success: false, error: "The default legal document could not be changed." }, { status: 409 });
    return NextResponse.json({ success: true });
  }
  if (action === "archive") {
    const result = await supabase.from("company_legal_documents").update({ status: "archived", is_default: false })
      .eq("id", documentId).eq("company_id", currentCompanyId).select("id").maybeSingle();
    if (result.error) return NextResponse.json({ success: false, error: "The legal document could not be archived." }, { status: 500 });
    if (!result.data) return NextResponse.json({ success: false, error: "Legal document not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  }
  if (action === "set_review_status") {
    const reviewStatus = String(body.reviewStatus ?? "");
    if (!new Set(["not_reviewed", "beta_test_only", "attorney_reviewed"]).has(reviewStatus)) {
      return NextResponse.json({ success: false, error: "Invalid legal review status." }, { status: 400 });
    }
    const reviewed = reviewStatus !== "not_reviewed";
    const result = await supabase.from("company_legal_documents").update({
      legal_review_status: reviewStatus,
      reviewed_at: reviewed ? new Date().toISOString() : null,
      reviewed_by_app_user_id: reviewed ? checked.access!.appUserId : null,
    }).eq("id", documentId).eq("company_id", currentCompanyId).select("id").maybeSingle();
    if (result.error) return NextResponse.json({ success: false, error: "The legal review status could not be changed." }, { status: 500 });
    if (!result.data) return NextResponse.json({ success: false, error: "Legal document not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 400 });
}
