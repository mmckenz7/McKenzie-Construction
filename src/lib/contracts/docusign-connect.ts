import { createHash } from "node:crypto";

export type DocusignConnectEvent = Readonly<{
  contractPreparationId: string;
  envelopeId: string;
  eventId: string;
  eventType: "sent" | "delivered" | "completed" | "declined" | "voided";
  metadata: Record<string, unknown>;
  occurredAt: string;
  payloadSha256: string;
}>;

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function text(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function customPreparationId(summary: Record<string, unknown>) {
  const customFields = record(summary.customFields);
  const fields = Array.isArray(customFields?.textCustomFields) ? customFields.textCustomFields : [];
  for (const candidate of fields) {
    const field = record(candidate);
    if (text(field?.name, 100) === "contract_preparation_id") return text(field?.value, 100);
  }
  return null;
}

export function normalizeDocusignConnectEvent(rawBody: string): DocusignConnectEvent | null {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return null; }
  const root = record(parsed);
  const data = record(root?.data);
  const summary = record(data?.envelopeSummary) ?? data;
  if (!root || !data || !summary) return null;

  const envelopeId = text(data.envelopeId ?? summary.envelopeId, 200);
  const eventName = text(root.event, 100)?.toLowerCase();
  const status = text(summary.status, 100)?.toLowerCase();
  const eventType = status === "completed" || eventName?.endsWith("completed") ? "completed"
    : status === "declined" || eventName?.endsWith("declined") ? "declined"
      : status === "voided" || eventName?.endsWith("voided") ? "voided"
        : status === "delivered" || eventName?.endsWith("delivered") ? "delivered"
          : status === "sent" || eventName?.endsWith("sent") ? "sent" : null;
  const occurredAt = text(root.generatedDateTime ?? summary.statusChangedDateTime, 100);
  const contractPreparationId = customPreparationId(summary);
  if (!envelopeId || !eventType || !occurredAt || !Number.isFinite(Date.parse(occurredAt)) || !contractPreparationId) return null;

  const payloadSha256 = createHash("sha256").update(rawBody, "utf8").digest("hex");
  return {
    contractPreparationId,
    envelopeId,
    eventId: `${envelopeId}:${eventType}:${occurredAt}`,
    eventType,
    occurredAt,
    payloadSha256,
    metadata: { docusign_event: eventName, docusign_status: status },
  };
}
