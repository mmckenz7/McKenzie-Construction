import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { comparableDestination, e164UsPhone, normalizedPhone } from "../src/lib/communications/phone.ts";

const textRoute = readFileSync("src/app/api/communications/texts/route.ts", "utf8");
const callRoute = readFileSync("src/app/api/communications/calls/route.ts", "utf8");
const workspaceCompany = readFileSync("src/lib/communications/workspace-company.ts", "utf8");
const voiceProvider = readFileSync("src/lib/communications/twilio-voice.ts", "utf8");
const voiceWebhook = readFileSync("src/app/api/communications/webhooks/twilio/voice/route.ts", "utf8");
const twilioWebhook = readFileSync("src/app/api/communications/webhooks/twilio/route.ts", "utf8");
const panel = readFileSync("src/components/customer-communication-panel.tsx", "utf8");
const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const conversionRoute = readFileSync("src/app/api/leads/[leadId]/convert-to-customer/route.ts", "utf8");
const workflow = readFileSync("src/components/lead-stage-workflow.tsx", "utf8");

test("US phone normalization is deterministic and fail closed", () => {
  assert.equal(normalizedPhone("(865) 433-3325"), "8654333325");
  assert.equal(normalizedPhone("+1 865-433-3325"), "8654333325");
  assert.equal(e164UsPhone("865.433.3325"), "+18654333325");
  assert.equal(e164UsPhone("433-3325"), null);
  assert.equal(comparableDestination(" Info@McKenzie-Builds.com "), "info@mckenzie-builds.com");
});

test("two-way text delivery is matched, sandboxed, consent-aware, and audited", () => {
  assert.match(textRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(textRoute, /communication_sandbox_mode/);
  assert.match(textRoute, /communicationWorkspaceMatchesSingletonCompany\(supabase, workspace\.access!\.company_id\)/);
  assert.doesNotMatch(textRoute, /\.eq\("company_id"/);
  assert.match(textRoute, /status === "unsubscribed"/);
  assert.match(textRoute, /Ask the customer to text START/);
  assert.match(textRoute, /provider: "twilio"/);
  assert.match(textRoute, /thread_id: threadId/);
  assert.match(textRoute, /activity_type: "sms_sent"/);
  assert.match(twilioWebhook, /textThread\(from, to, leadId, customerId/);
  assert.match(twilioWebhook, /is_read: false/);
  assert.match(twilioWebhook, /unread_count: 1/);
});

test("OS-controlled calls bridge the employee and customer through the company number", () => {
  assert.match(callRoute, /workspace\.access\?\.phone/);
  assert.match(callRoute, /communication_sandbox_mode/);
  assert.match(callRoute, /communicationWorkspaceMatchesSingletonCompany\(supabase, workspace\.access!\.company_id\)/);
  assert.doesNotMatch(callRoute, /\.eq\("company_id"/);
  assert.match(callRoute, /startTwilioBridgeCall/);
  assert.match(callRoute, /channel: "voice"/);
  assert.match(callRoute, /activity_type: "call_started"/);
  assert.match(voiceProvider, /<Dial callerId=/);
  assert.match(voiceProvider, /TWILIO_VOICE_STATUS_CALLBACK_URL/);
  assert.match(voiceWebhook, /validateTwilioWebhook/);
  assert.match(voiceWebhook, /callStatus === "completed"/);
});

test("legacy lead and customer lookups are guarded by the singleton company boundary", () => {
  assert.match(workspaceCompany, /from\("company_settings"\)[\s\S]*?select\("id"\)[\s\S]*?limit\(2\)/);
  assert.match(workspaceCompany, /result\.data\?\.length === 1/);
  assert.match(workspaceCompany, /result\.data\[0\]\.id === companyId/);
});

test("the customer communication UI is channel-first and restrained", () => {
  assert.match(panel, />Email</);
  assert.match(panel, />Text</);
  assert.match(panel, /CommunicationReplyComposer/);
  assert.match(panel, /TextMessageComposer/);
  assert.match(panel, /rounded-lg bg-slate-100 p-1/);
  assert.match(inbox, /Email and text conversations/);
  assert.match(inbox, /groupChannel === "sms" \? "Text" : "Email"/);
  assert.doesNotMatch(inbox, /Customer email conversations matched/);
});

test("estimating bypass is explicit, narrow, and recorded for the CRM test", () => {
  assert.match(conversionRoute, /lead\.lead_status !== "estimate_in_progress"/);
  assert.match(conversionRoute, /estimating_bypassed_for_crm_test: estimatingBypass/);
  assert.match(conversionRoute, /estimating_workflow_under_rebuild/);
  assert.match(workflow, /Bypass estimating and continue CRM test/);
  assert.match(workflow, /JSON\.stringify\(\{ estimatingBypass \}\)/);
});
