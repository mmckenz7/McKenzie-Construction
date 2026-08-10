import "server-only";

export type OutboundCommunication = Readonly<{
  id: string;
  channel: "email" | "sms";
  recipient: string;
  sender: string;
  replyTo: string | null;
  ccRecipients: readonly string[];
  subject: string | null;
  body: string;
  idempotencyKey: string;
  provider: string;
  headers?: Readonly<Record<string, string>>;
  attachments?: readonly Readonly<{ filename: string; content: string }>[];
}>;

export type DeliveryResult = Readonly<{
  providerMessageId: string;
  acceptedStatus: string;
}>;

export class CommunicationConfigurationError extends Error {
  readonly code = "provider_not_configured";

  constructor(message: string) {
    super(message);
    this.name = "CommunicationConfigurationError";
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new CommunicationConfigurationError(`${name} is not configured.`);
  return value;
}

async function responseJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function sendWithResend(message: OutboundCommunication): Promise<DeliveryResult> {
  const apiKey = requiredEnvironment("RESEND_API_KEY");
  const from = message.sender.trim() || requiredEnvironment("COMMUNICATION_FROM_EMAIL");
  if (!message.subject) throw new TypeError("Email subject is required.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      reply_to: message.replyTo || undefined,
      to: [message.recipient],
      cc: message.ccRecipients,
      subject: message.subject,
      text: message.body,
      headers: message.headers,
      attachments: message.attachments,
    }),
  });
  const result = await responseJson(response);
  if (!response.ok || typeof result.id !== "string") {
    const detail = typeof result.message === "string" && result.message.trim()
      ? ` ${result.message.trim().slice(0, 300)}`
      : "";
    throw new Error(`Resend rejected the email (${response.status}).${detail}`);
  }
  return { providerMessageId: result.id, acceptedStatus: "accepted" };
}

async function sendWithTwilio(message: OutboundCommunication): Promise<DeliveryResult> {
  const accountSid = requiredEnvironment("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnvironment("TWILIO_AUTH_TOKEN");
  const from = message.sender.trim() || requiredEnvironment("COMMUNICATION_FROM_PHONE");
  const parameters = new URLSearchParams({
    To: message.recipient,
    From: from,
    Body: message.body,
  });
  const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (statusCallback) parameters.set("StatusCallback", statusCallback);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parameters,
    },
  );
  const result = await responseJson(response);
  if (!response.ok || typeof result.sid !== "string") {
    throw new Error(`Twilio rejected the message (${response.status}).`);
  }
  return {
    providerMessageId: result.sid,
    acceptedStatus: typeof result.status === "string" ? result.status : "queued",
  };
}

export async function deliverCommunication(message: OutboundCommunication) {
  if (message.channel === "email" && message.provider === "resend") {
    return sendWithResend(message);
  }
  if (message.channel === "sms" && message.provider === "twilio") {
    return sendWithTwilio(message);
  }
  throw new CommunicationConfigurationError(
    `${message.channel === "email" ? "Email" : "SMS"} delivery is still set to manual.`,
  );
}
