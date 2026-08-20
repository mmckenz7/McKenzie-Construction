import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the public gateway exposes only fixed webhook paths and health", async () => {
  const routes = await source("lib/routes.ts");
  assert.match(routes, /communications\/webhooks\/twilio/);
  assert.match(routes, /communications\/webhooks\/twilio\/voice/);
  assert.match(routes, /communications\/webhooks\/resend/);
  assert.doesNotMatch(routes, /\[\.\.\./);
});

test("Twilio and Resend signatures are verified before forwarding", async () => {
  const twilio = await source("app/api/communications/webhooks/twilio/route.ts");
  const voice = await source("app/api/communications/webhooks/twilio/voice/route.ts");
  const resend = await source("app/api/communications/webhooks/resend/route.ts");
  assert.ok(twilio.indexOf("if (!verifyTwilioRequest") < twilio.lastIndexOf("return forwardVerifiedWebhook"));
  assert.ok(voice.indexOf("if (!verifyTwilioRequest") < voice.lastIndexOf("return forwardVerifiedWebhook"));
  assert.ok(resend.indexOf("if (!verifyResendRequest") < resend.lastIndexOf("return forwardVerifiedWebhook"));
});

test("the Preview bypass is sent only as a private forwarding header", async () => {
  const gateway = await source("lib/gateway.ts");
  assert.match(gateway, /GATEWAY_VERCEL_BYPASS_SECRET/);
  assert.match(gateway, /"x-vercel-protection-bypass": bypassSecret/);
  assert.doesNotMatch(gateway, /x-vercel-protection-bypass=/);
});

test("the gateway rejects oversized payloads, redirects, and non-HTTPS targets", async () => {
  const gateway = await source("lib/gateway.ts");
  assert.match(gateway, /MAX_WEBHOOK_BYTES/);
  assert.match(gateway, /redirect: "manual"/);
  assert.match(gateway, /parsed\.protocol !== "https:"/);
});
