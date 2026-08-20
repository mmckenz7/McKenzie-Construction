import "server-only";

import twilio from "twilio";

import { publicRequestUrl } from "./gateway";

export function twilioParameters(body: string) {
  const values = new URLSearchParams(body);
  const parameters: Record<string, string | string[]> = {};
  for (const [key, value] of values.entries()) {
    const current = parameters[key];
    if (current === undefined) parameters[key] = value;
    else parameters[key] = Array.isArray(current) ? [...current, value] : [current, value];
  }
  return parameters;
}

export function verifyTwilioRequest(request: Request, body: string) {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, publicRequestUrl(request), twilioParameters(body));
}
