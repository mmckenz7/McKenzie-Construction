export const RESEND_DELIVERY_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.failed",
  "email.suppressed",
  "email.complained",
] as const;

export type ResendDeliveryEventType = typeof RESEND_DELIVERY_EVENT_TYPES[number];

const deliveryEvents = new Set<string>(RESEND_DELIVERY_EVENT_TYPES);

export type ResendDeliveryEvent = {
  type: ResendDeliveryEventType;
  createdAt: string;
  emailId: string;
  metadata: Record<string, unknown>;
};

function text(value: unknown, maxLength = 300) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

export function normalizeResendDeliveryEvent(value: unknown): ResendDeliveryEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { type?: unknown; created_at?: unknown; data?: unknown };
  if (typeof record.type !== "string" || !deliveryEvents.has(record.type)) return null;
  if (typeof record.created_at !== "string" || !Number.isFinite(Date.parse(record.created_at))) return null;
  if (!record.data || typeof record.data !== "object") return null;
  const data = record.data as Record<string, unknown>;
  const emailId = text(data.email_id, 200);
  if (!emailId) return null;

  const bounce = data.bounce && typeof data.bounce === "object"
    ? data.bounce as Record<string, unknown>
    : null;
  const metadata: Record<string, unknown> = {};
  const error = text(data.error ?? data.reason ?? data.message);
  const bounceType = text(bounce?.type, 100);
  const bounceSubtype = text(bounce?.subType ?? bounce?.subtype, 100);
  if (error) metadata.provider_detail = error;
  if (bounceType) metadata.bounce_type = bounceType;
  if (bounceSubtype) metadata.bounce_subtype = bounceSubtype;

  return {
    type: record.type as ResendDeliveryEventType,
    createdAt: record.created_at,
    emailId,
    metadata,
  };
}

export function communicationStatusForResendEvent(type: ResendDeliveryEventType) {
  if (type === "email.delivered") return "delivered" as const;
  if (type === "email.failed") return "failed" as const;
  if (["email.bounced", "email.suppressed", "email.complained"].includes(type)) {
    return "undelivered" as const;
  }
  return "sent" as const;
}

export function outboxStatusForResendEvent(type: ResendDeliveryEventType) {
  return ["email.bounced", "email.failed", "email.suppressed", "email.complained"].includes(type)
    ? "failed" as const
    : "sent" as const;
}

export function eventIsNewer(currentMetadata: unknown, eventCreatedAt: string) {
  if (!currentMetadata || typeof currentMetadata !== "object") return true;
  const current = (currentMetadata as { resend_event_created_at?: unknown }).resend_event_created_at;
  if (typeof current !== "string" || !Number.isFinite(Date.parse(current))) return true;
  return Date.parse(eventCreatedAt) >= Date.parse(current);
}
