export const COMMUNICATION_SECURITY_DISPOSITIONS = [
  "normal",
  "quarantined",
] as const;

export type CommunicationSecurityDisposition =
  (typeof COMMUNICATION_SECURITY_DISPOSITIONS)[number];

export const AUTH_MAIL_DETECTOR_VERSION =
  "secret-bearing-auth-mail-v1";

export const QUARANTINED_AUTH_MAIL_REASON =
  "secret_bearing_authentication_content";

export const QUARANTINED_MESSAGE_SUBJECT =
  "Sensitive authentication message quarantined";

export const QUARANTINED_MESSAGE_BODY =
  "This message was quarantined before its content was stored.";

export const QUARANTINED_MESSAGE_ADDRESS =
  "quarantined@invalid.local";

export type SecretBearingAuthenticationMail = Readonly<{
  disposition: "quarantined";
  reasonCode: typeof QUARANTINED_AUTH_MAIL_REASON;
  detectorVersion: typeof AUTH_MAIL_DETECTOR_VERSION;
}>;

type QuarantinedCommunicationAudit = Readonly<{
  internetMessageId?: string | null;
  mailboxId?: string | null;
  provider: string;
  providerConversationId: string;
  providerMessageId: string;
  receivedAt: string;
}>;

type AuthenticationMailInput = Readonly<{
  body?: string | null;
  bodyPreview?: string | null;
  sender?: string | null;
  subject?: string | null;
}>;

const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;
const OTP_CONTEXT =
  /\b(?:one[ -]?time|single[ -]?use|temporary|verification|authentication|security|sign[ -]?in|login|password reset|recovery|invitation)\s+(?:passcode|password|pin|code)\b[^\d]{0,40}\b\d{6,8}\b/iu;
const JWT_VALUE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u;
const TOKEN_VALUE = /^[A-Za-z0-9%._~+/=-]+$/u;
const AUTHENTICATION_PATH =
  /(?:^|\/)(?:auth(?:\/v\d+)?\/(?:verify|callback|confirm)|reset-password|password-reset|recover|recovery|magic-link|magiclink|invite|invitation|verify-email)(?:\/|$)/iu;
const AUTHENTICATION_CONTEXT =
  /\b(?:authentication|authorize|confirmation|email verification|invite|invitation|login|magic link|one[ -]?time|otp|password reset|recover|recovery|sign[ -]?in|verify)\b/iu;
const STRONG_SECRET_PARAMETERS = new Set([
  "access_token",
  "confirmation_token",
  "invite_token",
  "invitation_token",
  "magic_link_token",
  "otp",
  "recovery_token",
  "refresh_token",
  "token_hash",
]);
const CONTEXTUAL_SECRET_PARAMETERS = new Set([
  "code",
  "token",
]);

function decoded(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function secretLike(value: string) {
  const candidate = decoded(value.trim());
  if (/^\d{6,8}$/u.test(candidate)) return true;
  if (JWT_VALUE.test(candidate)) return true;
  if (candidate.length < 20 || !TOKEN_VALUE.test(candidate)) return false;
  return /[A-Za-z]/u.test(candidate);
}

function authenticationContext(
  url: URL,
  inputContext: string,
) {
  return (
    AUTHENTICATION_PATH.test(url.pathname) ||
    AUTHENTICATION_CONTEXT.test(inputContext) ||
    (url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/auth/"))
  );
}

function urlContainsAuthenticationSecret(
  rawCandidate: string,
  inputContext: string,
) {
  const candidate = rawCandidate
    .replace(/&amp;/giu, "&")
    .replace(/[),.;\]}]+$/u, "");
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    const hasAuthPath = AUTHENTICATION_PATH.test(candidate);
    const hasSecretParameter =
      /(?:[?&#]|&amp;)(?:access_token|code|confirmation_token|invite_token|invitation_token|magic_link_token|otp|recovery_token|refresh_token|token|token_hash)=[A-Za-z0-9%._~+/=-]{6,}/iu.test(candidate);
    return hasAuthPath && hasSecretParameter;
  }

  const context = authenticationContext(url, inputContext);
  const entries = [
    ...url.searchParams.entries(),
    ...new URLSearchParams(url.hash.replace(/^#/u, "")).entries(),
  ];
  for (const [rawName, value] of entries) {
    const name = rawName.toLowerCase();
    if (STRONG_SECRET_PARAMETERS.has(name) && secretLike(value)) return true;
    if (context && CONTEXTUAL_SECRET_PARAMETERS.has(name) && secretLike(value)) return true;
  }

  if (!context) return false;
  return url.pathname
    .split("/")
    .filter(Boolean)
    .some((segment) => secretLike(segment));
}

export function classifySecretBearingAuthenticationMail(
  input: AuthenticationMailInput,
): SecretBearingAuthenticationMail | null {
  const body = input.body ?? "";
  const bodyPreview = input.bodyPreview ?? "";
  const content = `${body}\n${bodyPreview}`;
  const inputContext = `${input.sender ?? ""}\n${input.subject ?? ""}\n${content}`;

  const urls = content.match(URL_CANDIDATE) ?? [];
  const containsSecret =
    urls.some((url) =>
      urlContainsAuthenticationSecret(url, inputContext),
    ) || OTP_CONTEXT.test(content);

  if (!containsSecret) return null;
  return {
    disposition: "quarantined",
    reasonCode: QUARANTINED_AUTH_MAIL_REASON,
    detectorVersion: AUTH_MAIL_DETECTOR_VERSION,
  };
}

export function quarantinedCommunicationRecords(
  audit: QuarantinedCommunicationAudit,
  classification: SecretBearingAuthenticationMail,
  redactedAt: string,
) {
  return {
    thread: {
      provider: audit.provider,
      provider_thread_id:
        `quarantine:${audit.providerMessageId}`,
      subject: QUARANTINED_MESSAGE_SUBJECT,
      department: "general",
      status: "archived",
      lead_id: null,
      customer_id: null,
      assigned_to_id: null,
      participant_addresses: [],
      unread_count: 0,
      last_message_at: audit.receivedAt,
      metadata: {},
      security_disposition: "quarantined",
    },
    message: {
      channel: "email",
      direction: "inbound",
      sender: QUARANTINED_MESSAGE_ADDRESS,
      recipient: QUARANTINED_MESSAGE_ADDRESS,
      subject: QUARANTINED_MESSAGE_SUBJECT,
      body: QUARANTINED_MESSAGE_BODY,
      status: "received",
      provider: audit.provider,
      provider_message_id: audit.providerMessageId,
      lead_id: null,
      received_at: audit.receivedAt,
      mailbox_id: audit.mailboxId ?? null,
      provider_conversation_id:
        audit.providerConversationId,
      internet_message_id:
        audit.internetMessageId ?? null,
      is_read: true,
      has_attachments: false,
      department: "general",
      metadata: {},
      security_disposition: classification.disposition,
      security_reason_code: classification.reasonCode,
      security_detector_version:
        classification.detectorVersion,
      content_redacted_at: redactedAt,
    },
  } as const;
}
