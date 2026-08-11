import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260810110000_contract_legal_document_snapshot.sql", "utf8");
const route = readFileSync("src/app/api/estimates/[estimateId]/contract-preparation/route.ts", "utf8");
const uploadRoute = readFileSync("src/app/api/company-legal-documents/route.ts", "utf8");
const card = readFileSync("src/components/estimates/contract-preparation.tsx", "utf8");

test("contract preparations snapshot one exact legal-document version", () => {
  assert.match(migration, /legal_document_id uuid[\s\S]*?references public\.company_legal_documents/);
  assert.match(migration, /legal_document_snapshot jsonb/);
  assert.match(migration, /company-legal-document-snapshot-v1/);
  assert.match(migration, /legal_document_selected_by_app_user_id uuid[\s\S]*?references public\.app_users/);
});

test("uploaded legal documents record a byte-level SHA-256 digest", () => {
  assert.match(migration, /content_sha256 text/);
  assert.match(uploadRoute, /createHash\("sha256"\)\.update\(fileBytes\)\.digest\("hex"\)/);
  assert.match(uploadRoute, /content_sha256: contentSha256/);
});

test("only the current default construction contract can refresh editable preparations", () => {
  assert.match(route, /document_type", "construction_contract"/);
  assert.match(route, /\.eq\("status", "active"\)/);
  assert.match(route, /\.eq\("is_default", true\)/);
  assert.match(route, /\["draft", "ready_for_signature"\]/);
  assert.match(route, /\.is\("signature_envelope_id", null\)/);
});

test("signature readiness requires an attorney-reviewed snapshot", () => {
  assert.match(route, /legal_review_status === "attorney_reviewed"/);
  assert.match(route, /legal_terms_status: approved \? "approved" : "draft"/);
  assert.match(card, /selected version is attorney-reviewed/);
  assert.match(card, /refresh_legal_document/);
});

test("legal-document selection cannot authorize work or create projects", () => {
  assert.doesNotMatch(`${migration}\n${route}`, /insert into public\.projects|from\("projects"\)/);
  assert.match(migration, /does not send a signature envelope, create a project, or authorize work/);
});
