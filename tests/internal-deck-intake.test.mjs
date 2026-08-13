import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260813120000_internal_deck_intake.sql",
  "utf8",
);
const route = readFileSync(
  "src/app/api/internal/deck-intakes/route.ts",
  "utf8",
);
const form = readFileSync("src/components/onsite-deck-intake-form.tsx", "utf8");
const page = readFileSync("src/app/sales/intake/deck/page.tsx", "utf8");
const customers = readFileSync("src/app/sales/customers/page.tsx", "utf8");
const missionControl = readFileSync(
  "src/components/mission-control-dashboard.tsx",
  "utf8",
);

test("internal Deck intake is one idempotent database transaction", () => {
  assert.match(migration, /create table public\.internal_deck_intakes/);
  assert.match(migration, /unique \(company_id, idempotency_key\)/);
  assert.match(
    migration,
    /create or replace function public\.create_internal_deck_intake/,
  );
  assert.match(
    migration,
    /insert into public\.leads[\s\S]*insert into public\.customers[\s\S]*insert into public\.estimates[\s\S]*insert into public\.internal_deck_intakes/,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.(?:tasks|lead_tasks|email_drafts)/,
  );
});

test("intake replay evidence is immutable, RPC-only, and actor bound", () => {
  assert.match(migration, /security definer/i);
  assert.match(
    migration,
    /revoke all on table public\.internal_deck_intakes from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /before update or delete on public\.internal_deck_intakes/i,
  );
  assert.equal(
    (
      migration.match(
        /created_by_auth_user_id is distinct from requested_auth_user_id/g,
      ) ?? []
    ).length,
    2,
  );
});

test("RPC fails closed on tenant, access, permission, role, and features", () => {
  assert.match(
    migration,
    /get_effective_user_access\(requested_auth_user_id\)/,
  );
  assert.match(migration, /assert_single_company_fence_estimate_scope\(\)/);
  assert.match(migration, /portal_access'[\s\S]*sales/);
  assert.match(migration, /edit_prices/);
  assert.match(migration, /capture_site_visits/);
  assert.match(migration, /'owner', 'administrator', 'estimator'/);
  assert.match(migration, /effective_features[\s\S]*'guided_site_visits'/);
  assert.match(
    migration,
    /revoke all on function[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});

test("onsite record skips consultation and remains compatible with guided Deck capture", () => {
  assert.match(
    migration,
    /'not_requested', 'estimate_in_progress', 'internal_onsite'/,
  );
  assert.match(migration, /source_lead_id[\s\S]*created_lead_id/);
  assert.match(migration, /created_lead_id, created_customer_id[\s\S]*'draft'/);
  assert.match(migration, /'structured-estimate-v2-material-tax'/);
});

test("internal API authenticates and delegates the atomic write to the RPC", () => {
  assert.match(route, /getAuthenticatedAccess\(\)/);
  assert.match(route, /createUnauthorizedApiResponse/);
  assert.match(route, /\.rpc\(\s*"create_internal_deck_intake"/);
  assert.match(route, /idempotency_conflict/);
  assert.doesNotMatch(
    route,
    /\.from\("(?:leads|customers|estimates)"\)\.insert/,
  );
});

test("mobile form permits unknown email and opens the guided Deck estimate", () => {
  assert.match(form, /I don’t have the email yet/);
  assert.match(form, /email: emailUnknown \? null/);
  assert.match(form, /customerName[\s\S]*required/);
  assert.match(form, /name="phone"\s+required/);
  assert.match(form, /\?workflow=deck/);
  assert.match(form, /fixed inset-x-0 bottom-0/);
  assert.match(page, /OnsiteDeckIntakeForm/);
  assert.match(customers, /href="\/sales\/intake\/deck"/);
  assert.match(missionControl, /href="\/sales\/intake\/deck"/);
});
