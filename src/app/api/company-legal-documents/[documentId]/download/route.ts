import { NextResponse } from "next/server";

import { createForbiddenApiResponse, createUnauthorizedApiResponse, getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type Context = { params: Promise<{ documentId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function companyId() {
  const result = await createAdminServerClient().from("company_settings").select("id").limit(2);
  if (result.error || result.data?.length !== 1) return null;
  return String(result.data[0].id);
}

export async function GET(request: Request, context: Context) {
  const access = await getAuthenticatedAccess();
  if (!access) return createUnauthorizedApiResponse(request);
  if (!hasManagementAccess(access.teamMember.roles)) return createForbiddenApiResponse(request);
  const { documentId } = await context.params;
  if (!UUID.test(documentId)) return NextResponse.json({ success: false, error: "Invalid document ID." }, { status: 400 });
  const currentCompanyId = await companyId();
  if (!currentCompanyId) return NextResponse.json({ success: false, error: "Exactly one company must be configured." }, { status: 409 });
  const supabase = createAdminServerClient();
  const result = await supabase.from("company_legal_documents")
    .select("title,source_kind,boilerplate_body,storage_bucket,storage_path,original_file_name")
    .eq("id", documentId).eq("company_id", currentCompanyId).maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ success: false, error: "Legal document not found." }, { status: 404 });
  if (result.data.source_kind === "boilerplate") {
    return new Response(String(result.data.boilerplate_body ?? ""), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="beta-construction-agreement.txt"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const signed = await supabase.storage.from(String(result.data.storage_bucket)).createSignedUrl(String(result.data.storage_path), 300, {
    download: String(result.data.original_file_name ?? "legal-document"),
  });
  if (signed.error || !signed.data.signedUrl) return NextResponse.json({ success: false, error: "A secure download link could not be created." }, { status: 500 });
  return NextResponse.redirect(signed.data.signedUrl);
}
