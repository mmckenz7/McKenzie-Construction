import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loader = readFileSync(
  "src/lib/communications/contact-threads.ts",
  "utf8",
);
const leadPage = readFileSync(
  "src/app/sales/leads/[leadId]/page.tsx",
  "utf8",
);
const customerPage = readFileSync(
  "src/app/sales/customers/[customerId]/page.tsx",
  "utf8",
);
const communicationPanel = readFileSync(
  "src/components/customer-communication-panel.tsx",
  "utf8",
);
const projectActivityApi = readFileSync(
  "src/app/api/projects/[projectId]/activity/route.ts",
  "utf8",
);
const projectActivityPage = readFileSync(
  "src/app/operations/projects/[projectId]/activity/page.tsx",
  "utf8",
);

test("contact history combines direct links with exact email and phone identity", () => {
  assert.match(loader, /lead_id/);
  assert.match(loader, /customer_id/);
  assert.match(loader, /participant_addresses/);
  assert.match(loader, /e164UsPhone/);
  assert.match(loader, /new Map/);
  assert.match(loader, /Date\.parse\(right\.last_message_at\)/);
});

test("lead and customer records expose the same conversation history without copying messages", () => {
  assert.match(leadPage, /loadContactCommunicationThreads/);
  assert.match(customerPage, /loadContactCommunicationThreads/);
  assert.match(communicationPanel, /Conversation history/);
  assert.match(communicationPanel, /\/sales\/communications\/\$\{thread\.id\}/);
  assert.doesNotMatch(loader, /\.insert\(|\.update\(|\.upsert\(/);
});

test("project activity projects linked conversations as read-only timeline entries", () => {
  assert.match(projectActivityApi, /loadContactCommunicationThreads/);
  assert.match(projectActivityApi, /communication_messages/);
  assert.match(projectActivityApi, /relationship:\s*"exact_contact_identity"/);
  assert.match(projectActivityPage, /communication_received/);
  assert.match(projectActivityPage, /communication_threads/);
  assert.match(projectActivityPage, /Open Conversation/);
  assert.doesNotMatch(projectActivityApi, /project_activity"\)\.insert/);
});
