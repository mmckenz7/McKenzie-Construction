import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260801120000_schedule_request_notes_column_contract.sql",
  "utf8",
);
const transactionTest = readFileSync(
  "supabase/tests/schedule_request_notes_column_contract.sql",
  "utf8",
);

test("schedule activity logging uses notes_original and preserves trigger attributes", () => {
  const activityFunction = migration.match(
    /create or replace function public\.log_schedule_request_activity\(\)([\s\S]*?)create or replace function public\.prevent_schedule_response_overwrite/i,
  )?.[1];

  assert.ok(activityFunction);
  assert.match(activityFunction, /returns trigger/i);
  assert.match(activityFunction, /security definer/i);
  assert.match(activityFunction, /set search_path = public/i);
  assert.match(activityFunction, /new\.notes_original/i);
  assert.doesNotMatch(activityFunction, /new\.notes(?!_original)/i);
});

test("schedule overwrite protection compares notes_original as invoker", () => {
  const overwriteFunction = migration.match(
    /create or replace function public\.prevent_schedule_response_overwrite\(\)([\s\S]*?)commit;/i,
  )?.[1];

  assert.ok(overwriteFunction);
  assert.match(overwriteFunction, /returns trigger/i);
  assert.doesNotMatch(overwriteFunction, /security definer/i);
  assert.match(overwriteFunction, /set search_path = public/i);
  assert.match(overwriteFunction, /new\.notes_original[\s\S]*?old\.notes_original/i);
  assert.doesNotMatch(overwriteFunction, /(?:new|old)\.notes(?!_original)/i);
});

test("schedule RPC regression scenario succeeds, verifies activity, rejects replay, and rolls back", () => {
  assert.match(transactionTest, /^begin;/i);
  assert.match(transactionTest, /submit_schedule_request_by_token\(/i);
  assert.match(transactionTest, /schedule_response_submitted/i);
  assert.match(transactionTest, /activity_description is distinct from 'Schedule notes contract test'/i);
  assert.match(transactionTest, /already_submitted/i);
  assert.match(transactionTest, /rollback;\s*$/i);
});
