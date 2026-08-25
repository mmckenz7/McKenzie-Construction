import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  departmentForAddresses,
  isTrustedGraphDeltaUrl,
  mergeMicrosoftThreadState,
  normalizeGraphInboxMessage,
  normalizedEmailThreadSubject,
} from "../src/lib/communications/microsoft-message.ts";

test("department aliases route incoming email to the expected queue", () => {
  assert.equal(departmentForAddresses(["estimating@mckenzie-builds.com"]), "estimating");
  assert.equal(departmentForAddresses(["sales@mckenzie-builds.com"]), "sales");
  assert.equal(departmentForAddresses(["projects@mckenzie-builds.com"]), "operations");
  assert.equal(departmentForAddresses(["billing@mckenzie-builds.com"]), "billing");
  assert.equal(departmentForAddresses(["info@mckenzie-builds.com"]), "general");
});

test("Graph inbox messages normalize without exposing authentication data", () => {
  const result = normalizeGraphInboxMessage({
    id: "message-1",
    conversationId: "conversation-1",
    internetMessageId: "<message-1@example.com>",
    subject: "Deck estimate question",
    body: { content: "Can we change the railing color?" },
    from: { emailAddress: { address: "CUSTOMER@example.com", name: "Customer" } },
    toRecipients: [{ emailAddress: { address: "Estimating@McKenzie-Builds.com" } }],
    receivedDateTime: "2026-08-10T18:00:00.000Z",
    isRead: false,
    hasAttachments: true,
  });

  assert.deepEqual(result, {
    providerMessageId: "message-1",
    providerConversationId: "conversation-1",
    internetMessageId: "<message-1@example.com>",
    sender: "customer@example.com",
    senderName: "Customer",
    recipients: ["estimating@mckenzie-builds.com"],
    subject: "Deck estimate question",
    body: "Can we change the railing color?",
    receivedAt: "2026-08-10T18:00:00.000Z",
    isRead: false,
    hasAttachments: true,
    department: "estimating",
  });
});

test("malformed Graph messages are ignored", () => {
  assert.equal(normalizeGraphInboxMessage({ id: "message-1" }), null);
});

test("out-of-order Graph messages preserve the newest activity and a successful match", () => {
  const result = mergeMicrosoftThreadState(
    {
      subject: "Re: Deck estimate",
      department: "estimating",
      leadId: "lead-1",
      customerId: null,
      participantAddresses: ["customer@example.com"],
      lastMessageAt: "2026-08-10T18:41:30.000Z",
    },
    {
      subject: "Deck estimate",
      department: "general",
      leadId: null,
      customerId: null,
      participantAddresses: ["estimating@example.com"],
      lastMessageAt: "2026-08-10T17:19:04.000Z",
    },
  );

  assert.equal(result.lastMessageAt, "2026-08-10T18:41:30.000Z");
  assert.equal(result.leadId, "lead-1");
  assert.equal(result.subject, "Re: Deck estimate");
  assert.deepEqual(result.participantAddresses, [
    "customer@example.com",
    "estimating@example.com",
  ]);
});

test("reply prefixes normalize so Microsoft replies reconnect to Mission Control threads", () => {
  assert.equal(normalizedEmailThreadSubject("Re: Regarding your deck"), "regarding your deck");
  assert.equal(normalizedEmailThreadSubject("Fwd: RE: Regarding your deck"), "regarding your deck");
  assert.equal(normalizedEmailThreadSubject("Regarding your deck"), "regarding your deck");
});

test("only Microsoft Graph v1 delta links are trusted", () => {
  assert.equal(isTrustedGraphDeltaUrl("https://graph.microsoft.com/v1.0/users/test/messages/delta?$deltatoken=abc"), true);
  assert.equal(isTrustedGraphDeltaUrl("https://evil.example/v1.0/users/test/messages/delta"), false);
  assert.equal(isTrustedGraphDeltaUrl("http://graph.microsoft.com/v1.0/users/test/messages/delta"), false);
});

test("Microsoft synchronization supports a protected scheduler without exposing secrets", () => {
  const route = readFileSync(new URL("../src/app/api/communications/microsoft/sync/route.ts", import.meta.url), "utf8");
  const automationAuth = readFileSync(new URL("../src/lib/communications/automation-auth.ts", import.meta.url), "utf8");
  assert.match(route, /trustedCommunicationAutomationRequest/);
  assert.match(automationAuth, /timingSafeEqual/);
  assert.match(automationAuth, /COMMUNICATION_PROCESSOR_SECRET/);
  assert.doesNotMatch(route, /client_secret:\s*["'][^"']+["']/);
  const graph = readFileSync(new URL("../src/lib/communications/microsoft-graph.ts", import.meta.url), "utf8");
  assert.match(graph, /provider", "mission_control"/);
  assert.match(graph, /normalizedEmailThreadSubject/);
});

test("Mission Control and Company Inbox retain unmatched conversations", () => {
  const missionControl = readFileSync(new URL("../src/app/all-work/page.tsx", import.meta.url), "utf8");
  const customerInbox = readFileSync(new URL("../src/app/sales/communications/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(missionControl, /lead_id\.not\.is\.null,customer_id\.not\.is\.null/);
  assert.doesNotMatch(customerInbox, /lead_id\.not\.is\.null,customer_id\.not\.is\.null/);
  assert.match(customerInbox, /Needs review before matching/);
});
