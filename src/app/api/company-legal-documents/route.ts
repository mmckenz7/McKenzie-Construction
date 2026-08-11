import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createForbiddenApiResponse, createUnauthorizedApiResponse, getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const BUCKET = "company-legal-documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const DOCUMENT_TYPES = new Set(["construction_contract", "change_order_terms", "warranty", "privacy", "subcontractor_agreement", "other"]);
const SELECT = "id,company_id,document_type,title,version_label,source_kind,original_file_name,mime_type,file_size_bytes,content_sha256,status,legal_review_status,is_default,notes,reviewed_at,created_at,updated_at";

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

function value(form: FormData, name: string, max: number) {
  const candidate = form.get(name);
  return typeof candidate === "string" ? candidate.trim().slice(0, max) : "";
}

function safeFileName(name: string) {
  const normalized = name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 180) || "legal-document";
}

async function companyId() {
  const result = await createAdminServerClient().from("company_settings").select("id").limit(2);
  if (result.error || result.data?.length !== 1) return null;
  return String(result.data[0].id);
}

export async function GET(request: Request) {
  const checked = await authorize(request);
  if (checked.response) return checked.response;
  const id = await companyId();
  if (!id) return NextResponse.json({ success: false, error: "Exactly one company must be configured." }, { status: 409 });
  const result = await createAdminServerClient().from("company_legal_documents")
    .select(SELECT).eq("company_id", id).order("document_type").order("updated_at", { ascending: false });
  if (result.error) return NextResponse.json({ success: false, code: "legal_documents_schema_unavailable", error: "Apply the legal-document migration before managing company documents." }, { status: 503 });
  return NextResponse.json({ success: true, documents: result.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const checked = await authorize(request);
  if (checked.response) return checked.response;
  const id = await companyId();
  if (!id) return NextResponse.json({ success: false, error: "Exactly one company must be configured." }, { status: 409 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ success: false, error: "Invalid upload." }, { status: 400 }); }
  const file = form.get("file");
  const documentType = value(form, "documentType", 80);
  const title = value(form, "title", 240);
  const versionLabel = value(form, "versionLabel", 80) || "1.0";
  const notes = value(form, "notes", 2000) || null;
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_SIZE || !MIME_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: "Upload a PDF or DOCX file no larger than 10 MB." }, { status: 400 });
  }
  if (!DOCUMENT_TYPES.has(documentType) || !title) {
    return NextResponse.json({ success: false, error: "Choose a document type and title." }, { status: 400 });
  }

  const supabase = createAdminServerClient();
  const documentId = randomUUID();
  const path = `${id}/${documentId}/${safeFileName(file.name)}`;
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const contentSha256 = createHash("sha256").update(fileBytes).digest("hex");
  const uploaded = await supabase.storage.from(BUCKET).upload(path, fileBytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) return NextResponse.json({ success: false, error: "The legal document could not be uploaded." }, { status: 500 });

  const inserted = await supabase.from("company_legal_documents").insert({
    id: documentId,
    company_id: id,
    document_type: documentType,
    title,
    version_label: versionLabel,
    source_kind: "uploaded",
    storage_bucket: BUCKET,
    storage_path: path,
    original_file_name: file.name.slice(0, 240),
    mime_type: file.type,
    file_size_bytes: file.size,
    content_sha256: contentSha256,
    status: "draft",
    legal_review_status: "not_reviewed",
    is_default: false,
    notes,
    created_by_app_user_id: checked.access!.appUserId,
  }).select(SELECT).single();
  if (inserted.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ success: false, error: "The legal document record could not be created." }, { status: 500 });
  }
  return NextResponse.json({ success: true, document: inserted.data }, { status: 201 });
}
