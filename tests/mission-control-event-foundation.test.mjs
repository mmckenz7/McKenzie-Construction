import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260810072000_mission_control_event_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const contracts = readFileSync(
  "src/lib/mission-control/event-contracts.ts",
  "utf8",
);
const recorder = readFileSync(
  "src/lib/mission-control/record-business-event.ts",
  "utf8",
);

test("Mission Control foundation is additive and transactional", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /create table public\.business_events/i);
  assert.match(migration, /create table public\.mission_control_signals/i);
  assert.doesNotMatch(
    migration,
    /\b(?:alter|drop|truncate)\s+table\s+public\.(?:leads|estimates|estimate_proposals|communication_messages|projects|tasks)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:update|delete\s+from)\s+public\.(?:leads|estimates|estimate_proposals|communication_messages|projects|tasks)\b/i,
  );
});

test("events are company-scoped semantic facts with bounded metadata", () => {
  assert.match(
    migration,
    /company_id uuid not null references public\.company_settings\(id\) on delete restrict/i,
  );
  assert.match(
    migration,
    /Mission Control V0 requires exactly one company_settings row/i,
  );
  for (const column of [
    "event_name text not null",
    "event_version smallint not null",
    "occurred_at timestamptz not null",
    "recorded_at timestamptz not null",
    "actor_type text not null",
    "subject_type text not null",
    "subject_id uuid not null",
    "source text not null",
    "idempotency_key text not null",
    "correlation_id uuid not null",
    "metadata jsonb not null",
    "classification text not null",
  ]) {
    assert.ok(migration.includes(column), `missing ${column}`);
  }
  assert.match(
    migration,
    /jsonb_typeof\(metadata\) = 'object'/i,
  );
  assert.match(
    migration,
    /octet_length\(metadata::text\) <= 16384/i,
  );
  assert.match(
    migration,
    /'employee'[\s\S]*?'customer'[\s\S]*?'subcontractor'[\s\S]*?'vendor'[\s\S]*?'system'[\s\S]*?'integration'/i,
  );
});

test("event identity is idempotent and payload collisions fail closed", () => {
  assert.match(
    migration,
    /unique \(company_id, source, idempotency_key\)/i,
  );
  assert.match(
    migration,
    /on conflict \(company_id, source, idempotency_key\) do nothing/i,
  );
  assert.match(
    migration,
    /idempotency key was reused with a different immutable payload/i,
  );
  assert.match(
    migration,
    /event_record\.event_name is distinct from requested_event_name[\s\S]*?event_record\.metadata is distinct from resolved_metadata/i,
  );
  assert.match(
    migration,
    /Causation event is missing or belongs to another company/i,
  );
});

test("business events are append-only and writable only through the service emitter", () => {
  assert.match(
    migration,
    /before update or delete on public\.business_events[\s\S]*?prevent_business_event_mutation/i,
  );
  assert.match(
    migration,
    /business_events is append-only; record a correction event instead/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.business_events[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.business_events to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all)[^;]*public\.business_events/i,
  );
  assert.match(
    migration,
    /create or replace function public\.record_business_event[\s\S]*?security definer/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_business_event[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.record_business_event[\s\S]*?to (?:public|anon|authenticated)/i,
  );
});

test("events and signals are RLS-protected with tenant-first indexes", () => {
  for (const table of [
    "business_events",
    "mission_control_signals",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} force row level security`,
        "i",
      ),
    );
  }
  assert.match(
    migration,
    /business_events_company_occurred_idx[\s\S]*?\(company_id, occurred_at desc, id desc\)/i,
  );
  assert.match(
    migration,
    /business_events_subject_timeline_idx[\s\S]*?company_id,[\s\S]*?subject_type,[\s\S]*?subject_id/i,
  );
  assert.match(
    migration,
    /mission_control_signals_company_dedupe_key[\s\S]*?unique \(company_id, dedupe_key\)/i,
  );
});

test("signals have deterministic lifecycle, evidence, and no delete grant", () => {
  assert.match(
    migration,
    /status in \([\s\S]*?'open'[\s\S]*?'acknowledged'[\s\S]*?'snoozed'[\s\S]*?'resolved'[\s\S]*?'dismissed'/i,
  );
  assert.match(
    migration,
    /status = 'snoozed'[\s\S]*?snoozed_until is not null/i,
  );
  assert.match(
    migration,
    /status in \('resolved', 'dismissed'\)[\s\S]*?resolved_at is not null/i,
  );
  assert.match(
    migration,
    /status <> 'dismissed'[\s\S]*?nullif\(btrim\(resolution_reason\), ''\) is not null/i,
  );
  assert.match(
    migration,
    /evidence jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(
    migration,
    /rule_output jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(
    migration,
    /grant select, insert, update on table public\.mission_control_signals[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:delete|all)[^;]*mission_control_signals/i,
  );
});

test("the application contract registry covers only the narrow V0 producer set", () => {
  const eventNames = [
    ...contracts.matchAll(/^  "([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)": \{$/gm),
  ].map((match) => match[1]);

  assert.deepEqual(new Set(eventNames), new Set([
    "estimating.proposal_issued",
    "estimating.proposal_access_observed",
    "estimating.proposal_accepted",
    "estimating.proposal_declined",
    "estimating.proposal_expired",
    "estimating.proposal_revoked",
    "estimating.proposal_reissued",
    "estimating.pricing_review_requested",
    "estimating.pricing_review_completed",
    "communication.customer_email_received",
    "communication.employee_email_sent",
    "communication.email_delivery_confirmed",
    "communication.email_bounced",
  ]));

  assert.doesNotMatch(
    contracts,
    /allowedMetadataKeys:\s*\[[\s\S]{0,300}?"(?:body|public_token|approval_token|authorization|raw_ip|user_agent)"/i,
  );
  assert.match(
    contracts,
    /Metadata key \$\{key\} is not allowed for \$\{draft\.eventName\}/,
  );
  assert.match(
    contracts,
    /classification does not match its registered contract/i,
  );
  assert.match(
    contracts,
    /metadata exceeds the 16 KiB contract limit/i,
  );
});

test("the server emitter validates contracts and maps the complete RPC boundary", () => {
  assert.match(recorder, /import "server-only"/);
  assert.match(
    recorder,
    /validateBusinessEventDraft\(draft\)/,
  );
  assert.match(
    recorder,
    /supabase\.rpc\(\s*"record_business_event"/,
  );

  for (const parameter of [
    "requested_event_name",
    "requested_event_version",
    "requested_occurred_at",
    "requested_actor_type",
    "requested_actor_id",
    "requested_actor_auth_user_id",
    "requested_subject_type",
    "requested_subject_id",
    "requested_project_id",
    "requested_lead_id",
    "requested_customer_id",
    "requested_source",
    "requested_source_event_id",
    "requested_idempotency_key",
    "requested_correlation_id",
    "requested_causation_event_id",
    "requested_metadata",
    "requested_classification",
  ]) {
    assert.ok(recorder.includes(parameter), `missing RPC parameter ${parameter}`);
  }

  assert.match(
    recorder,
    /The business event could not be recorded\./,
  );
  assert.doesNotMatch(
    recorder,
    /error\.message|error\.details|error\.hint/,
  );
  assert.match(
    recorder,
    /The business event emitter returned an invalid response\./,
  );
});

test("new PostgreSQL identifiers stay within the 63-byte limit", () => {
  const identifiers = [
    ...migration.matchAll(
      /(?:add constraint|create (?:unique )?index|create trigger|create (?:or replace )?function)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    ),
  ].map((match) => match[1]);

  assert.ok(identifiers.length > 0);
  for (const identifier of identifiers) {
    assert.ok(
      Buffer.byteLength(identifier, "utf8") <= 63,
      `${identifier} exceeds 63 bytes`,
    );
  }
});
