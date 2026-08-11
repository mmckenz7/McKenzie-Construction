import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260810082000_mission_control_proposal_signals.sql",
  "utf8",
);

test("proposal signal migration is guarded, additive, and transactional", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(
    migration,
    /Mission Control proposal event foundations must be applied first/i,
  );
  assert.match(
    migration,
    /add column mission_control_proposal_expiry_warning_hours integer[\s\S]*?not null default 24/i,
  );
  assert.match(
    migration,
    /between 1 and 168/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:drop|truncate)\s+table\b|\bdelete\s+from\b/i,
  );
});

test("scheduled expiration does not depend on customer token access", () => {
  assert.match(
    migration,
    /function public\.expire_due_estimate_proposals/i,
  );
  assert.match(
    migration,
    /proposal\.status in \('issued', 'viewed'\)[\s\S]*?proposal\.expires_at <= requested_as_of/i,
  );
  assert.match(
    migration,
    /for update skip locked/i,
  );
  assert.match(
    migration,
    /set status = 'expired'/i,
  );
  assert.match(
    migration,
    /'estimate_pricing_review'/i,
  );
  assert.match(
    migration,
    /where not exists \([\s\S]*?existing_task\.status in \('open', 'in_progress'\)/i,
  );
  assert.match(
    migration,
    /lead_record\.is_active is distinct from true[\s\S]*?lead_record\.lead_status = 'lost'/i,
  );
});

test("proposal signals are deterministic, versioned, and evidence backed", () => {
  for (const rule of [
    "estimating.proposal_expiring_soon",
    "estimating.proposal_pricing_review_required",
  ]) {
    assert.ok(migration.includes(rule), `missing ${rule}`);
  }
  assert.match(
    migration,
    /join lateral \([\s\S]*?from public\.business_events/i,
  );
  assert.match(
    migration,
    /'event_ids', jsonb_build_array\(/i,
  );
  assert.match(
    migration,
    /'proposal_generation', proposal\.issue_generation/i,
  );
  assert.match(
    migration,
    /'evaluated_at', requested_as_of/i,
  );
  assert.doesNotMatch(
    migration,
    /openai|anthropic|language model|prompt|summary_text/i,
  );
});

test("unknown event evidence suppresses rather than invents a signal", () => {
  assert.match(
    migration,
    /join lateral \([\s\S]*?event\.event_name in \([\s\S]*?'estimating\.proposal_issued'[\s\S]*?'estimating\.proposal_reissued'[\s\S]*?\) as issue_event on true/i,
  );
  assert.match(
    migration,
    /join lateral \([\s\S]*?event\.event_name = 'estimating\.proposal_expired'[\s\S]*?\) as expired_event on true/i,
  );
  assert.doesNotMatch(
    migration,
    /coalesce\([^)]*(?:event\.id|issue_event\.id|expired_event\.id)[^)]*gen_random_uuid/i,
  );
});

test("signal lifecycle preserves acknowledgement, snooze, and dismissal", () => {
  assert.match(
    migration,
    /on conflict \(company_id, dedupe_key\) do update/i,
  );
  assert.match(
    migration,
    /mission_control_signals\.status = 'dismissed'[\s\S]*?then 'dismissed'/i,
  );
  assert.match(
    migration,
    /mission_control_signals\.status = 'acknowledged'[\s\S]*?then 'acknowledged'/i,
  );
  assert.match(
    migration,
    /mission_control_signals\.status = 'snoozed'[\s\S]*?snoozed_until > requested_as_of[\s\S]*?then 'snoozed'/i,
  );
  assert.match(
    migration,
    /status = 'resolved'[\s\S]*?resolution_reason = 'proposal_no_longer_expiring_soon'/i,
  );
  assert.match(
    migration,
    /resolution_reason = 'proposal_no_longer_requires_pricing_review'/i,
  );
  assert.match(
    migration,
    /evaluation time cannot move backwards/i,
  );
});

test("proposal signal functions are service-role only", () => {
  for (const name of [
    "expire_due_estimate_proposals",
    "evaluate_mission_control_proposal_signals",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${name}\\(timestamptz\\)[\\s\\S]*?from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${name}\\(timestamptz\\)[\\s\\S]*?to service_role`,
        "i",
      ),
    );
  }
});
