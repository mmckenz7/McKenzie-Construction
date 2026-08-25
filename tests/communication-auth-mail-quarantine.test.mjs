import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTH_MAIL_DETECTOR_VERSION,
  classifySecretBearingAuthenticationMail,
  QUARANTINED_AUTH_MAIL_REASON,
  QUARANTINED_MESSAGE_BODY,
  QUARANTINED_MESSAGE_SUBJECT,
  quarantinedCommunicationRecords,
} from "../src/lib/communications/security.ts";

const syntheticToken =
  "syntheticRecoveryToken_1234567890";

function classificationFor(overrides = {}) {
  return classifySecretBearingAuthenticationMail({
    sender: "system@example.test",
    subject: "Account notice",
    body: "No credential-bearing content.",
    ...overrides,
  });
}

test("credential-bearing authentication URLs are quarantined across providers", () => {
  const cases = [
    {
      subject: "Password assistance",
      body: `Continue at https://project.supabase.co/auth/v1/verify?token=${syntheticToken}&type=recovery`,
    },
    {
      subject: "Invitation",
      body: `Accept at https://accounts.example.test/invitation?invite_token=${syntheticToken}`,
    },
    {
      subject: "Magic link",
      body: `Sign in at https://accounts.example.test/magic-link?token=${syntheticToken}`,
    },
    {
      subject: "Authorization",
      body: "Open https://accounts.example.test/auth/callback#access_token=aaaabbbb.ccccdddd.eeeeffff",
    },
    {
      subject: "Email verification",
      body: `Open <a href="https://accounts.example.test/verify-email?token_hash=${syntheticToken}&amp;type=signup">Verify</a>`,
    },
    {
      subject: "Malformed recovery link",
      body: `Open https://accounts.example.test/recovery?token=${syntheticToken}%ZZ`,
    },
    {
      subject: "Account recovery",
      body: "Open https://accounts.example.test/recovery?token=abcdefghijklmnopqrstuvwxyzABCD",
    },
  ];

  for (const input of cases) {
    assert.deepEqual(classificationFor(input), {
      disposition: "quarantined",
      reasonCode: QUARANTINED_AUTH_MAIL_REASON,
      detectorVersion: AUTH_MAIL_DETECTOR_VERSION,
    });
  }
});

test("one-time authentication codes are quarantined without sender assumptions", () => {
  assert.ok(classificationFor({
    sender: "unknown@example.test",
    subject: "A message",
    body: "Your one-time sign-in code is 483920.",
  }));
  assert.ok(classificationFor({
    sender: "unknown@example.test",
    subject: "A message",
    body: "Temporary security PIN: 84027155",
  }));
});

test("sender and subject alone never classify a message", () => {
  assert.equal(classificationFor({
    sender: "auth@example.test",
    subject: "Reset your password",
    body: "A password-reset request was received, but this notice contains no link or code.",
  }), null);
});

test("benign high-entropy business URLs and ordinary numbers remain visible", () => {
  assert.equal(classificationFor({
    subject: "Invoice available",
    body: `Invoice https://billing.example.test/invoices/${syntheticToken} totals 483920 dollars.`,
  }), null);
  assert.equal(classificationFor({
    subject: "Project reference",
    body: `Reference https://projects.example.test/items?code=${syntheticToken}`,
  }), null);
});

test("bodyPreview is classified when Graph omits a body", () => {
  assert.ok(classificationFor({
    body: null,
    bodyPreview: `Recovery: https://accounts.example.test/password-reset?code=${syntheticToken}`,
  }));
});

test("quarantine records retain only placeholders and non-secret audit fields", () => {
  const classification = classificationFor({
    body: `https://accounts.example.test/recovery?token=${syntheticToken}`,
  });
  assert.ok(classification);
  const records = quarantinedCommunicationRecords({
    provider: "provider_test",
    providerMessageId: "provider-message-1",
    providerConversationId: "provider-conversation-1",
    internetMessageId: "<audit-id@example.test>",
    mailboxId: "mailbox-1",
    receivedAt: "2026-08-25T18:00:00.000Z",
  }, classification, "2026-08-25T18:00:01.000Z");
  const serialized = JSON.stringify(records);

  assert.equal(records.thread.security_disposition, "quarantined");
  assert.equal(records.thread.status, "archived");
  assert.deepEqual(records.thread.participant_addresses, []);
  assert.equal(records.message.subject, QUARANTINED_MESSAGE_SUBJECT);
  assert.equal(records.message.body, QUARANTINED_MESSAGE_BODY);
  assert.equal(records.message.has_attachments, false);
  assert.equal(records.message.is_read, true);
  assert.equal(records.message.security_reason_code, QUARANTINED_AUTH_MAIL_REASON);
  assert.equal(records.message.security_detector_version, AUTH_MAIL_DETECTOR_VERSION);
  assert.doesNotMatch(serialized, new RegExp(syntheticToken));
  assert.deepEqual(Object.keys(classification).sort(), [
    "detectorVersion",
    "disposition",
    "reasonCode",
  ]);
});

test("Graph quarantine happens before associations, visible threads, or body persistence", () => {
  const graph = readFileSync("src/lib/communications/microsoft-graph.ts", "utf8");
  const security = readFileSync("src/lib/communications/security.ts", "utf8");
  const storeStart = graph.indexOf("async function storeMessage");
  const storeBody = graph.slice(storeStart, graph.indexOf("async function refreshThreadUnreadCounts"));
  assert.ok(storeBody.indexOf("classifySecretBearingAuthenticationMail") < storeBody.indexOf("findRelatedRecords"));
  assert.ok(storeBody.indexOf("storeQuarantinedMessage") < storeBody.indexOf("findRelatedRecords"));
  assert.match(graph, /existingMessage[\s\S]*?provider_message_id[\s\S]*?if \(existingMessage\.data\) return false/);
  assert.match(graph, /quarantinedCommunicationRecords/);
  assert.match(security, /security_disposition: "quarantined"/);
  assert.match(graph, /security_disposition: "normal"/);
  assert.doesNotMatch(graph.slice(graph.indexOf("async function storeQuarantinedMessage"), storeStart), /rawMessage/);
});

test("list, count, search, and related-record projections fail closed", () => {
  const inbox = readFileSync("src/app/sales/communications/page.tsx", "utf8");
  const allWork = readFileSync("src/app/all-work/page.tsx", "utf8");
  const contactThreads = readFileSync("src/lib/communications/contact-threads.ts", "utf8");
  const projectActivity = readFileSync("src/app/api/projects/[projectId]/activity/route.ts", "utf8");

  assert.ok((inbox.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 2);
  assert.match(allWork, /\.eq\("security_disposition", "normal"\)/u);
  assert.ok((contactThreads.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 2);
  assert.match(projectActivity, /\.eq\("security_disposition", "normal"\)/u);
});

test("detail, mutation, reply, text, and attachment direct access fails closed", () => {
  const detail = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
  const threadApi = readFileSync("src/app/api/communications/threads/[threadId]/route.ts", "utf8");
  const replies = readFileSync("src/app/api/communications/replies/route.ts", "utf8");
  const texts = readFileSync("src/app/api/communications/texts/route.ts", "utf8");
  const attachments = readFileSync("src/lib/communications/microsoft-attachments.ts", "utf8");

  assert.ok((detail.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 2);
  assert.match(detail, /if \(threadResult\.error \|\| !threadResult\.data\) notFound\(\)/u);
  assert.ok((threadApi.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 8);
  assert.ok((replies.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 5);
  assert.ok((texts.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 2);
  assert.ok((attachments.match(/\.eq\("security_disposition", "normal"\)/gu) ?? []).length >= 2);
});

test("provider callbacks and normal communication writers preserve the disposition boundary", () => {
  const processor = readFileSync("src/lib/communications/processor.ts", "utf8");
  const graph = readFileSync("src/lib/communications/microsoft-graph.ts", "utf8");
  const resend = readFileSync("src/app/api/communications/webhooks/resend/route.ts", "utf8");
  const twilio = readFileSync("src/app/api/communications/webhooks/twilio/route.ts", "utf8");
  const voice = readFileSync("src/app/api/communications/webhooks/twilio/voice/route.ts", "utf8");
  const calls = readFileSync("src/app/api/communications/calls/route.ts", "utf8");
  const texts = readFileSync("src/app/api/communications/texts/route.ts", "utf8");
  const replies = readFileSync("src/app/api/communications/replies/route.ts", "utf8");

  assert.match(processor, /communication_messages"\)\.upsert\([\s\S]*?security_disposition: "normal"[\s\S]*?ignoreDuplicates: true/u);
  assert.match(resend, /communication_messages"\)[\s\S]*?\.select\("id,metadata"\)[\s\S]*?\.eq\("security_disposition", "normal"\)\.maybeSingle\(\)/u);
  assert.match(resend, /communication_messages"\)\.update\([\s\S]*?\.eq\("id", messageResult\.data\.id\)\.eq\("security_disposition", "normal"\)/u);

  assert.match(twilio, /communication_threads"\)[\s\S]*?\.eq\("provider_thread_id", providerThreadId\)[\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.match(twilio, /communication_threads"\)\.update\(values\)[\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.match(twilio, /communication_messages"\)\.upsert\([\s\S]*?security_disposition: "normal"[\s\S]*?ignoreDuplicates: true/u);
  assert.match(twilio, /communication_messages"\)\.update\([\s\S]*?\.eq\("direction", "outbound"\)\.eq\("security_disposition", "normal"\)/u);

  assert.match(voice, /communication_messages"\)[\s\S]*?\.eq\("channel", "voice"\)\.eq\("security_disposition", "normal"\)\.maybeSingle\(\)/u);
  assert.match(voice, /communication_messages"\)\.update\([\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.match(calls, /communication_messages"\)\.insert\([\s\S]*?security_disposition: "normal"/u);

  assert.match(texts, /communication_threads"\)[\s\S]*?\.eq\("provider_thread_id", providerThreadId\)[\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.match(texts, /communication_threads"\)\.update\(threadValues\)[\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.match(texts, /communication_messages"\)\.upsert\([\s\S]*?security_disposition: "normal"[\s\S]*?ignoreDuplicates: true/u);
  assert.match(replies, /communication_threads"\)\.insert\([\s\S]*?security_disposition: "normal"/u);
  assert.match(replies, /communication_messages"\)\.insert\([\s\S]*?security_disposition: "normal"/u);

  assert.match(graph, /existingMessageResult[\s\S]*?security_disposition !== "normal"[\s\S]*?return false/u);
  assert.match(graph, /communication_threads"\)[\s\S]*?\.update\(threadValues\)[\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.match(graph, /communication_messages"\)[\s\S]*?\.update\(messageValues\)[\s\S]*?\.eq\("security_disposition", "normal"\)/u);
  assert.doesNotMatch(graph, /communication_(?:threads|messages)"\)\s*\.upsert/u);
});

test("migration establishes durable dispositions and suppresses customer receipt events", () => {
  const migration = readFileSync(
    "supabase/migrations/20260825190000_communication_auth_mail_quarantine.sql",
    "utf8",
  );
  assert.match(migration, /communication_threads[\s\S]*?security_disposition text not null default 'normal'/);
  assert.match(migration, /communication_messages[\s\S]*?security_disposition text not null default 'normal'/);
  assert.match(migration, /security_reason_code text/);
  assert.match(migration, /security_detector_version text/);
  assert.match(migration, /content_redacted_at timestamptz/);
  assert.match(migration, /communication_threads_quarantine_container_check/);
  assert.ok((migration.match(/subject is not distinct from 'Sensitive authentication message quarantined'/gu) ?? []).length >= 2);
  assert.match(migration, /sender = 'quarantined@invalid\.local'/);
  assert.match(migration, /body = 'This message was quarantined before its content was stored\.'/);
  assert.match(migration, /validate_communication_message_security_disposition/);
  assert.match(migration, /validate_communication_thread_security_disposition/);
  assert.match(migration, /deferrable initially deferred/);
  assert.match(migration, /from public\.communication_messages as message[\s\S]*?where message\.id = new\.id/iu);
  assert.match(migration, /where security_disposition = 'normal'/);
  assert.match(migration, /when \(new\.security_disposition = 'normal'\)/);
  assert.doesNotMatch(migration, /update\s+public\.communication_messages\s+set/iu);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.communication/iu);
});

test("transaction-level SQL covers null rejection, disposition consistency, and event parity", () => {
  const verification = readFileSync(
    "supabase/tests/communication_auth_mail_quarantine.sql",
    "utf8",
  );
  assert.match(verification, /^begin;/u);
  assert.match(verification, /rollback;\s*$/u);
  assert.match(verification, /NULL subject to be rejected/gu);
  assert.match(verification, /normal message in a quarantined thread to be rejected/gu);
  assert.match(verification, /quarantined message in a normal thread to be rejected/gu);
  assert.match(verification, /Deferred same-transaction conversion/gu);
  assert.match(verification, /thread-only quarantine conversion to be rejected/gu);
  assert.match(verification, /message-only quarantine conversion to be rejected/gu);
  assert.match(verification, /communication\.customer_email_received/gu);
  assert.match(verification, /communication\.employee_email_sent/gu);
  assert.match(verification, /communication\.email_delivery_confirmed/gu);
  assert.match(verification, /communication\.email_bounced/gu);
  assert.match(verification, /Quarantined insert or update emitted a Mission Control event/gu);
  assert.doesNotMatch(verification, /https?:\/\//u);
});
