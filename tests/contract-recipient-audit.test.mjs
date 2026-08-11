import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260810120000_contract_recipient_audit.sql", "utf8");
const route = readFileSync("src/app/api/estimates/[estimateId]/contract-preparation/route.ts", "utf8");
const card = readFileSync("src/components/estimates/contract-preparation.tsx", "utf8");

test("recipient updates are service-role-only atomic database operations", () => {
  assert.match(migration, /create or replace function public\.update_estimate_contract_recipient/);
  assert.match(migration, /select \* into preparation[\s\S]*?for update/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /revoke all on function public\.update_estimate_contract_recipient[\s\S]*?public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.update_estimate_contract_recipient[\s\S]*?service_role/);
});

test("recipient details lock before a send claim or envelope can race the edit", () => {
  assert.match(migration, /status not in \('draft', 'ready_for_signature'\)/);
  assert.match(migration, /signature_send_attempt_id is not null/);
  assert.match(migration, /signature_envelope_id is not null/);
  assert.match(route, /signature_send_attempt_id,signature_envelope_id/);
  assert.match(route, /Contract preparation is locked after signature sending begins/);
});

test("every effective recipient change records actor and before-after state", () => {
  assert.match(migration, /estimate_contract_preparation_events/);
  assert.match(migration, /actor_app_user_id uuid not null references public\.app_users/);
  assert.match(migration, /previous_state jsonb not null/);
  assert.match(migration, /next_state jsonb not null/);
  assert.match(migration, /'recipient_updated'/);
  assert.match(migration, /preparation\.recipient_email/);
});

test("authorized reads project a bounded recipient-only audit history", () => {
  assert.match(route, /from\("estimate_contract_preparation_events"\)/);
  assert.match(route, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(route, /\.limit\(20\)/);
  assert.match(route, /function projectAuditEvent/);
  assert.match(route, /actorName/);
  assert.doesNotMatch(route, /auditEvents:\s*events\.data/);
});

test("ready-for-signature requires both approved legal terms and a recipient email", () => {
  assert.match(migration, /legal_terms_status = 'approved' and normalized_email is not null/);
  assert.match(migration, /status <> 'ready_for_signature'[\s\S]*?recipient_email is not null/);
  assert.match(route, /approved && recipientEmail \? "ready_for_signature" : "draft"/);
  assert.match(route, /function recipientEmail/);
  assert.match(card, /Recipient email required/);
});

test("the authorized route strictly accepts recipient fields and delegates to the audited RPC", () => {
  assert.match(route, /canSendProposals/);
  assert.match(route, /\["action", "recipientName", "recipientEmail"\]/);
  assert.match(route, /update_estimate_contract_recipient/);
  assert.match(route, /requested_app_user_id: checked\.auth!\.authorization!\.appUserId/);
  assert.doesNotMatch(route, /\.update\(\{\s*recipient_name/);
});

test("the UI supports pre-send correction without activating contract sending", () => {
  assert.match(card, /Save recipient/);
  assert.match(card, /recorded in the contract audit history/);
  assert.match(card, /signature sending has begun/);
  assert.match(card, /Recipient change history/);
  assert.match(card, /No recipient changes have been recorded/);
  assert.doesNotMatch(card, />Send contract<|>Sign contract</);
});

test("recipient editing cannot create projects, authorize work, or claim an executed record", () => {
  assert.doesNotMatch(`${migration}\n${route}`, /insert into public\.projects|from\("projects"\)/);
  assert.match(migration, /does not send an envelope, create a project, authorize work/);
  assert.match(migration, /not an executed contract record/);
});
