import "server-only";

import { timingSafeEqual } from "node:crypto";

export function trustedCommunicationAutomationRequest(request: Request) {
  const configuredSecret = (
    process.env.COMMUNICATION_PROCESSOR_SECRET ?? process.env.CRON_SECRET
  )?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!configuredSecret || !suppliedSecret) return false;
  const configured = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedSecret);
  return configured.length === supplied.length && timingSafeEqual(configured, supplied);
}
