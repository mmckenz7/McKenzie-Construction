import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  communicationPushPayload,
  maskedPushPhone,
  pushIdentity,
  safeSmsPushPreview,
} from "../src/lib/communications/push-alert.ts";

const manifest = readFileSync("src/app/manifest.ts", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const serviceWorker = readFileSync("public/sw.js", "utf8");
const pushServer = readFileSync("src/lib/communications/web-push.ts", "utf8");
const pushRoute = readFileSync("src/app/api/communications/push-subscription/route.ts", "utf8");
const pushTestRoute = readFileSync("src/app/api/communications/push-subscription/test/route.ts", "utf8");
const pushControls = readFileSync("src/components/communication-push-controls.tsx", "utf8");
const twilioWebhook = readFileSync("src/app/api/communications/webhooks/twilio/route.ts", "utf8");
const threadDetail = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
const communicationsLayout = readFileSync("src/app/communications/layout.tsx", "utf8");
const refreshControls = readFileSync("src/components/communication-automation-controls.tsx", "utf8");
const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const baseline = readFileSync("supabase/migrations/20260801095000_current_public_schema_through_090000.sql", "utf8");

test("the installed Company Inbox accepts only exact same-origin communication routes", () => {
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/communications"/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /safeNotificationDestination/);
  assert.match(serviceWorker, /\^\\\/communications\\\//);
  assert.doesNotMatch(serviceWorker, /new URL|https?:/);
});

test("the installed app and push notification use the square McKenzie PNG logo", () => {
  assert.match(manifest, /src: "\/branding\/mckenzie-app-icon-512\.png"/);
  assert.match(manifest, /type: "image\/png"/);
  assert.match(serviceWorker, /icon: "\/branding\/mckenzie-app-icon-512\.png"/);
  assert.match(serviceWorker, /badge: "\/branding\/mckenzie-app-icon-512\.png"/);
  assert.match(layout, /url: "\/branding\/mckenzie-apple-touch-icon\.png"/);
});

test("push delivery is restricted to the info account and carries no message content", () => {
  assert.match(pushServer, /INTERNAL_PUSH_RECIPIENT_EMAIL = "info@mckenzie-builds.com"/);
  assert.match(pushServer, /\.ilike\("email", INTERNAL_PUSH_RECIPIENT_EMAIL\)/);
  assert.match(pushServer, /rows\.length !== 1/);
  assert.match(pushServer, /communicationPushPayload\(input\)/);
  assert.doesNotMatch(pushServer, /messageBody|bodyPreview|providerMessageId/);
  assert.match(pushRoute, /isInternalPushRecipient\(email\)/);
  assert.match(pushTestRoute, /isInternalPushRecipient\(email\)/);
});

test("subscriptions require signed-in Sales access and strict encrypted endpoint facts", () => {
  assert.match(pushRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(pushRoute, /validPushEndpoint\(endpoint\)/);
  assert.match(pushRoute, /validPushKey\(p256dh\)/);
  assert.match(pushRoute, /validPushKey\(authKey\)/);
  assert.match(pushServer, /new URL\(value\)\.protocol === "https:"/);
  assert.match(pushRoute, /belongs to another account/);
  assert.match(pushRoute, /\.delete\(\)\.eq\("user_id", access\.workspace\.user!\.id\)/);
});

test("push rejection is distinguishable from a missing subscription without logging subscription facts", () => {
  assert.match(pushServer, /rejectedStatusCodes/);
  assert.match(pushTestRoute, /result\.attempted < 1/);
  assert.match(pushTestRoute, /phone push service rejected the test/);
  assert.doesNotMatch(pushTestRoute, /endpoint|p256dh|authKey/);
  assert.doesNotMatch(pushServer, /console\.(?:log|warn|error)/);
});

test("Twilio stores a unique inbound message before scheduling a nonblocking alert", () => {
  const duplicateGuard = twilioWebhook.indexOf("if (!message.data) return xml();");
  const pushSchedule = twilioWebhook.indexOf("after(() => sendCommunicationPush({");
  assert.ok(duplicateGuard > 0);
  assert.ok(pushSchedule > duplicateGuard);
  assert.match(twilioWebhook, /Message content and provider identifiers never enter the push payload/);
  assert.match(twilioWebhook, /company\.data\?\.length !== 1/);
  assert.match(twilioWebhook, /security_disposition: "normal"/);
});

test("typed alerts show sanitized CRM identity or a masked number without a preview", () => {
  const threadId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(pushIdentity("  Example\nCustomer  ", "+18655551212"), "Example Customer");
  assert.equal(maskedPushPhone("+1 (865) 555-1212"), "Number ending in 1212");
  assert.deepEqual(communicationPushPayload({
    kind: "inbound_text",
    identity: pushIdentity(null, "+1 (865) 555-1212"),
    threadId,
  }), {
    kind: "inbound_text",
    identity: "Number ending in 1212",
    url: `/communications/${threadId}`,
  });
  assert.equal(communicationPushPayload({
    kind: "missed_call",
    identity: "Example Customer",
    threadId: "not-a-thread",
  }), null);
  assert.match(serviceWorker, /inbound_text: "New McKenzie text"/);
  assert.match(serviceWorker, /incoming_call: "Incoming McKenzie call"/);
  assert.match(serviceWorker, /missed_call: "Missed McKenzie call"/);
  assert.doesNotMatch(serviceWorker, /messageBody|bodyPreview|payload\.body/);
});

test("SMS preview is short and rejects URLs or credential-bearing content", () => {
  assert.equal(safeSmsPushPreview("  Can you call me about the back deck?  "), "Can you call me about the back deck?");
  assert.equal(safeSmsPushPreview("A".repeat(90)), `${"A".repeat(71)}…`);
  assert.equal(safeSmsPushPreview("Open https://example.test/private?id=123"), null);
  assert.equal(safeSmsPushPreview("Your one-time code is 483920"), null);
  assert.equal(safeSmsPushPreview("Password reset token: syntheticCredentialValue12345"), null);
  assert.equal(safeSmsPushPreview("Project reference code 483920"), "Project reference code 483920");

  const threadId = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(communicationPushPayload({
    kind: "inbound_text",
    identity: "Example Customer",
    threadId,
    preview: "Can you call me about the back deck?",
  }), {
    kind: "inbound_text",
    identity: "Example Customer",
    preview: "Can you call me about the back deck?",
    url: `/communications/${threadId}`,
  });
  assert.deepEqual(communicationPushPayload({
    kind: "incoming_call",
    identity: "Example Customer",
    threadId,
    preview: "Calls never include content",
  }), {
    kind: "incoming_call",
    identity: "Example Customer",
    url: `/communications/${threadId}`,
  });
});

test("notification deep links remain protected by normal thread detail access", () => {
  assert.match(communicationsLayout, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(communicationsLayout, /if \(!canOpenInbox\) redirect\("\/portal"\)/);
  assert.match(threadDetail, /\.eq\("security_disposition", "normal"\)/);
});

test("the existing subscription table remains user-owned and no new schema is required", () => {
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS "public"\."push_subscriptions"/);
  assert.match(baseline, /"push_subscriptions_endpoint_key" UNIQUE \("endpoint"\)/);
  assert.match(baseline, /POLICY "users manage own subscriptions"/);
  assert.match(baseline, /"auth"\."uid"\(\) = "user_id"/);
});

test("the open inbox refreshes read-only and shows Eastern time", () => {
  assert.match(refreshControls, /const OPEN_INBOX_REFRESH_MS = 15 \* 1000/);
  assert.match(refreshControls, /const refresh = \(\) => router\.refresh\(\)/);
  assert.match(refreshControls, /document\.visibilityState === "visible"/);
  assert.doesNotMatch(refreshControls, /setInterval\(\(\) => void runAutomation/);
  assert.match(inbox, /timeZone: "America\/New_York"/);
  assert.match(inbox, /CommunicationPushControls/);
  assert.match(pushControls, /matched CRM name, or a masked phone number/);
  assert.match(pushControls, /Message content is never included/);
});
