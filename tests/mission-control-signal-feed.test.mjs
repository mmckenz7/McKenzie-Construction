import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareMissionControlSignals,
  MISSION_CONTROL_V0_RULE_KEYS,
  parseMissionControlFeedLimit,
  toMissionControlSignalResponse,
} from "../src/lib/mission-control/signal-feed.ts";

const route = readFileSync(
  "src/app/api/mission-control/signals/route.ts",
  "utf8",
);

function signal(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    rule_key:
      "estimating.proposal_expiring_soon",
    rule_version: 1,
    subject_type: "proposal",
    subject_id:
      "22222222-2222-4222-8222-222222222222",
    status: "open",
    severity: "warning",
    first_detected_at:
      "2026-08-11T12:00:00.000Z",
    last_evaluated_at:
      "2026-08-11T13:00:00.000Z",
    due_at: "2026-08-12T12:00:00.000Z",
    assigned_to_id: null,
    acknowledged_at: null,
    snoozed_until: null,
    evidence: { proposal_id: "fact" },
    rule_output: { hours_remaining: 23 },
    updated_at: "2026-08-11T13:00:00.000Z",
    ...overrides,
  };
}

test("signal feed accepts only bounded integer limits", () => {
  assert.equal(parseMissionControlFeedLimit(null), 50);
  assert.equal(parseMissionControlFeedLimit(""), 50);
  assert.equal(parseMissionControlFeedLimit("1"), 1);
  assert.equal(parseMissionControlFeedLimit("100"), 100);

  for (const invalid of [
    "0",
    "101",
    "1.5",
    "-1",
    "abc",
  ]) {
    assert.equal(
      parseMissionControlFeedLimit(invalid),
      null,
    );
  }
});

test("signal priority is deterministic", () => {
  const signals = [
    signal({ id: "d", severity: "info" }),
    signal({ id: "c", severity: "critical" }),
    signal({
      id: "b",
      severity: "urgent",
      due_at: null,
    }),
    signal({
      id: "a",
      severity: "urgent",
      due_at: "2026-08-11T15:00:00.000Z",
    }),
  ];

  signals.sort(compareMissionControlSignals);

  assert.deepEqual(
    signals.map((item) => item.id),
    ["c", "a", "b", "d"],
  );
});

test("response mapping exposes facts without internal dedupe state", () => {
  const response = toMissionControlSignalResponse(
    signal(),
  );

  assert.equal(
    response.ruleKey,
    "estimating.proposal_expiring_soon",
  );
  assert.deepEqual(response.evidence, {
    proposal_id: "fact",
  });
  assert.equal("dedupeKey" in response, false);
  assert.equal("companyId" in response, false);
});

test("read endpoint is management-only and company-scoped", () => {
  assert.match(route, /getAuthenticatedAccess/);
  assert.match(route, /hasManagementAccess/);
  assert.match(route, /createUnauthorizedApiResponse/);
  assert.match(route, /createForbiddenApiResponse/);
  assert.match(
    route,
    /\.from\("company_settings"\)[\s\S]*?\.limit\(2\)/,
  );
  assert.match(
    route,
    /\.from\("mission_control_signals"\)[\s\S]*?\.eq\("company_id", companyId\)/,
  );
  assert.match(
    route,
    /status\.neq\.snoozed,snoozed_until\.lte/,
  );
  assert.match(route, /private, no-store/);
});

test("read endpoint is V0-bounded and has no mutation or AI path", () => {
  assert.deepEqual(MISSION_CONTROL_V0_RULE_KEYS, [
    "communication.customer_reply_unanswered",
    "estimating.proposal_follow_up_opportunity",
    "estimating.proposal_expiring_soon",
    "estimating.proposal_pricing_review_required",
  ]);
  assert.match(route, /MISSION_CONTROL_V0_RULE_KEYS/);
  assert.doesNotMatch(
    route,
    /\.(?:insert|update|upsert|delete|rpc)\(/,
  );
  assert.doesNotMatch(
    route,
    /openai|anthropic|language model|prompt|summary/i,
  );
});
