import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260810020000_communication_inbox.sql", "utf8");
const processor = readFileSync("src/app/api/communications/process/route.ts", "utf8");
const processorCore = readFileSync("src/lib/communications/processor.ts", "utf8");
const workflow = readFileSync("src/lib/communications/email-delivery-workflow.ts", "utf8");
const webhook = readFileSync("src/app/api/communications/webhooks/twilio/route.ts", "utf8");
const validator = readFileSync("src/lib/communications/twilio-webhook.ts", "utf8");
const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const navigation = readFileSync("src/components/platform-sidebar-navigation.tsx", "utf8");
const provider = readFileSync("src/lib/communications/provider.ts", "utf8");
const outbox = readFileSync("src/lib/communications/outbox.ts", "utf8");
const settings = readFileSync("src/app/api/communications/settings/route.ts", "utf8");
const replyRoute = readFileSync("src/app/api/communications/replies/route.ts", "utf8");
const replyComposer = readFileSync("src/components/communication-reply-composer.tsx", "utf8");
const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
const leadPage = readFileSync("src/app/sales/leads/[leadId]/page.tsx", "utf8");
const customerPage = readFileSync("src/app/sales/customers/[customerId]/page.tsx", "utf8");
const threadControlsRoute = readFileSync("src/app/api/communications/threads/[threadId]/route.ts", "utf8");
const threadControls = readFileSync("src/components/communication-thread-controls.tsx", "utf8");
const threadMessages = readFileSync("src/components/communication-thread-messages.tsx", "utf8");

test("communication history and consent tables are service-role only", () => {
  assert.match(migration, /create table if not exists public\.communication_messages/);
  assert.match(migration, /create table if not exists public\.communication_preferences/);
  assert.match(migration, /communication_messages_provider_uidx/);
  assert.match(migration, /status in \('unknown', 'subscribed', 'unsubscribed'\)/);
  assert.match(migration, /revoke all on table public\.communication_messages from public, anon, authenticated/);
  assert.match(migration, /grant all on table public\.communication_preferences to service_role/);
  assert.doesNotMatch(migration, /AUTH_TOKEN|API_KEY|SECRET/);
});

test("provider-confirmed email delivery reuses follow-up rules without retrying the sent message", () => {
  assert.match(processor, /processCommunicationOutbox/);
  assert.match(processorCore, /finalizeAutomatedEmailDelivery/);
  assert.match(processorCore, /Delivered communication needs workflow repair/);
  assert.match(processorCore, /communication_delivery_repair/);
  assert.match(processorCore, /Never retry it merely because local audit finalization failed/);
  assert.match(processorCore, /communication_sandbox_mode/);
  assert.match(processorCore, /sandbox_recipient_blocked/);
  assert.match(workflow, /next_phone_follow_up_after_send/);
  assert.match(workflow, /source_type: "email_provider_delivery"/);
  assert.match(workflow, /phone_follow_up_scheduled/);
  assert.match(workflow, /provider_message_id/);
});

test("approved email snapshots the company reply-to address for Resend delivery", () => {
  assert.match(outbox, /company_email/);
  assert.match(outbox, /reply_to_email: settings\.data\.company_email/);
  assert.match(processorCore, /metadata\?\.reply_to_email/);
  assert.match(provider, /reply_to: message\.replyTo/);
  assert.match(provider, /result\.message/);
  assert.match(provider, /slice\(0, 300\)/);
  assert.match(settings, /company_email: replyToEmail/);
  assert.match(settings, /Enter a valid reply-to email address/);
});

test("communication sandbox is enabled by default with an explicit allowlist", () => {
  assert.match(migration, /communication_sandbox_mode boolean not null default true/);
  assert.match(migration, /communication_test_recipients text\[\] not null default '\{\}'/);
});

test("Twilio webhook validation and opt-outs fail closed", () => {
  assert.match(validator, /twilio\.validateRequest/);
  assert.match(validator, /TWILIO_AUTH_TOKEN/);
  assert.match(validator, /TWILIO_WEBHOOK_BASE_URL/);
  assert.match(webhook, /x-twilio-signature|validateTwilioWebhook/);
  assert.match(webhook, /optOutType === "STOP"/);
  assert.match(webhook, /"STOP" \? "unsubscribed" : "subscribed"/);
  assert.match(webhook, /Canceled because the customer replied by text/);
  assert.doesNotMatch(webhook, /validate\s*:\s*false/);
});

test("sales communications inbox exposes audited statuses and click-to-call", () => {
  assert.match(navigation, /\["Communications", "\/sales\/communications"\]/);
  assert.match(inbox, /communication_messages/);
  assert.match(inbox, /communication_outbox/);
  assert.match(inbox, /href=\{`tel:\$\{phone\}`\}/);
  assert.match(inbox, /Needs attention/);
});

test("Mission Control replies are server validated, sandboxed, threaded, and audited", () => {
  assert.match(replyRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(replyRoute, /communication_sandbox_mode/);
  assert.match(replyRoute, /communication_test_recipients/);
  assert.match(replyRoute, /"In-Reply-To": inReplyTo/);
  assert.match(replyRoute, /References: inReplyTo/);
  assert.match(replyRoute, /source_type: "inbox_reply"/);
  assert.match(replyRoute, /thread_id: threadId/);
  assert.match(replyRoute, /lead_activities/);
  assert.match(provider, /headers: message\.headers/);
});

test("the shared reply composer is available from inbox, lead, and customer records", () => {
  assert.match(replyComposer, /\/api\/communications\/replies/);
  assert.match(replyComposer, /Send reply/);
  assert.match(threadPage, /CommunicationReplyComposer/);
  assert.match(leadPage, /CommunicationReplyComposer/);
  assert.match(customerPage, /CommunicationReplyComposer/);
  assert.match(inbox, /#reply/);
  assert.match(replyComposer, /readOnly=\{Boolean\(threadId\)\}/);
  assert.match(replyRoute, /canonicalSubject = threadResult\.data\.subject/);
});

test("matched inbox conversations have server-validated operational controls", () => {
  assert.match(threadControlsRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(threadControlsRoute, /lead_id\.not\.is\.null,customer_id\.not\.is\.null/);
  assert.match(threadControlsRoute, /threadStatuses\.has\(status\)/);
  assert.match(threadControlsRoute, /eq\("status", "active"\)/);
  assert.match(threadControlsRoute, /unread_count = 0/);
  assert.match(threadControlsRoute, /unread_count = 1/);
  assert.match(threadControls, /Mark read/);
  assert.match(threadControls, /Mark unread/);
  assert.match(threadControls, /Archive/);
  assert.match(threadControls, /Restore/);
  assert.match(threadControls, /Assigned to/);
  assert.match(inbox, /\["closed", "Closed"\]/);
  assert.match(inbox, /\["archived", "Archived"\]/);
  assert.match(inbox, /view === "archived"/);
  assert.match(inbox, /CommunicationThreadControls/);
  assert.match(threadPage, /CommunicationThreadControls/);
});

test("conversation threads default to newest first with fast navigation and an order selector", () => {
  assert.match(threadPage, /ascending: false/);
  assert.match(threadPage, /CommunicationThreadMessages/);
  assert.match(threadMessages, /useState<"newest" \| "oldest">\("newest"\)/);
  assert.match(threadMessages, /aria-label="Message order"/);
  assert.match(threadMessages, /Newest first/);
  assert.match(threadMessages, /Oldest first/);
  assert.match(threadMessages, /new Date\(right\.occurredAt\)/);
  assert.match(threadMessages, /href="#thread-bottom"/);
  assert.match(threadPage, /href="#thread-messages-top"/);
});
