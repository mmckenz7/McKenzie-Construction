import { NextRequest } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  logPublicTokenSupabaseFailure,
  publicTokenJson,
} from "@/lib/public-token-api";
import { enforcePublicTokenRateLimit } from "@/lib/public-token-rate-limit";

type RouteContext = { params: Promise<{ token: string }> };
type AccessBody = { accessId?: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable() {
  const failure = createPublicTokenFailure("unavailable");
  return publicTokenJson(failure.body, { status: failure.status, headers: failure.headers });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const limited = await enforcePublicTokenRateLimit({
    request,
    token,
    routeCategory: "estimate_proposal",
    method: "POST",
  });
  if (limited) return limited;
  if (!UUID.test(token) || isPublicTokenBodyTooLarge(request.headers.get("content-length"))) {
    return unavailable();
  }

  let body: AccessBody;
  try {
    body = await request.json() as AccessBody;
  } catch {
    return unavailable();
  }
  if (typeof body.accessId !== "string" || !UUID.test(body.accessId)) return unavailable();

  const result = await createAdminServerClient().rpc(
    "confirm_estimate_proposal_browser_access",
    { requested_token: token, requested_access_id: body.accessId },
  );
  if (result.error) {
    const failure = createPublicTokenFailure("unexpected");
    logPublicTokenSupabaseFailure({
      operation: "confirm_estimate_proposal_browser_access",
      routeCategory: "estimate_proposal",
      method: "POST",
      error: result.error,
      status: failure.status,
    });
    return publicTokenJson(failure.body, { status: failure.status, headers: failure.headers });
  }
  if (!result.data || typeof result.data !== "object" || result.data.recorded !== true) {
    return unavailable();
  }

  return publicTokenJson({ success: true });
}
