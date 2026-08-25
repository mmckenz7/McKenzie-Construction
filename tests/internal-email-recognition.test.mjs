import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  automatedConversationLabel,
  findInternalThreadParticipant,
  findVendorThreadParticipant,
  threadCounterpartyAddresses,
} from "../src/lib/communications/thread-classification.ts";

const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");

const team = [
  { id: "1", name: "Michael", email: "Michael@McKenzie-Builds.com" },
  { id: "2", name: "Shared inbox", email: "info@mckenzie-builds.com" },
];

test("verified team email recognition is exact, normalized, and excludes the shared mailbox", () => {
  assert.deepEqual(
    findInternalThreadParticipant(["michael@mckenzie-builds.com", "customer@example.com"], team, ["info@mckenzie-builds.com"]),
    team[0],
  );
  assert.equal(findInternalThreadParticipant(["info@mckenzie-builds.com"], team, ["INFO@MCKENZIE-BUILDS.COM"]), null);
  assert.equal(findInternalThreadParticipant(["someone@mckenzie-builds.com"], team), null);
  assert.equal(findInternalThreadParticipant(["michael@mckenzie-builds.co"], team), null);
});

test("recognition uses the latest counterparty instead of every address stored on the thread", () => {
  const inbound = threadCounterpartyAddresses({
    direction: "inbound",
    sender: "customer@example.com",
    recipient: "michael@mckenzie-builds.com",
  });
  const outbound = threadCounterpartyAddresses({
    direction: "outbound",
    sender: "info@mckenzie-builds.com",
    recipient: "michael@mckenzie-builds.com",
  });

  assert.deepEqual(inbound, ["customer@example.com"]);
  assert.deepEqual(outbound, ["michael@mckenzie-builds.com"]);
});

test("vendor and automated triage are exact and deterministic", () => {
  const vendors = [{ id: "vendor-1", name: "Knox Supply", emails: ["orders@knox.example"] }];
  assert.deepEqual(findVendorThreadParticipant(["ORDERS@KNOX.EXAMPLE"], vendors), vendors[0]);
  assert.equal(findVendorThreadParticipant(["sales@knox.example"], vendors), null);
  assert.equal(automatedConversationLabel({ direction: "inbound", sender: "no-reply@example.com", recipient: "info@mckenzie-builds.com" }), "Automated notification");
  assert.equal(automatedConversationLabel({ direction: "inbound", sender: "news@example.com", recipient: "info@mckenzie-builds.com", body: "Manage preferences or unsubscribe" }), "Newsletter");
  assert.equal(automatedConversationLabel({ direction: "inbound", sender: "customer@example.com", recipient: "info@mckenzie-builds.com", body: "Please call me" }), null);
});

test("internal conversations remain unassigned and never enter the CRM matcher", () => {
  assert.match(inbox, /\["internal", "Internal"\]/);
  assert.match(inbox, /Internal team conversation/);
  assert.match(inbox, /Internal · Unassigned/);
  assert.match(inbox, /Vendor · Unassigned/);
  assert.match(inbox, /Needs review before matching/);
  assert.match(threadPage, /Internal · \{internalMember\.name\} · Unassigned/);
  assert.match(threadPage, /Vendor · \{vendor\.name\} · Unassigned/);
  assert.match(threadPage, /Kept in the company inbox without creating an assignment or CRM record/);
  assert.match(threadPage, /Reply to \$\{internalMember\.name\} without assigning this internal conversation/);
  assert.match(threadPage, /Reply to \$\{vendor\.name\} without assigning this vendor conversation/);
  assert.match(threadPage, /without forcing a lead, customer, or project assignment/);
});
