import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260810050000_estimate_contract_preparation.sql", "utf8");
const docusignMigration = readFileSync("supabase/migrations/20260810090000_docusign_contract_lifecycle.sql", "utf8");
const route = readFileSync("src/app/api/estimates/[estimateId]/contract-preparation/route.ts", "utf8");
const sendRoute = readFileSync("src/app/api/estimates/[estimateId]/contract-preparation/send/route.ts", "utf8");
const webhookRoute = readFileSync("src/app/api/contracts/webhooks/docusign/route.ts", "utf8");
const card = readFileSync("src/components/estimates/contract-preparation.tsx", "utf8");
const projectRoute = readFileSync("src/app/api/projects/route.ts", "utf8");

test("contract preparation is separate from estimate acceptance and project creation", () => {
  assert.match(migration, /estimate_contract_preparations/);
  assert.match(migration, /status in \('draft', 'ready_for_signature', 'sent_for_signature', 'signed', 'void'\)/);
  assert.match(migration, /legal_terms_status in \('not_configured', 'draft', 'approved'\)/);
  assert.match(migration, /does not authorize work or create a project/i);
  assert.doesNotMatch(projectRoute, /estimate_contract_preparations/);
});

test("DocuSign sending is claimed atomically and requires approved legal terms", () => {
  assert.match(docusignMigration, /claim_estimate_contract_signature_send/);
  assert.match(docusignMigration, /status <> 'ready_for_signature'/);
  assert.match(docusignMigration, /legal_terms_status <> 'approved'/);
  assert.match(docusignMigration, /status = 'sending'/);
  assert.match(sendRoute, /claim_estimate_contract_signature_send/);
  assert.match(sendRoute, /complete_estimate_contract_signature_send/);
  assert.match(sendRoute, /release_estimate_contract_signature_send/);
});

test("verified DocuSign events are idempotent and cannot create projects", () => {
  assert.match(webhookRoute, /verifyDocusignConnectSignature/);
  assert.match(webhookRoute, /record_docusign_contract_event/);
  assert.match(docusignMigration, /unique \(provider, provider_event_id\)/i);
  assert.match(docusignMigration, /DocuSign event idempotency conflict/);
  assert.doesNotMatch(`${webhookRoute}\n${docusignMigration}`, /insert into public\.projects|from\("projects"\)/);
});

test("only an accepted estimate can create a customer-safe contract package", () => {
  assert.match(route, /estimate\?\.status !== "accepted"/);
  assert.match(route, /buildEstimateCustomerDocument\(state, calculation\)/);
  assert.match(route, /work_authorized: false/);
  assert.match(route, /project_creation_authorized: false/);
  assert.doesNotMatch(route, /status:\s*"converted"/);
  assert.doesNotMatch(route, /\.from\("projects"\)/);
});

test("the UI clearly labels acceptance as nonbinding and locks signature work", () => {
  assert.match(card, /nonbinding intent to proceed/);
  assert.match(card, /Work is not authorized/);
  assert.match(card, /Legal review required/);
  assert.doesNotMatch(card, /Send contract|Sign contract/);
});
