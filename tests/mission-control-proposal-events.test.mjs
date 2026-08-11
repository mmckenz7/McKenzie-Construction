import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260810081000_mission_control_proposal_events.sql",
  "utf8",
);
const publicRoute = readFileSync(
  "src/app/api/estimate-proposals/[token]/route.ts",
  "utf8",
);

test("proposal event migration is additive, guarded, and transactional", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(
    migration,
    /Mission Control event foundation must be applied first/i,
  );
  assert.match(
    migration,
    /add column issue_generation integer not null default 1/i,
  );
  assert.match(
    migration,
    /add column revoked_by_app_user_id uuid references public\.app_users\(id\) on delete set null/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:drop|truncate)\s+table\b|\bdelete\s+from\b/i,
  );
});

test("proposal generations advance only on a real reissue lifecycle", () => {
  assert.match(
    migration,
    /old\.status in \('expired', 'revoked'\)[\s\S]*?new\.status = 'issued'[\s\S]*?new\.issue_generation := old\.issue_generation \+ 1/i,
  );
  assert.match(
    migration,
    /Proposal issue generation is managed by the lifecycle/i,
  );
  assert.match(
    migration,
    /Preexisting rows begin at instrumentation generation 1; this is not a reconstructed historical issue count/i,
  );
});

test("proposal accesses are append-only observations, not verified human views", () => {
  assert.match(
    migration,
    /create table public\.estimate_proposal_accesses/i,
  );
  assert.match(migration, /access_id uuid not null unique/i);
  assert.match(
    migration,
    /client_signal in \('server_request', 'browser_confirmation'\)/i,
  );
  assert.match(
    migration,
    /A server request does not prove which person viewed the proposal/i,
  );
  assert.match(
    migration,
    /before update or delete on public\.estimate_proposal_accesses/i,
  );
  assert.match(
    migration,
    /grant select on table public\.estimate_proposal_accesses to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all)[^;]*estimate_proposal_accesses/i,
  );
  assert.doesNotMatch(
    migration.match(/create table public\.estimate_proposal_accesses[\s\S]*?;\n\ncomment on table/)?.[0] ?? "",
    /\b(?:ip|user_agent|email|token)\b/i,
  );
});

test("only semantic proposal transitions produce versioned business events", () => {
  for (const eventName of [
    "estimating.proposal_issued",
    "estimating.proposal_reissued",
    "estimating.proposal_access_observed",
    "estimating.proposal_accepted",
    "estimating.proposal_declined",
    "estimating.proposal_expired",
    "estimating.proposal_revoked",
  ]) {
    assert.ok(migration.includes(eventName), `missing ${eventName}`);
  }

  assert.match(
    migration,
    /perform public\.record_business_event\(/i,
  );
  assert.match(
    migration,
    /after insert or update of status on public\.estimate_proposals/i,
  );
  assert.doesNotMatch(
    migration,
    /estimating\.proposal_(?:updated|edited)|row_updated|metadata_changed/i,
  );
});

test("proposal event actors are attributed without guessing", () => {
  assert.match(
    migration,
    /event_actor_type := 'employee'[\s\S]*?event_actor_id := new\.created_by_app_user_id/i,
  );
  assert.match(
    migration,
    /event_actor_type := 'customer'[\s\S]*?event_actor_id := new\.customer_id/i,
  );
  assert.match(
    migration,
    /event_actor_type := 'system'[\s\S]*?event_actor_id := null/i,
  );
  assert.match(
    migration,
    /revoked_by_app_user_id = requested_app_user_id/i,
  );
  assert.match(
    migration,
    /'estimating\.proposal_access_observed'[\s\S]*?'integration'/i,
  );
});

test("public GET supplies one retry-stable access identity to the overloaded RPC", () => {
  assert.match(publicRoute, /import \{ randomUUID \} from "node:crypto"/);
  const getHandler = publicRoute.match(
    /export async function GET[\s\S]*?export async function POST/,
  )?.[0] ?? "";
  assert.ok(
    getHandler.indexOf("enforcePublicTokenRateLimit") <
      getHandler.indexOf("randomUUID()"),
  );
  assert.ok(
    getHandler.indexOf("UUID.test(token)") <
      getHandler.indexOf("randomUUID()"),
  );
  assert.match(
    getHandler,
    /requested_token: token,[\s\S]*?requested_access_id: randomUUID\(\)/,
  );
  assert.match(
    migration,
    /function public\.get_estimate_proposal_by_token\(\s*requested_token uuid,\s*requested_access_id uuid/i,
  );
  assert.match(
    migration,
    /on conflict \(access_id\) do nothing/i,
  );
});

test("new proposal functions and trigger helpers retain least privilege", () => {
  for (const helper of [
    "advance_estimate_proposal_issue_generation",
    "prevent_estimate_proposal_access_mutation",
    "log_estimate_proposal_business_event",
    "log_estimate_proposal_access_business_event",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${helper}\\(\\)[\\s\\S]*?from public, anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  assert.match(
    migration,
    /revoke all on function public\.get_estimate_proposal_by_token\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_estimate_proposal_by_token\(uuid, uuid\)[\s\S]*?to service_role/i,
  );
});
