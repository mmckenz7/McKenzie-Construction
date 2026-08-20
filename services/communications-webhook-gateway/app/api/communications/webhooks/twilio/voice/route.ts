import { forwardVerifiedWebhook, gatewayFailure, limitedBody } from "../../../../../../lib/gateway";
import { TWILIO_VOICE_PATH } from "../../../../../../lib/routes";
import { verifyTwilioRequest } from "../../../../../../lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await limitedBody(request);
    if (!verifyTwilioRequest(request, body)) return new Response(null, { status: 401 });
    return forwardVerifiedWebhook({
      provider: "twilio",
      pathname: TWILIO_VOICE_PATH,
      body,
      contentType: "application/x-www-form-urlencoded",
      providerHeaders: { "x-twilio-signature": request.headers.get("x-twilio-signature") ?? "" },
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}
