import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_OUTBOUND_ATTACHMENT_BYTES,
  outboundAttachmentError,
} from "../src/lib/communications/outbound-attachment-core.ts";

test("outbound attachment rules fit within the Vercel request boundary", () => {
  assert.equal(MAX_OUTBOUND_ATTACHMENT_BYTES, 3 * 1024 * 1024);
  assert.equal(outboundAttachmentError([{ name: "plan.pdf", type: "application/pdf", size: 2000 }]), null);
  assert.match(outboundAttachmentError([{ name: "script.exe", type: "application/octet-stream", size: 2000 }]) ?? "", /PDF/);
  assert.match(outboundAttachmentError([{ name: "large.jpg", type: "image/jpeg", size: MAX_OUTBOUND_ATTACHMENT_BYTES + 1 }]) ?? "", /3 MB/);
});

test("Mission Control sends attachments without persisting file contents", () => {
  const route = readFileSync("src/app/api/communications/replies/route.ts", "utf8");
  const provider = readFileSync("src/lib/communications/provider.ts", "utf8");
  const composer = readFileSync("src/components/communication-reply-composer.tsx", "utf8");
  const threadMessages = readFileSync("src/components/communication-thread-messages.tsx", "utf8");
  assert.match(route, /request\.formData\(\)/);
  assert.match(route, /Buffer\.from\(await file\.arrayBuffer\(\)\)\.toString\("base64"\)/);
  assert.match(route, /status: attachments\.length \|\| bccRecipients\.length \? "failed" : "queued"/);
  assert.match(route, /has_attachments: attachments\.length > 0/);
  assert.match(provider, /attachments: message\.attachments/);
  assert.match(composer, /type="file"/);
  assert.match(composer, /new FormData\(\)/);
  assert.match(threadMessages, /message\.provider === "microsoft_graph"/);
  assert.match(threadMessages, /Sent attachments/);
  assert.doesNotMatch(route, /content:\s*attachments/);
});
