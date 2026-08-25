import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { prepareSecondaryEmailRecipients } from "../src/lib/communications/email-recipients.ts";

test("Cc and Bcc lists are validated, normalized, and deduplicated", () => {
  assert.deepEqual(
    prepareSecondaryEmailRecipients(
      "owner@example.com",
      "ALPHA@example.com; owner@example.com, alpha@example.com",
      "private@example.com, alpha@example.com",
    ),
    {
      ccRecipients: ["alpha@example.com"],
      bccRecipients: ["private@example.com"],
      error: null,
    },
  );
  assert.match(prepareSecondaryEmailRecipients("owner@example.com", "not-an-email", "").error ?? "", /Cc/);
});

test("the provider sends Bcc privately and shared history does not store Bcc addresses", () => {
  const route = readFileSync("src/app/api/communications/replies/route.ts", "utf8");
  const provider = readFileSync("src/lib/communications/provider.ts", "utf8");
  const composer = readFileSync("src/components/communication-reply-composer.tsx", "utf8");
  const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");

  assert.match(provider, /bcc: message\.bccRecipients/);
  assert.match(route, /bccRecipients,/);
  assert.match(route, /used_bcc: bccRecipients\.length > 0/);
  assert.doesNotMatch(route, /bcc_recipients:/);
  assert.match(composer, />Bcc</);
  assert.match(composer, /Bcc recipients are hidden from everyone else/);
  assert.match(threadPage, /without forcing a lead, customer, or project assignment/);
});

test("sandbox checking covers To, Cc, and Bcc", () => {
  const route = readFileSync("src/app/api/communications/replies/route.ts", "utf8");
  assert.match(route, /\[recipient, \.\.\.ccRecipients, \.\.\.bccRecipients\]/);
  assert.match(route, /blockedRecipient/);
});

test("the company inbox can compose an unassigned email without inventing CRM ownership", () => {
  const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
  const composePage = readFileSync("src/app/communications/new/page.tsx", "utf8");
  const composer = readFileSync("src/components/communication-reply-composer.tsx", "utf8");
  const route = readFileSync("src/app/api/communications/replies/route.ts", "utf8");

  assert.match(inbox, /href="\/communications\/new"/);
  assert.match(composePage, /editableRecipient/);
  assert.match(composePage, /without creating or assigning a lead, customer, or project/);
  assert.match(composer, /form\.set\("recipient", effectiveRecipient\)/);
  assert.match(composer, /Send email/);
  assert.match(route, /created_from: leadId \? "lead_record" : customerId \? "customer_record" : "company_inbox"/);
  assert.match(route, /const outboundSubject = replyingToExistingThread \? replySubject\(canonicalSubject\) : subject/);
  assert.match(route, /"company-inbox-compose"/);
  assert.doesNotMatch(composePage, /leadId=|customerId=|projectId=/);
});
