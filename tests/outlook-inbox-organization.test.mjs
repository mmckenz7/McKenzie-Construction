import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
const threadRoute = readFileSync("src/app/api/communications/threads/[threadId]/route.ts", "utf8");
const controls = readFileSync("src/components/communication-thread-controls.tsx", "utf8");

test("Company Inbox exposes conversation folders without creating a second message store", () => {
  assert.match(inbox, /\["inbox", "Inbox"\]/);
  assert.match(inbox, /\["sent", "Sent"\]/);
  assert.match(inbox, /\["attention", "Needs attention"\]/);
  assert.match(inbox, /\["archived", "Archived"\]/);
  assert.match(inbox, /communication_threads/);
  assert.match(inbox, /communication_messages/);
  assert.doesNotMatch(inbox, /inbox_folders|sent_messages|message_copies/);
});

test("Sent and Needs attention are deterministic projections of existing conversation facts", () => {
  assert.match(inbox, /message\.direction === "outbound"/);
  assert.match(inbox, /sentThreadIds\.has\(thread\.id\)/);
  assert.match(inbox, /thread\.unread_count > 0/);
  assert.match(inbox, /attentionThreadIds\.has\(thread\.id\)/);
  assert.match(inbox, /triageByThread\.get\(thread\.id\)\?\.kind === "review"/);
});

test("search and practical channel and department filters remain URL-addressable", () => {
  assert.match(inbox, /name="q"/);
  assert.match(inbox, /name="channel"/);
  assert.match(inbox, /name="department"/);
  assert.match(inbox, /Search people, addresses, subjects, or messages/);
  assert.match(inbox, /searchTextByThread/);
  assert.match(inbox, /inboxHref/);
});

test("unassigned compose delivery activity is not hidden behind a lead requirement", () => {
  assert.match(inbox, /source_type,source_id/);
  assert.match(inbox, /\["inbox_reply", "inbox_compose"\]/);
  assert.doesNotMatch(inbox, /\.not\("lead_id", "is", null\)/);
});

test("internal, vendor, automated, and review conversations can be read or archived without assignment", () => {
  assert.match(inbox, /mailboxOnly=\{!lead && !customer\}/);
  assert.match(threadPage, /mailboxOnly=\{!matchedRecord\}/);
  assert.match(controls, /!mailboxOnly/);
  assert.match(threadRoute, /Read and archive controls do not require assignment/);
  assert.doesNotMatch(threadRoute, /\.or\("lead_id\.not\.is\.null,customer_id\.not\.is\.null"\)/);
});
