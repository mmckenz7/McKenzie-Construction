import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260810073000_ai_estimator_shadow_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");

const tables = [
  "ai_estimator_cases",
  "ai_estimator_assets",
  "ai_estimator_processing_runs",
  "ai_estimator_model_calls",
  "ai_estimator_transcripts",
  "ai_estimator_transcript_segments",
  "ai_estimator_draft_revisions",
  "ai_estimator_facts",
  "ai_estimator_fact_values",
  "ai_estimator_review_events",
  "ai_estimator_applications",
];

test("AI Estimator shadow foundation is additive and transactional", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
  }
  assert.doesNotMatch(
    migration,
    /\b(?:alter|drop|truncate)\s+table\s+public\.(?:leads|customers|projects|estimates|estimate_sections|estimate_line_items|estimate_proposals|estimate_contract_preparations)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:leads|customers|projects|estimates|estimate_sections|estimate_line_items|estimate_proposals|estimate_contract_preparations)\b/i,
  );
});

test("every shadow table is company-scoped, RLS-forced, and browser-inaccessible", () => {
  for (const table of tables) {
    const tableStart = migration.indexOf(`create table public.${table}`);
    assert.notEqual(tableStart, -1, `missing ${table}`);
    const tableEnd = migration.indexOf(";", tableStart);
    const definition = migration.slice(tableStart, tableEnd);
    assert.match(
      definition,
      /company_id uuid not null references public\.company_settings\(id\) on delete restrict/i,
      `${table} is not company-scoped`,
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.%I enable row level security`, "i"),
    );
  }
  assert.match(migration, /force row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.%I from public, anon, authenticated, service_role/i,
  );
});

test("case context is validated without mutating business lifecycle", () => {
  assert.match(migration, /enforce_ai_estimator_case_context/);
  assert.match(migration, /customer does not belong to the case lead/);
  assert.match(migration, /project does not belong to the case customer/);
  assert.match(migration, /target estimate does not belong to the case lead/);
  assert.match(migration, /cannot be applied without a successful application/);
  assert.doesNotMatch(migration, /set\s+status\s*=\s*'(?:sold|converted|accepted|in_progress)'/i);
});

test("AI facts cannot claim verification or money authority", () => {
  assert.match(
    migration,
    /ai_estimator_facts_verification_check[\s\S]*?'high_confidence'[\s\S]*?'estimated'[\s\S]*?'unverified'/i,
  );
  assert.doesNotMatch(
    migration.match(/create table public\.ai_estimator_facts \([\s\S]*?\n\);/)?.[0] ?? "",
    /\b(?:cost|price|markup|margin|overhead|tax|discount|contract_value)\b/i,
  );
  assert.match(
    migration,
    /source_type = 'derived'[\s\S]*?jsonb_typeof\(derivation\) = 'object'/i,
  );
  assert.match(
    migration,
    /source_type <> 'derived'[\s\S]*?jsonb_array_length\(evidence\) > 0/i,
  );
});

test("accuracy values and review history are append-only", () => {
  for (const stage of [
    "ai_original",
    "human_corrected",
    "final_estimate",
    "final_actual",
  ]) {
    assert.ok(migration.includes(`'${stage}'`), `missing ${stage}`);
  }
  for (const table of [
    "ai_estimator_transcripts",
    "ai_estimator_transcript_segments",
    "ai_estimator_draft_revisions",
    "ai_estimator_facts",
    "ai_estimator_fact_values",
    "ai_estimator_review_events",
  ]) {
    assert.match(
      migration,
      new RegExp(`before update or delete on public\\.${table}[\\s\\S]*?prevent_ai_estimator_immutable_mutation`, "i"),
    );
  }
  assert.match(migration, /where value_stage = 'ai_original'/i);
  assert.match(
    migration,
    /foreign key \(supersedes_value_id, fact_id, case_id, company_id\)[\s\S]*?references public\.ai_estimator_fact_values\(id, fact_id, case_id, company_id\)/i,
  );
});

test("applications are audit-only and fenced to structured drafts", () => {
  assert.match(migration, /expected_calculation_revision integer not null/i);
  assert.match(migration, /approved_review_hash text not null/i);
  assert.match(migration, /preview_hash text not null/i);
  assert.match(migration, /application target does not match its case/i);
  assert.match(migration, /applications require a structured draft estimate/i);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.(?:apply|import)_ai_estimator/i);
  assert.doesNotMatch(migration, /insert into public\.estimate_(?:sections|line_items)/i);
});

test("worker leases are atomic, bounded, owner-checked, and service-only", () => {
  assert.match(
    migration,
    /claim_ai_estimator_processing_run[\s\S]*?for update skip locked/i,
  );
  assert.match(
    migration,
    /status = 'processing'[\s\S]*?lease_owner = btrim\(requested_worker_id\)[\s\S]*?attempt_count = attempt_count \+ 1/i,
  );
  assert.match(
    migration,
    /requested_lease_seconds not between 30 and 900/i,
  );
  assert.match(
    migration,
    /heartbeat_ai_estimator_processing_run[\s\S]*?lease_owner = btrim\(requested_worker_id\)[\s\S]*?lease_expires_at > now\(\)/i,
  );
  assert.match(
    migration,
    /fail_ai_estimator_processing_run[\s\S]*?failure_code = requested_failure_code[\s\S]*?lease_owner = null/i,
  );
  for (const name of [
    "claim_ai_estimator_processing_run",
    "heartbeat_ai_estimator_processing_run",
    "fail_ai_estimator_processing_run",
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to service_role`, "i"),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to (?:public|anon|authenticated)`, "i"),
    );
  }
});

test("cross-record provenance uses composite case/company foreign keys", () => {
  assert.match(
    migration,
    /foreign key \(transcript_id, source_asset_id, case_id, company_id\)[\s\S]*?references public\.ai_estimator_transcripts/i,
  );
  assert.match(
    migration,
    /foreign key \(draft_revision_id, processing_run_id, case_id, company_id\)[\s\S]*?references public\.ai_estimator_draft_revisions/i,
  );
  assert.match(
    migration,
    /foreign key \(fact_id, case_id, company_id\)[\s\S]*?references public\.ai_estimator_facts/i,
  );
});

test("new PostgreSQL identifiers fit the 63-byte limit", () => {
  const identifiers = [
    ...migration.matchAll(
      /(?:constraint|create (?:unique )?index|create trigger|create (?:or replace )?function)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
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
