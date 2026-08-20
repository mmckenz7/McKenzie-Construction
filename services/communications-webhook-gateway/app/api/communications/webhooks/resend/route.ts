import { forwardVerifiedWebhook, gatewayFailure, limitedBody } from "../../../../../lib/gateway";
import { verifyResendRequest, resendVerificationHeaders } from "../../../../../lib/resend";
import { RESEND_PATH } from "../../../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await limitedBody(request);
    if (!verifyResendRequest(request, body)) return new Response(null, { status: 401 });
    return forwardVerifiedWebhook({
      provider: "resend",
      pathname: RESEND_PATH,
      body,
      contentType: "application/json",
      providerHeaders: resendVerificationHeaders(request) ?? {},
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}
