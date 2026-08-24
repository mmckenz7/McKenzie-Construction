import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findInternalThreadParticipant } from "../src/lib/communications/thread-classification.ts";

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

test("internal conversations remain unassigned and never enter the CRM matcher", () => {
  assert.match(inbox, /\["internal", "Internal"\]/);
  assert.match(inbox, /Internal team conversation/);
  assert.match(inbox, /Internal · Unassigned/);
  assert.match(threadPage, /Internal · \{internalMember\.name\} · Unassigned/);
  assert.match(threadPage, /does not create or attach to a CRM record/);
  assert.match(threadPage, /internalMember \? <section/);
});
