import assert from "node:assert/strict";
import test from "node:test";

import { groupCustomerHubThreads } from "../src/lib/communications/customer-hub.ts";

const thread = (values = {}) => ({
  id: "thread-1",
  lead_id: null,
  customer_id: null,
  provider: "microsoft_graph",
  unread_count: 0,
  last_message_at: "2026-08-26T12:00:00.000Z",
  ...values,
});

test("email and text provider threads group into one customer hub", () => {
  const groups = groupCustomerHubThreads([
    thread({ id: "email-1", customer_id: "customer-1" }),
    thread({ id: "sms-1", customer_id: "customer-1", provider: "twilio", unread_count: 2, last_message_at: "2026-08-26T13:00:00.000Z" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].representative.id, "sms-1");
  assert.deepEqual(groups[0].channels, ["email", "sms"]);
  assert.equal(groups[0].unreadCount, 2);
});

test("unmatched provider threads remain separate until identity is verified", () => {
  const groups = groupCustomerHubThreads([
    thread({ id: "email-1" }),
    thread({ id: "sms-1", provider: "twilio" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.key).sort(), ["thread:email-1", "thread:sms-1"]);
});

test("lead hubs remain distinct from promoted customer hubs", () => {
  const groups = groupCustomerHubThreads([
    thread({ id: "lead-email", lead_id: "lead-1" }),
    thread({ id: "customer-email", customer_id: "customer-1" }),
  ]);
  assert.deepEqual(groups.map((group) => group.key).sort(), ["customer:customer-1", "lead:lead-1"]);
});
