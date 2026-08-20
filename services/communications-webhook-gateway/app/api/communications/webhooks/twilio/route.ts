import { forwardProviderWebhook, gatewayFailure, limitedBody } from "../../../../../lib/gateway";
import { TWILIO_MESSAGE_PATH } from "../../../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await limitedBody(request);
    const signature = request.headers.get("x-twilio-signature")?.trim();
    if (!signature) return new Response(null, { status: 401 });
    return forwardProviderWebhook({
      provider: "twilio",
      pathname: TWILIO_MESSAGE_PATH,
      body,
      contentType: "application/x-www-form-urlencoded",
      providerHeaders: { "x-twilio-signature": signature },
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}
