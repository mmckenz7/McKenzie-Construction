export type CommunicationPushKind =
  | "inbound_text"
  | "incoming_call"
  | "missed_call";

export type CommunicationPushPayload = {
  kind: CommunicationPushKind | "test";
  identity: string;
  url: string;
  preview?: string;
};

const THREAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const URL_LIKE = /(?:https?:\/\/|www\.)\S+|\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\/(?:\S*)/iu;
const CREDENTIAL_CONTEXT =
  /\b(?:access token|authentication|confirmation|invite|invitation|login|magic link|one[ -]?time|otp|passcode|password|pin|recover|recovery|reset|security code|sign[ -]?in|token|verification|verify)\b/iu;
const LABELED_CODE =
  /\b(?:code|otp|passcode|pin|token)\b.{0,20}\b[A-Za-z0-9._~+/=-]{6,}\b/iu;
const HIGH_ENTROPY_VALUE = /\b[A-Za-z0-9._~+/=-]{20,}\b/u;

function cleanIdentity(value: unknown) {
  if (typeof value !== "string") return "Unknown number";
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80) || "Unknown number";
}

export function maskedPushPhone(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length >= 4 ? `Number ending in ${normalized.slice(-4)}` : "Unknown number";
}

export function pushIdentity(name: unknown, phone: unknown) {
  return typeof name === "string" && name.trim()
    ? cleanIdentity(name)
    : maskedPushPhone(phone);
}

export function safeSmsPushPreview(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || URL_LIKE.test(cleaned)) return null;
  if (CREDENTIAL_CONTEXT.test(cleaned) && (LABELED_CODE.test(cleaned) || HIGH_ENTROPY_VALUE.test(cleaned))) {
    return null;
  }
  const characters = Array.from(cleaned);
  return characters.length <= 72
    ? cleaned
    : `${characters.slice(0, 71).join("")}…`;
}

export function communicationThreadPushPath(threadId: unknown) {
  return typeof threadId === "string" && THREAD_ID.test(threadId)
    ? `/communications/${threadId}`
    : null;
}

export function communicationPushPayload(input: {
  kind: CommunicationPushKind;
  identity: unknown;
  threadId: unknown;
  preview?: unknown;
}) {
  const url = communicationThreadPushPath(input.threadId);
  if (!url) return null;
  const preview = input.kind === "inbound_text"
    ? safeSmsPushPreview(input.preview)
    : null;
  return {
    kind: input.kind,
    identity: cleanIdentity(input.identity),
    url,
    ...(preview ? { preview } : {}),
  } satisfies CommunicationPushPayload;
}

export function pushTestPayload(): CommunicationPushPayload {
  return {
    kind: "test",
    identity: "Phone notifications are ready.",
    url: "/communications",
  };
}
