import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  communicationStatusForResendEvent,
  eventIsNewer,
  normalizeResendDeliveryEvent,
  outboxStatusForResendEvent,
} from "../src/lib/communications/resend-webhook.ts";

test("Resend delivery events normalize to minimal audit data", () => {
  assert.deepEqual(normalizeResendDeliveryEvent({
    type: "email.bounced",
    created_at: "2026-08-10T18:00:00.000Z",
    data: {
      email_id: "email-123",
      to: ["customer@example.com"],
      subject: "Private subject",
      bounce: { type: "Permanent", subType: "General" },
      message: "Mailbox rejected the message",
    },
  }), {
    type: "email.bounced",
    createdAt: "2026-08-10T18:00:00.000Z",
    emailId: "email-123",
    metadata: {
      provider_detail: "Mailbox rejected the message",
      bounce_type: "Permanent",
      bounce_subtype: "General",
    },
  });
});

test("Resend delivery status mapping never marks acceptance as delivery", () => {
  assert.equal(communicationStatusForResendEvent("email.sent"), "sent");
  assert.equal(communicationStatusForResendEvent("email.delivered"), "delivered");
  assert.equal(communicationStatusForResendEvent("email.bounced"), "undelivered");
  assert.equal(communicationStatusForResendEvent("email.failed"), "failed");
  assert.equal(outboxStatusForResendEvent("email.delivered"), "sent");
  assert.equal(outboxStatusForResendEvent("email.complained"), "failed");
});

test("older webhook deliveries cannot overwrite a newer provider event", () => {
  assert.equal(eventIsNewer({ resend_event_created_at: "2026-08-10T18:00:00.000Z" }, "2026-08-10T17:59:59.000Z"), false);
  assert.equal(eventIsNewer({ resend_event_created_at: "2026-08-10T18:00:00.000Z" }, "2026-08-10T18:00:01.000Z"), true);
});

test("Resend webhook route verifies the raw payload and records idempotent events", () => {
  const route = readFileSync("src/app/api/communications/webhooks/resend/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260810040000_resend_delivery_events.sql", "utf8");
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /new Webhook\(secret\)\.verify/);
  assert.match(route, /svix-id/);
  assert.match(route, /"svix-timestamp": timestamp/);
  assert.match(route, /"svix-signature": signature/);
  assert.match(route, /verify\(payload, headers\.verification\)/);
  assert.match(route, /eventRecord\.error\?\.code === "23505"/);
  assert.match(route, /eventIsNewer/);
  assert.match(migration, /unique \(provider, event_id\)/);
  assert.match(migration, /revoke all .* from public, anon, authenticated/);
  assert.doesNotMatch(migration, /WEBHOOK_SECRET|RESEND_API_KEY/);
});
