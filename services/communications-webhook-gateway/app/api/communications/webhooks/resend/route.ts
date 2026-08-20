import { forwardProviderWebhook, gatewayFailure, limitedBody } from "../../../../../lib/gateway";
import { RESEND_PATH } from "../../../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await limitedBody(request);
    const id = request.headers.get("svix-id")?.trim();
    const timestamp = request.headers.get("svix-timestamp")?.trim();
    const signature = request.headers.get("svix-signature")?.trim();
    if (!id || !timestamp || !signature) return new Response(null, { status: 401 });
    return forwardProviderWebhook({
      provider: "resend",
      pathname: RESEND_PATH,
      body,
      contentType: "application/json",
      providerHeaders: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}
