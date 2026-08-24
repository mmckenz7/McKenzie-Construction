import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navigation = readFileSync("src/components/platform-sidebar-navigation.tsx", "utf8");
const companyInbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const canonicalPage = readFileSync("src/app/communications/page.tsx", "utf8");
const canonicalThread = readFileSync("src/app/communications/[threadId]/page.tsx", "utf8");
const installerMessages = readFileSync("src/app/operations/messages/page.tsx", "utf8");
const projectActivity = readFileSync("src/app/operations/projects/[projectId]/activity/page.tsx", "utf8");
const customerPanel = readFileSync("src/components/customer-communication-panel.tsx", "utf8");

test("Company Inbox is the neutral primary communication destination", () => {
  assert.match(navigation, /href="\/communications" label="Company Inbox"/);
  assert.match(canonicalPage, /sales\/communications\/page/);
  assert.match(canonicalThread, /sales\/communications\/\[threadId\]\/page/);
  assert.match(companyInbox, />Company Inbox</);
  assert.match(companyInbox, /Email and text conversations from across the company in one place/);
});

test("the main inbox is not driven by projects or CRM matching", () => {
  assert.doesNotMatch(companyInbox, /\.or\("lead_id\.not\.is\.null,customer_id\.not\.is\.null"\)/);
  assert.doesNotMatch(companyInbox, /projectId/);
  assert.match(companyInbox, /Not matched to a CRM record yet/);
});

test("record cards and project activity link back to canonical conversations", () => {
  assert.match(customerPanel, /\/communications\/\$\{thread\.id\}/);
  assert.match(projectActivity, /`\/communications\/\$\{entry\.sourceId\}`/);
});

test("project-driven installer communication remains separately labeled", () => {
  assert.match(navigation, /\["Installer Messages", "\/operations\/messages"\]/);
  assert.match(installerMessages, /Installer Messages/);
  assert.match(installerMessages, /projectId/);
});
