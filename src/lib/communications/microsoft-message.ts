export const COMMUNICATION_DEPARTMENTS = [
  "general",
  "sales",
  "estimating",
  "operations",
  "billing",
] as const;

export type CommunicationDepartment =
  (typeof COMMUNICATION_DEPARTMENTS)[number];

export type GraphEmailAddress = {
  emailAddress?: {
    address?: string | null;
    name?: string | null;
  } | null;
};

export type GraphInboxMessage = {
  id?: string;
  conversationId?: string | null;
  internetMessageId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: { content?: string | null } | null;
  from?: GraphEmailAddress | null;
  toRecipients?: GraphEmailAddress[] | null;
  ccRecipients?: GraphEmailAddress[] | null;
  receivedDateTime?: string | null;
  isRead?: boolean | null;
  hasAttachments?: boolean | null;
  "@removed"?: { reason?: string };
};

export type MicrosoftThreadState = {
  subject: string | null;
  department: CommunicationDepartment;
  leadId: string | null;
  customerId: string | null;
  participantAddresses: string[];
  lastMessageAt: string;
};

export function normalizedEmailThreadSubject(
  value: string | null | undefined,
) {
  return (value ?? "")
    .trim()
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

export function mergeMicrosoftThreadState(
  existing: MicrosoftThreadState | null,
  incoming: MicrosoftThreadState,
): MicrosoftThreadState {
  if (!existing) {
    return incoming;
  }

  const incomingIsNewer =
    Date.parse(incoming.lastMessageAt) >=
    Date.parse(existing.lastMessageAt);

  return {
    subject:
      incomingIsNewer
        ? incoming.subject ?? existing.subject
        : existing.subject ?? incoming.subject,
    department:
      incomingIsNewer
        ? incoming.department
        : existing.department,
    leadId:
      incoming.leadId ?? existing.leadId,
    customerId:
      incoming.customerId ?? existing.customerId,
    participantAddresses: [
      ...new Set([
        ...existing.participantAddresses,
        ...incoming.participantAddresses,
      ]),
    ],
    lastMessageAt:
      incomingIsNewer
        ? incoming.lastMessageAt
        : existing.lastMessageAt,
  };
}

function cleanAddress(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function graphRecipientAddresses(
  message: GraphInboxMessage,
) {
  return [
    ...(message.toRecipients ?? []),
    ...(message.ccRecipients ?? []),
  ]
    .map((recipient) =>
      cleanAddress(
        recipient.emailAddress?.address,
      ),
    )
    .filter(Boolean);
}

export function departmentForAddresses(
  addresses: string[],
): CommunicationDepartment {
  const localParts = addresses.map(
    (address) =>
      cleanAddress(address).split("@")[0],
  );

  if (
    localParts.some((value) =>
      ["estimate", "estimates", "estimating"].includes(value),
    )
  ) {
    return "estimating";
  }

  if (localParts.includes("sales")) {
    return "sales";
  }

  if (
    localParts.some((value) =>
      ["operations", "projects", "project"].includes(value),
    )
  ) {
    return "operations";
  }

  if (
    localParts.some((value) =>
      ["accounting", "billing", "invoices"].includes(value),
    )
  ) {
    return "billing";
  }

  return "general";
}

export function normalizeGraphInboxMessage(
  message: GraphInboxMessage,
) {
  const envelope =
    normalizeGraphInboxEnvelope(message);

  if (!envelope) {
    return null;
  }

  return {
    ...envelope,
    senderName:
      message.from?.emailAddress?.name?.trim() || null,
    subject: message.subject?.trim() || null,
    body:
      message.body?.content?.trim() ||
      message.bodyPreview?.trim() ||
      "(No message content)",
    isRead: message.isRead === true,
    hasAttachments:
      message.hasAttachments === true,
    department:
      departmentForAddresses(envelope.recipients),
  };
}

export function normalizeGraphInboxEnvelope(
  message: GraphInboxMessage,
) {
  const providerMessageId =
    message.id?.trim() ?? "";
  const providerConversationId =
    message.conversationId?.trim() ?? "";
  const sender = cleanAddress(
    message.from?.emailAddress?.address,
  );
  const recipients =
    graphRecipientAddresses(message);
  const receivedAt =
    message.receivedDateTime?.trim() ?? "";

  if (
    !providerMessageId ||
    !providerConversationId ||
    !sender ||
    !recipients.length ||
    !receivedAt ||
    Number.isNaN(Date.parse(receivedAt))
  ) {
    return null;
  }

  return {
    providerMessageId,
    providerConversationId,
    internetMessageId:
      message.internetMessageId?.trim() || null,
    sender,
    recipients,
    receivedAt,
  };
}

export function isTrustedGraphDeltaUrl(
  value: string,
) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "graph.microsoft.com" &&
      url.pathname.startsWith("/v1.0/")
    );
  } catch {
    return false;
  }
}
