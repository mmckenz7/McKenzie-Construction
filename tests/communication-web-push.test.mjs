import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = readFileSync("src/app/manifest.ts", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const serviceWorker = readFileSync("public/sw.js", "utf8");
const pushServer = readFileSync("src/lib/communications/web-push.ts", "utf8");
const pushRoute = readFileSync("src/app/api/communications/push-subscription/route.ts", "utf8");
const pushTestRoute = readFileSync("src/app/api/communications/push-subscription/test/route.ts", "utf8");
const pushControls = readFileSync("src/components/communication-push-controls.tsx", "utf8");
const twilioWebhook = readFileSync("src/app/api/communications/webhooks/twilio/route.ts", "utf8");
const refreshControls = readFileSync("src/components/communication-automation-controls.tsx", "utf8");
const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const baseline = readFileSync("supabase/migrations/20260801095000_current_public_schema_through_090000.sql", "utf8");

test("the installed Company Inbox opens the unified inbox while push clicks open text alerts", () => {
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/communications"/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /const destination = "\/communications\?channel=sms"/);
  assert.doesNotMatch(serviceWorker, /payload\.url|threadId|providerMessageId/);
});

test("the installed app and push notification use the square McKenzie PNG logo", () => {
  assert.match(manifest, /src: "\/branding\/mckenzie-app-icon-512\.png"/);
  assert.match(manifest, /type: "image\/png"/);
  assert.match(serviceWorker, /icon: "\/branding\/mckenzie-app-icon-512\.png"/);
  assert.match(serviceWorker, /badge: "\/branding\/mckenzie-app-icon-512\.png"/);
  assert.match(layout, /url: "\/branding\/mckenzie-apple-touch-icon\.png"/);
});

test("push delivery is restricted to the info account and contains no customer facts", () => {
  assert.match(pushServer, /INTERNAL_PUSH_RECIPIENT_EMAIL = "info@mckenzie-builds.com"/);
  assert.match(pushServer, /\.ilike\("email", INTERNAL_PUSH_RECIPIENT_EMAIL\)/);
  assert.match(pushServer, /rows\.length !== 1/);
  assert.match(pushServer, /title: "New customer text"/);
  assert.match(pushServer, /body: "A new text arrived in Company Inbox\."/);
  assert.doesNotMatch(pushServer, /threadId|providerMessageId|customerPhone|messageBody/);
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
  const pushSchedule = twilioWebhook.indexOf("after(() => sendInboundTextPush())");
  assert.ok(duplicateGuard > 0);
  assert.ok(pushSchedule > duplicateGuard);
  assert.match(twilioWebhook, /Customer identity,[\s\S]*never enter the push payload/);
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
  assert.match(pushControls, /Customer details and message content are not sent/);
});
