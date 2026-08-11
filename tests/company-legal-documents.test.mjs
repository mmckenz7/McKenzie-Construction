import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260810100000_company_legal_documents.sql", "utf8");
const route = readFileSync("src/app/api/company-legal-documents/route.ts", "utf8");
const itemRoute = readFileSync("src/app/api/company-legal-documents/[documentId]/route.ts", "utf8");
const downloadRoute = readFileSync("src/app/api/company-legal-documents/[documentId]/download/route.ts", "utf8");
const manager = readFileSync("src/components/company-legal-documents-manager.tsx", "utf8");

test("legal documents are company scoped, private, versioned, and service-role only", () => {
  assert.match(migration, /company_id uuid not null references public\.company_settings/);
  assert.match(migration, /version_label text not null/);
  assert.match(migration, /'company-legal-documents'[\s\S]*?false/);
  assert.match(migration, /revoke all on table public\.company_legal_documents from public, anon, authenticated/);
  assert.match(migration, /unique index[\s\S]*?company_id, document_type/i);
});

test("the boilerplate is visibly sandbox-only and cannot claim legal review", () => {
  assert.match(migration, /BETA TEST CONSTRUCTION AGREEMENT — NOT ATTORNEY REVIEWED/);
  assert.match(migration, /Live DocuSign sending remains blocked/);
  assert.match(manager, /only for sandbox workflow testing/);
  assert.match(manager, /cannot be used for live DocuSign sending/);
});

test("uploads are management authorized and restrict file type and size", () => {
  assert.match(route, /hasManagementAccess/);
  assert.match(route, /MAX_FILE_SIZE = 10 \* 1024 \* 1024/);
  assert.match(route, /application\/pdf/);
  assert.match(route, /openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(route, /safeFileName/);
  assert.match(route, /get_effective_user_access/);
  assert.match(route, /created_by_app_user_id: checked\.access!\.appUserId/);
  assert.doesNotMatch(route, /created_by_app_user_id: checked\.access!\.teamMember\.id/);
});

test("document management preserves auditability instead of deleting records", () => {
  assert.match(itemRoute, /action === "archive"/);
  assert.doesNotMatch(itemRoute, /\.delete\(/);
  assert.match(itemRoute, /set_company_legal_document_default/);
  assert.match(downloadRoute, /createSignedUrl/);
  assert.match(itemRoute, /\.eq\("company_id", currentCompanyId\)/);
  assert.match(downloadRoute, /\.eq\("company_id", currentCompanyId\)/);
});
