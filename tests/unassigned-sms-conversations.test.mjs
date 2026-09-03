import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  phoneCandidatesContain,
  unassignedSmsCounterpartyPhone,
} from "../src/lib/communications/phone.ts";

const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
const threadRoute = readFileSync("src/app/api/communications/threads/[threadId]/route.ts", "utf8");
const textRoute = readFileSync("src/app/api/communications/texts/route.ts", "utf8");
const twilioWebhook = readFileSync("src/app/api/communications/webhooks/twilio/route.ts", "utf8");
const matcher = readFileSync("src/components/communication-thread-match.tsx", "utf8");
const inboxMigration = readFileSync("supabase/migrations/20260810030000_microsoft_365_inbox.sql", "utf8");

test("an unassigned text identifies exactly one non-company participant", () => {
  assert.equal(
    unassignedSmsCounterpartyPhone(["+18654333325", "(865) 555-0142"], "865-433-3325"),
    "+18655550142",
  );
  assert.equal(
    unassignedSmsCounterpartyPhone(["+18654333325", "+18655550142", "+18655550143"], "+18654333325"),
    null,
  );
  assert.equal(unassignedSmsCounterpartyPhone("not-an-array", "+18654333325"), null);
});

test("duplicate contact detection is formatting-insensitive", () => {
  assert.equal(phoneCandidatesContain("+18655550142", [{ phone: "(865) 555-0142" }]), true);
  assert.equal(phoneCandidatesContain("+18655550142", [{ phone: "+1 865 555 0199" }]), false);
});

test("the existing nullable thread contract supports unassigned conversations without a migration", () => {
  assert.match(inboxMigration, /lead_id text,/);
  assert.match(inboxMigration, /customer_id uuid/);
  assert.doesNotMatch(inboxMigration, /lead_id text not null|customer_id uuid not null/);
});

test("unassigned text replies depend on workspace and messaging authority, not CRM linkage", () => {
  assert.match(textRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(textRoute, /communicationWorkspaceMatchesSingletonCompany/);
  assert.match(textRoute, /communication_sandbox_mode/);
  assert.match(textRoute, /communication_test_recipients/);
  assert.match(textRoute, /eq\("provider", "twilio"\)\.eq\("security_disposition", "normal"\)/);
  assert.doesNotMatch(textRoute, /lead_id\.not\.is\.null,customer_id\.not\.is\.null/);
  assert.match(textRoute, /leadId = thread\.data\.lead_id/);
  assert.match(textRoute, /customerId = thread\.data\.customer_id/);
  assert.match(textRoute, /recipient = recipient \?\? participantRecipient/);
});

test("the inbox has an exact unassigned queue and every requested action", () => {
  assert.match(inbox, /\["unassigned", "Unassigned conversations"\]/);
  assert.match(inbox, /view === "unassigned"/);
  assert.match(inbox, /!thread\.lead_id && !thread\.customer_id/);
  assert.match(threadPage, /isTextThread \? <TextMessageComposer recipient=\{recipient\} threadId=\{threadId\}/);
  assert.match(matcher, /Link existing contact/);
  assert.match(matcher, /Create Lead/);
  assert.match(matcher, /Leave unassigned/);
  assert.match(matcher, /replying does not require a lead or customer/i);
  assert.match(matcher, /sm:grid-cols/);
  assert.match(matcher, /min-h-11/);
});

test("creating a lead is fail-closed, duplicate-safe, and retains the exact thread", () => {
  assert.match(threadRoute, /action === "create_lead"/);
  assert.match(threadRoute, /phoneCandidatesContain/);
  assert.match(threadRoute, /A lead or customer already uses this phone number/);
  assert.match(threadRoute, /lead_source: "inbound_sms"/);
  assert.match(threadRoute, /preferred_contact_method: "text"/);
  assert.match(threadRoute, /\.eq\("id", threadId\)[\s\S]*?\.is\("lead_id", null\)[\s\S]*?\.is\("customer_id", null\)/);
  assert.match(threadRoute, /from\("communication_messages"\)[\s\S]*?\.eq\("thread_id", threadId\)/);
  assert.match(threadRoute, /from\("leads"\)\.delete\(\)\.eq\("id", leadResult\.data\.id\)/);
});

test("later inbound messages retain an explicit CRM link on the existing provider thread", () => {
  assert.match(twilioWebhook, /select\("id,lead_id,customer_id"\)/);
  assert.match(twilioWebhook, /existingHasIdentity/);
  assert.match(twilioWebhook, /lead_id: existingHasIdentity \? existing\.data\?\.lead_id \?\? null : leadId/);
  assert.match(twilioWebhook, /customer_id: existingHasIdentity \? existing\.data\?\.customer_id \?\? null : customerId/);
  assert.match(twilioWebhook, /lead_id: thread\.leadId, thread_id: threadId/);
  assert.match(twilioWebhook, /customer_id: thread\.customerId/);
  assert.match(twilioWebhook, /provider_thread_id: providerThreadId/);
});
