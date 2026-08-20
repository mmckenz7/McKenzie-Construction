import "server-only";

const MAX_WEBHOOK_BYTES = 1_000_000;
const FORWARD_TIMEOUT_MS = 12_000;

type Provider = "twilio" | "resend";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function targetUrl(pathname: string) {
  const targetBase = requiredEnvironment("GATEWAY_TARGET_BASE_URL");
  const parsed = new URL(targetBase);
  if (parsed.protocol !== "https:") throw new Error("GATEWAY_TARGET_BASE_URL must use HTTPS.");
  return new URL(pathname, parsed).toString();
}

export async function limitedBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    throw new RangeError("Webhook payload is too large.");
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BYTES) {
    throw new RangeError("Webhook payload is too large.");
  }
  return body;
}

export async function forwardProviderWebhook(input: {
  provider: Provider;
  pathname: string;
  body: string;
  contentType: string;
  providerHeaders: Record<string, string>;
}) {
  const bypassSecret = requiredEnvironment("GATEWAY_VERCEL_BYPASS_SECRET");
  const response = await fetch(targetUrl(input.pathname), {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    headers: {
      "Content-Type": input.contentType,
      "User-Agent": `mckenzie-${input.provider}-webhook-gateway/1.0`,
      "x-vercel-protection-bypass": bypassSecret,
      ...input.providerHeaders,
    },
    body: input.body,
  });

  const responseBody = await response.text();
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": response.headers.get("content-type") ?? "text/plain; charset=utf-8",
  });
  return new Response(responseBody, { status: response.status, headers });
}

export function gatewayFailure(error: unknown) {
  if (error instanceof RangeError) {
    return Response.json({ success: false, error: error.message }, { status: 413 });
  }
  console.error("Provider webhook forwarding failed.", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ success: false, error: "The provider webhook could not be forwarded." }, { status: 502 });
}
