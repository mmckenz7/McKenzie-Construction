import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260810084000_mission_control_proposal_follow_up.sql",
  "utf8",
);
const accessRoute = readFileSync(
  "src/app/api/estimate-proposals/[token]/access/route.ts",
  "utf8",
);
const publicPage = readFileSync(
  "src/app/estimate/[token]/page.tsx",
  "utf8",
);

test("proposal follow-up settings and migration are bounded and additive", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /mission_control_proposal_follow_up_hours integer not null default 72/i);
  assert.match(migration, /mission_control_proposal_follow_up_accesses integer not null default 2/i);
  assert.match(migration, /follow_up_hours between 1 and 720/i);
  assert.match(migration, /follow_up_accesses between 1 and 10/i);
  assert.doesNotMatch(migration, /\b(?:drop|truncate)\s+table\b|\bdelete\s+from\b/i);
});

test("browser confirmation is idempotent and never claims verified human identity", () => {
  assert.match(migration, /function public\.confirm_estimate_proposal_browser_access/i);
  assert.match(migration, /client_signal,[\s\S]*?suspected_automated[\s\S]*?'browser_confirmation',[\s\S]*?false/i);
  assert.match(migration, /on conflict \(access_id\) do nothing/i);
  assert.match(migration, /access identity was reused for another fact/i);
  assert.match(migration, /without claiming a verified customer identity/i);
  assert.match(accessRoute, /enforcePublicTokenRateLimit/);
  assert.match(accessRoute, /isPublicTokenBodyTooLarge/);
  assert.match(accessRoute, /confirm_estimate_proposal_browser_access/);
  assert.match(accessRoute, /publicTokenJson/);
  assert.doesNotMatch(accessRoute, /error\.message|error\.details|error\.hint/);
  assert.match(publicPage, /crypto\.randomUUID\(\)/);
  assert.match(publicPage, /estimate-proposals\/\$\{encodeURIComponent\(token\)\}\/access/);
});

test("proposal follow-up requires current-generation issue and access event evidence", () => {
  assert.match(migration, /estimating\.proposal_follow_up_opportunity/i);
  assert.match(migration, /event_name in \([\s\S]*?'estimating\.proposal_issued'[\s\S]*?'estimating\.proposal_reissued'/i);
  assert.match(migration, /event_name = 'estimating\.proposal_access_observed'/i);
  assert.match(migration, /access\.issue_generation = proposal\.issue_generation/i);
  assert.match(migration, /access\.client_signal = 'browser_confirmation'/i);
  assert.match(migration, /access\.suspected_automated = false/i);
  assert.match(migration, /access\.occurred_at <= requested_as_of/i);
  assert.match(migration, /proposal\.issued_at <= requested_as_of - make_interval\(hours => follow_up_hours\)/i);
  assert.match(migration, /'event_ids', jsonb_build_array\(qualifying\.issue_event_id\) \|\| qualifying\.access_event_ids/i);
  assert.match(migration, /'verified_human_view', false/i);
  assert.doesNotMatch(migration, /openai|anthropic|language model|prompt|summary_text/i);
});

test("proposal follow-up lifecycle is deterministic and service-role only", () => {
  assert.match(migration, /on conflict \(company_id, dedupe_key\) do update/i);
  assert.match(migration, /status = 'dismissed'[\s\S]*?then 'dismissed'/i);
  assert.match(migration, /status = 'acknowledged'[\s\S]*?then 'acknowledged'/i);
  assert.match(migration, /snoozed_until > requested_as_of[\s\S]*?then 'snoozed'/i);
  assert.match(migration, /resolution_reason = 'proposal_no_longer_needs_follow_up'/i);
  assert.match(migration, /evaluation time cannot move backwards/i);
  for (const signature of [
    "confirm_estimate_proposal_browser_access\\(uuid, uuid\\)",
    "evaluate_mission_control_proposal_follow_up_signals\\(timestamptz\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to service_role`, "i"));
  }
});
