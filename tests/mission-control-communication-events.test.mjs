import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260810083000_mission_control_communication_events.sql",
  "utf8",
);
const contracts = readFileSync(
  "src/lib/mission-control/event-contracts.ts",
  "utf8",
);

test("communication instrumentation is selective, additive, and transactional", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(
    migration,
    /after insert or update of status, metadata on public\.communication_messages/i,
  );
  assert.doesNotMatch(
    migration,
    /after (?:insert|update|delete) on public\.communication_(?:threads|mailboxes)/i,
  );
  assert.doesNotMatch(migration, /\b(?:drop|truncate)\s+table\b|\bdelete\s+from\b/i);
});

test("only authoritative communication transitions produce facts", () => {
  for (const eventName of [
    "communication.customer_email_received",
    "communication.employee_email_sent",
    "communication.email_delivery_confirmed",
    "communication.email_bounced",
  ]) {
    assert.ok(migration.includes(eventName), `missing ${eventName}`);
    assert.ok(contracts.includes(`\"${eventName}\"`), `missing contract ${eventName}`);
  }
  assert.match(migration, /tg_op = 'INSERT'[\s\S]*?direction = 'inbound'[\s\S]*?status = 'received'/i);
  assert.match(migration, /provider_event_type = 'email\.delivered'/i);
  assert.match(migration, /provider_event_type in \('email\.bounced', 'email\.failed'\)/i);
  assert.doesNotMatch(migration, /email\.opened|subject', new\.subject|body', new\.body|sender', new\.sender|recipient', new\.recipient/i);
});

test("communication events preserve actor and provider attribution without content", () => {
  assert.match(migration, /resolved_actor_type := 'customer'/i);
  assert.match(migration, /sent_by_team_member_id/i);
  assert.match(migration, /app_user\.auth_user_id/i);
  assert.match(migration, /resolved_actor_type := 'integration'/i);
  assert.match(migration, /resolved_source := 'resend\.webhook'/i);
  assert.match(migration, /identity_matched/i);
  assert.doesNotMatch(
    migration,
    /jsonb_build_object\([\s\S]{0,600}?'(?:subject|body|sender|recipient|address)'/i,
  );
});

test("unanswered-reply signals require matched identity and event evidence", () => {
  assert.match(
    migration,
    /mission_control_customer_reply_hours integer not null default 24/i,
  );
  assert.match(migration, /between 1 and 168/i);
  assert.match(migration, /communication\.customer_reply_unanswered/i);
  assert.match(
    migration,
    /join public\.business_events as receipt_event[\s\S]*?event_name = 'communication\.customer_email_received'/i,
  );
  assert.match(
    migration,
    /mission_control_uuid_or_null\(message\.lead_id\) is not null[\s\S]*?thread\.customer_id is not null/i,
  );
  assert.match(migration, /'event_ids', jsonb_build_array\(qualifying\.receipt_event_id\)/i);
  assert.match(migration, /coalesce\(response\.sent_at, response\.created_at\) <= requested_as_of/i);
  assert.doesNotMatch(migration, /openai|anthropic|language model|prompt|summary_text/i);
});

test("communication signal lifecycle is idempotent and service-role only", () => {
  assert.match(migration, /on conflict \(company_id, dedupe_key\) do update/i);
  assert.match(migration, /status = 'dismissed'[\s\S]*?then 'dismissed'/i);
  assert.match(migration, /status = 'acknowledged'[\s\S]*?then 'acknowledged'/i);
  assert.match(migration, /snoozed_until > requested_as_of[\s\S]*?then 'snoozed'/i);
  assert.match(migration, /resolution_reason = 'customer_reply_no_longer_unanswered'/i);
  assert.match(migration, /evaluation time cannot move backwards/i);
  assert.match(
    migration,
    /revoke all on function public\.evaluate_mission_control_communication_signals\(timestamptz\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.evaluate_mission_control_communication_signals\(timestamptz\)[\s\S]*?to service_role/i,
  );
});
