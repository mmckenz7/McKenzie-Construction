import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeAttachment, safeAttachmentFilename } from "../src/lib/communications/microsoft-attachment-core.ts";

test("Microsoft attachment metadata is minimized and file downloads are explicit", () => {
  assert.deepEqual(normalizeAttachment({
    id: "attachment-1",
    name: "deck-photo.jpg",
    contentType: "image/jpeg",
    size: 2048,
    isInline: false,
    "@odata.type": "#microsoft.graph.fileAttachment",
    contentBytes: "must-not-leak",
  }), {
    id: "attachment-1",
    name: "deck-photo.jpg",
    contentType: "image/jpeg",
    size: 2048,
    isInline: false,
    kind: "file",
    canDownload: true,
  });
});

test("reference attachments are visible but not proxied as raw files", () => {
  const attachment = normalizeAttachment({
    id: "attachment-2",
    name: "Plans",
    "@odata.type": "#microsoft.graph.referenceAttachment",
  });
  assert.equal(attachment?.kind, "reference");
  assert.equal(attachment?.canDownload, false);
});

test("attachment filenames remove response-header control characters", () => {
  assert.equal(safeAttachmentFilename("photo\r\nInjected: yes.jpg"), "photoInjected: yes.jpg");
  assert.equal(safeAttachmentFilename("../../customer/photo.jpg"), ".._.._customer_photo.jpg");
  assert.equal(safeAttachmentFilename(""), "email-attachment");
});

test("attachment routes require the Sales workspace and matched Microsoft messages", () => {
  const listRoute = readFileSync("src/app/api/communications/messages/[messageId]/attachments/route.ts", "utf8");
  const downloadRoute = readFileSync("src/app/api/communications/messages/[messageId]/attachments/[attachmentId]/route.ts", "utf8");
  const attachmentLibrary = readFileSync("src/lib/communications/microsoft-attachments.ts", "utf8");
  const attachmentCore = readFileSync("src/lib/communications/microsoft-attachment-core.ts", "utf8");
  const threadPage = readFileSync("src/app/sales/communications/[threadId]/page.tsx", "utf8");
  const threadMessages = readFileSync("src/components/communication-thread-messages.tsx", "utf8");
  assert.match(listRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(downloadRoute, /canAccessWorkspace\(workspace\.access, "sales"\)/);
  assert.match(listRoute, /communicationWorkspaceMatchesSingletonCompany\(supabase, workspace\.access!\.company_id\)/);
  assert.match(downloadRoute, /communicationWorkspaceMatchesSingletonCompany\(supabase, workspace\.access!\.company_id\)/);
  assert.match(attachmentLibrary, /lead_id\.not\.is\.null,customer_id\.not\.is\.null/);
  assert.match(downloadRoute, /Content-Disposition/);
  assert.match(downloadRoute, /X-Content-Type-Options/);
  assert.match(downloadRoute, /Cross-Origin-Resource-Policy/);
  assert.match(downloadRoute, /Cache-Control/);
  assert.match(threadPage, /CommunicationThreadMessages/);
  assert.match(threadMessages, /CommunicationAttachments/);
  assert.doesNotMatch(attachmentLibrary, /contentBytes/);
  assert.doesNotMatch(attachmentCore, /contentBytes/);
});
