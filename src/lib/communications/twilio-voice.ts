import "server-only";

import { CommunicationConfigurationError } from "@/lib/communications/provider";

type BridgeCall = {
  teamMemberPhone: string;
  customerPhone: string;
  companyPhone: string;
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new CommunicationConfigurationError(`${name} is not configured.`);
  return value;
}

function xmlText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export async function startTwilioBridgeCall(input: BridgeCall) {
  const accountSid = requiredEnvironment("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnvironment("TWILIO_AUTH_TOKEN");
  const parameters = new URLSearchParams({
    To: input.teamMemberPhone,
    From: input.companyPhone,
    Twiml: `<Response><Dial callerId="${xmlText(input.companyPhone)}"><Number>${xmlText(input.customerPhone)}</Number></Dial></Response>`,
  });
  const statusCallback = process.env.TWILIO_VOICE_STATUS_CALLBACK_URL?.trim();
  if (statusCallback) {
    parameters.set("StatusCallback", statusCallback);
    parameters.set("StatusCallbackMethod", "POST");
    parameters.set("StatusCallbackEvent", "initiated ringing answered completed");
  }
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: parameters,
  });
  let result: Record<string, unknown> = {};
  try { result = await response.json() as Record<string, unknown>; } catch { /* Twilio returned no JSON. */ }
  if (!response.ok || typeof result.sid !== "string") {
    throw new Error(`Twilio could not start the call (${response.status}).`);
  }
  return { callSid: result.sid, status: typeof result.status === "string" ? result.status : "queued" };
}
