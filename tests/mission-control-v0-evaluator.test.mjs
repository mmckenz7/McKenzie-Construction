import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260810085000_mission_control_v0_evaluator.sql",
  "utf8",
);

test("V0 evaluator is guarded, transactional, and deterministic", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  for (const evaluator of [
    "evaluate_mission_control_proposal_signals",
    "evaluate_mission_control_proposal_follow_up_signals",
    "evaluate_mission_control_communication_signals",
  ]) {
    assert.match(migration, new RegExp(`to_regprocedure\\('public\\.${evaluator}\\(timestamptz\\)'\\)`, "i"));
    assert.match(migration, new RegExp(`public\\.${evaluator}\\(requested_as_of\\)`, "i"));
  }
  assert.doesNotMatch(migration, /openai|anthropic|language model|prompt|summary_text/i);
});

test("V0 evaluator serializes sweeps without broad table locks", () => {
  assert.match(migration, /pg_try_advisory_xact_lock\(hashtextextended\('mission_control_v0_evaluator', 0\)\)/i);
  assert.match(migration, /'reason', 'evaluation_already_running'/i);
  assert.doesNotMatch(migration, /lock\s+table|pg_advisory_lock\(/i);
  assert.match(migration, /'evaluated', true/i);
  assert.match(migration, /'rules', jsonb_build_object/i);
});

test("V0 evaluator is service-role only and scheduling-neutral", () => {
  assert.match(
    migration,
    /revoke all on function public\.evaluate_mission_control_v0\(timestamptz\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.evaluate_mission_control_v0\(timestamptz\)[\s\S]*?to service_role/i,
  );
  assert.match(migration, /Scheduling remains an external deployment concern/i);
  assert.doesNotMatch(migration, /cron|http|net\.|secret|authorization/i);
});
