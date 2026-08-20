import "server-only";

import twilio from "twilio";

export { normalizedPhone } from "@/lib/communications/phone";

function requestParameters(form: FormData) {
  const parameters: Record<string, string | string[]> = {};
  for (const [key, rawValue] of form.entries()) {
    const value = String(rawValue);
    const existing = parameters[key];
    if (existing === undefined) parameters[key] = value;
    else parameters[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return parameters;
}

export function validateTwilioWebhook(request: Request, form: FormData) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!authToken || !signature) return false;

  const requested = new URL(request.url);
  const configuredBase = process.env.TWILIO_WEBHOOK_BASE_URL?.trim();
  const validationUrl = configuredBase
    ? new URL(`${requested.pathname}${requested.search}`, configuredBase).toString()
    : requested.toString();
  return twilio.validateRequest(authToken, signature, validationUrl, requestParameters(form));
}
