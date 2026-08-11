import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  logPublicTokenSupabaseFailure,
  minimizeEstimateProposalPayload,
  publicTokenJson,
} from "@/lib/public-token-api";
import { enforcePublicTokenRateLimit } from "@/lib/public-token-rate-limit";

type RouteContext = { params: Promise<{ token: string }> };
type ResponseBody = {
  response?: "accepted" | "declined";
  customerName?: string;
  notes?: string | null;
  acknowledgedNonbinding?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable() {
  const failure = createPublicTokenFailure("unavailable");
  return publicTokenJson(failure.body, { status: failure.status, headers: failure.headers });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const limited = await enforcePublicTokenRateLimit({ request, token, routeCategory: "estimate_proposal", method: "GET" });
  if (limited) return limited;
  if (!UUID.test(token)) return unavailable();

  const result = await createAdminServerClient().rpc("get_estimate_proposal_by_token", {
    requested_token: token,
    requested_access_id: randomUUID(),
  });
  if (result.error) {
    const failure = createPublicTokenFailure("unexpected");
    logPublicTokenSupabaseFailure({
      operation: "get_estimate_proposal_by_token",
      routeCategory: "estimate_proposal",
      method: "GET",
      error: result.error,
      status: failure.status,
    });
    return publicTokenJson(failure.body, { status: failure.status, headers: failure.headers });
  }
  if (!result.data || typeof result.data !== "object" || "expired" in result.data) return unavailable();
  return publicTokenJson({ success: true, proposal: minimizeEstimateProposalPayload(result.data) });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const limited = await enforcePublicTokenRateLimit({ request, token, routeCategory: "estimate_proposal", method: "POST" });
  if (limited) return limited;
  if (!UUID.test(token)) return unavailable();
  if (isPublicTokenBodyTooLarge(request.headers.get("content-length"))) {
    return publicTokenJson({ success: false, error: "Invalid estimate response." }, { status: 413 });
  }

  let body: ResponseBody;
  try {
    body = await request.json() as ResponseBody;
  } catch {
    return publicTokenJson({ success: false, error: "Invalid estimate response." }, { status: 400 });
  }
  if (body.response !== "accepted" && body.response !== "declined") {
    return publicTokenJson({ success: false, error: "Choose accept or decline." }, { status: 400 });
  }
  const customerName = body.customerName?.trim() ?? "";
  if (!customerName || customerName.length > 160 || (body.notes?.length ?? 0) > 4000) {
    return publicTokenJson({ success: false, error: "Enter a valid name and response." }, { status: 400 });
  }
  if (body.response === "accepted" && body.acknowledgedNonbinding !== true) {
    return publicTokenJson({
      success: false,
      error: "Acknowledge that estimate acceptance is nonbinding and a separate signed contract is required.",
    }, { status: 400 });
  }

  const result = await createAdminServerClient().rpc("submit_estimate_proposal_response", {
    requested_token: token,
    requested_response: body.response,
    requested_name: customerName,
    requested_notes: body.notes?.trim() || null,
    requested_acknowledged_nonbinding: body.response === "accepted" && body.acknowledgedNonbinding === true,
  });
  if (result.error) {
    logPublicTokenSupabaseFailure({
      operation: "submit_estimate_proposal_response",
      routeCategory: "estimate_proposal",
      method: "POST",
      error: result.error,
      status: 404,
    });
    return unavailable();
  }
  if (!result.data || typeof result.data !== "object") return unavailable();
  if ("already_submitted" in result.data && result.data.already_submitted === true) {
    return publicTokenJson({
      success: false,
      alreadySubmitted: true,
      result: {
        status: "status" in result.data ? result.data.status : null,
        respondedAt: "responded_at" in result.data ? result.data.responded_at : null,
      },
    }, { status: 409 });
  }
  return publicTokenJson({
    success: true,
    result: {
      status: "status" in result.data ? result.data.status : null,
      respondedAt: "responded_at" in result.data ? result.data.responded_at : null,
      contractRequired: "contract_required" in result.data ? result.data.contract_required : false,
      workAuthorized: false,
    },
  });
}
