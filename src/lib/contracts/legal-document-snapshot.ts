import "server-only";

import { createHash } from "node:crypto";

export type LegalDocumentSnapshotSource = Readonly<{
  id: string;
  document_type: string;
  title: string;
  version_label: string;
  source_kind: string;
  boilerplate_body: string | null;
  content_sha256: string | null;
  legal_review_status: string;
}>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
export function buildLegalDocumentSnapshot(
  document: LegalDocumentSnapshotSource,
  selectedAt: string,
) {
  const contentSha256 = document.source_kind === "boilerplate"
    ? sha256(document.boilerplate_body ?? "")
    : document.content_sha256;
  if (!contentSha256 || !/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new TypeError("The selected legal document does not have a verified content digest.");
  }
  return Object.freeze({
    schemaVersion: "company-legal-document-snapshot-v1",
    documentId: document.id,
    documentType: document.document_type,
    title: document.title,
    versionLabel: document.version_label,
    sourceKind: document.source_kind,
    legalReviewStatus: document.legal_review_status,
    contentSha256,
    selectedAt,
  });
}
