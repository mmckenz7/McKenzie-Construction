import "server-only";

import { Webhook } from "svix";

export function resendVerificationHeaders(request: Request) {
  const id = request.headers.get("svix-id")?.trim();
  const timestamp = request.headers.get("svix-timestamp")?.trim();
  const signature = request.headers.get("svix-signature")?.trim();
  return id && timestamp && signature
    ? { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }
    : null;
}

export function verifyResendRequest(request: Request, body: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const headers = resendVerificationHeaders(request);
  if (!secret || !headers) return false;
  try {
    new Webhook(secret).verify(body, headers);
    return true;
  } catch {
    return false;
  }
}
