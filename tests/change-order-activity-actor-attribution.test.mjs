import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260801130000_change_order_public_response_actor_attribution.sql",
  "utf8",
);

const functionBody = migration.match(
  /create or replace function public\.log_change_order_activity\(\)([\s\S]*?)\$function\$;/i,
)?.[1];

assert.ok(functionBody, "migration must replace log_change_order_activity()");

test("migration replaces only the activity function and preserves its metadata contract", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.equal(
    [...migration.matchAll(/create or replace function/gi)].length,
    1,
  );
  assert.match(functionBody, /returns trigger/i);
  assert.match(functionBody, /language plpgsql/i);
  assert.match(functionBody, /security definer/i);
  assert.match(functionBody, /set search_path to 'public'/i);
  assert.doesNotMatch(migration, /\b(?:drop|alter|grant|revoke)\b/i);
  assert.doesNotMatch(migration, /\b(?:create|drop)\s+trigger\b/i);
});

test("public approve and decline transitions require the matching response snapshot", () => {
  assert.match(functionBody, /old\.status is distinct from new\.status/i);
  assert.match(functionBody, /new\.status in \('approved', 'declined'\)/i);
  assert.match(functionBody, /from public\.project_change_order_responses as response/i);
  assert.match(functionBody, /response\.change_order_id = new\.id/i);
  assert.match(functionBody, /response\.project_id = new\.project_id/i);
  assert.match(functionBody, /response\.response = new\.status/i);
  assert.match(functionBody, /response\.customer_name = new\.approved_by_name/i);
  assert.match(functionBody, /response\.approval_token = new\.approval_token/i);
  assert.match(functionBody, /response\.acknowledged_terms is true/i);
  assert.match(
    functionBody,
    /response\.submitted_at = case new\.status[\s\S]*?when 'approved' then new\.approved_at[\s\S]*?when 'declined' then new\.declined_at/i,
  );
});

test("matched public responses use customer attribution with no app user", () => {
  assert.match(
    functionBody,
    /when is_public_customer_response then 'customer'[\s\S]*?else 'office'/i,
  );
  assert.match(
    functionBody,
    /when is_public_customer_response then null[\s\S]*?else new\.created_by/i,
  );
});

test("office approve and decline transitions retain office attribution", () => {
  assert.match(functionBody, /is_public_customer_response boolean := false/i);
  assert.match(
    functionBody,
    /when is_public_customer_response then 'customer'[\s\S]*?else 'office'/i,
  );
  assert.match(
    functionBody,
    /when is_public_customer_response then null[\s\S]*?else new\.created_by/i,
  );
});

test("opened events and unrelated activity behavior remain outside this replacement", () => {
  assert.doesNotMatch(functionBody, /change_order_approval_opened/i);
  assert.match(functionBody, /when 'completed'[\s\S]*?'change_order_completed'/i);
  assert.match(functionBody, /else 'change_order_updated'/i);
  assert.match(functionBody, /when tg_op = 'INSERT'[\s\S]*?then new\.id[\s\S]*?else gen_random_uuid\(\)/i);
});
