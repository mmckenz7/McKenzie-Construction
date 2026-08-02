import "server-only";

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimitFailureDiagnostic,
  createRateLimitResponse,
  createRateLimitTelemetry,
  getPublicTokenRateLimitPolicy,
  type PublicTokenMethod,
  type PublicTokenRouteCategory,
} from "@/lib/public-token-rate-limit-core";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RateLimitRpcResult = {
  allowed?: boolean;
  retry_after_seconds?: number;
};

function getNetworkIdentifier(request: NextRequest) {
  return request.headers.get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function hashIdentifier(secret: string, namespace: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${namespace}:${value}`)
    .digest("hex");
}

export async function enforcePublicTokenRateLimit(input: {
  request: NextRequest;
  token: string;
  routeCategory: PublicTokenRouteCategory;
  method: PublicTokenMethod;
}) {
  const secret = process.env.PUBLIC_TOKEN_RATE_LIMIT_SECRET;

  if (!secret || secret.length < 32) {
    console.error("public_token_rate_limit_configuration_error", {
      routeCategory: input.routeCategory,
      method: input.method,
      statusClass: "5xx",
      rateLimitOutcome: "error",
      requestTimestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      { success: false, error: "This request is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const networkKey = hashIdentifier(
    secret,
    "network",
    getNetworkIdentifier(input.request),
  );
  const tokenKey = hashIdentifier(secret, "token", input.token);
  const policy = getPublicTokenRateLimitPolicy(input.method);
  const supabase = createAdminServerClient();
  let data: unknown;
  let error: unknown;

  try {
    const result = await supabase.rpc(
      "check_public_token_rate_limit",
      {
        requested_route_category: input.routeCategory,
        requested_method: input.method,
        requested_network_key: networkKey,
        requested_token_key: tokenKey,
        requested_window_seconds: policy.windowSeconds,
        requested_network_limit: policy.networkLimit,
        requested_token_limit: policy.tokenLimit,
      },
    );
    data = result.data;
    error = result.error;
  } catch (transportError) {
    console.error(
      "public_token_rate_limit_check_failed",
      createRateLimitFailureDiagnostic({
        error: transportError,
        source: "transport_exception",
        routeCategory: input.routeCategory,
        method: input.method,
      }),
    );

    return NextResponse.json(
      { success: false, error: "This request is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (error || !data || typeof data !== "object") {
    console.error(
      "public_token_rate_limit_check_failed",
      createRateLimitFailureDiagnostic({
        error,
        source: error ? "rpc_error_response" : "invalid_rpc_result",
        routeCategory: input.routeCategory,
        method: input.method,
      }),
    );

    return NextResponse.json(
      { success: false, error: "This request is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = data as RateLimitRpcResult;

  if (result.allowed !== true) {
    const response = createRateLimitResponse(result.retry_after_seconds ?? policy.windowSeconds);
    console.warn("public_token_rate_limit_exceeded", createRateLimitTelemetry({
      routeCategory: input.routeCategory,
      method: input.method,
      statusClass: "4xx",
      networkIdentifier: networkKey,
      userAgent: input.request.headers.get("user-agent"),
      outcome: "denied",
    }));

    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  return null;
}
