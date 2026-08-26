import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inboxPage = readFileSync("src/app/sales/communications/page.tsx", "utf8");
const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
const messages = readFileSync("src/components/communication-thread-messages.tsx", "utf8");

test("the inbox groups verified provider threads without merging unmatched threads", () => {
  assert.match(inboxPage, /groupCustomerHubThreads\(threads\)/);
  assert.match(inboxPage, /Open hub/);
  assert.match(inboxPage, /group\.threads\.length === 1/);
});

test("the customer hub loads only normal provider threads and messages", () => {
  assert.match(threadPage, /eq\("customer_id", threadResult\.data\.customer_id\)\.eq\("security_disposition", "normal"\)/);
  assert.match(threadPage, /eq\("lead_id", customerResult\.data\.source_lead_id\)\.eq\("security_disposition", "normal"\)/);
  assert.match(threadPage, /\.in\("thread_id", orderedHubThreads\.map\(\(thread\) => thread\.id\)\)\.eq\("security_disposition", "normal"\)/);
});

test("the unified timeline offers exact channel filters and provider-specific replies", () => {
  assert.match(messages, /aria-pressed=\{channel === value\}/);
  assert.match(messages, /value === "sms" \? "Text" : "Email"/);
  assert.match(threadPage, /threadId=\{emailThread\?\.id\}/);
  assert.match(threadPage, /threadId=\{textThread\?\.id\}/);
});
