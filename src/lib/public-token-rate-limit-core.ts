export type PublicTokenRouteCategory =
  | "change_order"
  | "change_order_vendor"
  | "estimate_proposal"
  | "material_review"
  | "schedule_request";

export type PublicTokenMethod = "GET" | "POST";

export type PublicTokenRateLimitPolicy = {
  windowSeconds: number;
  networkLimit: number;
  tokenLimit: number;
};

type RateLimitFailureSource =
  | "transport_exception"
  | "rpc_error_response"
  | "invalid_rpc_result";

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "unknown";
  }

  const code = String(error.code);
  return /^[a-z0-9_.-]{1,64}$/i.test(code) ? code : "unknown";
}

function safeHttpStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const candidate = "status" in error
    ? error.status
    : "statusCode" in error
      ? error.statusCode
      : null;
  const status = typeof candidate === "number"
    ? candidate
    : typeof candidate === "string" && /^\d{3}$/.test(candidate)
      ? Number(candidate)
      : null;

  return status && status >= 100 && status <= 599 ? status : null;
}

function errorCategory(code: string, source: RateLimitFailureSource) {
  if (source === "transport_exception") return "transport";
  if (source === "invalid_rpc_result") return "invalid_response";
  if (/^PGRST/i.test(code)) return "postgrest";
  if (/^[0-9A-Z]{5}$/.test(code)) return "postgres";
  return code === "unknown" ? "unknown" : "rpc";
}

function runtimeEnvironment() {
  const value = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  return ["production", "preview", "development", "test"].includes(value)
    ? value
    : "unknown";
}

export function createRateLimitFailureDiagnostic(input: {
  error: unknown;
  source: RateLimitFailureSource;
  routeCategory: PublicTokenRouteCategory;
  method: PublicTokenMethod;
}) {
  const code = safeErrorCode(input.error);

  return {
    supabaseErrorCode: code,
    httpStatus: safeHttpStatus(input.error),
    errorCategory: errorCategory(code, input.source),
    failureSource: input.source,
    routeCategory: input.routeCategory,
    method: input.method,
    runtimeEnvironment: runtimeEnvironment(),
  };
}

export const PUBLIC_TOKEN_RATE_LIMIT_MESSAGE =
  "Too many requests. Please try again later.";

const policies: Record<
  PublicTokenMethod,
  PublicTokenRateLimitPolicy
> = {
  GET: {
    windowSeconds: 10 * 60,
    networkLimit: 60,
    tokenLimit: 30,
  },
  POST: {
    windowSeconds: 15 * 60,
    networkLimit: 12,
    tokenLimit: 6,
  },
};

export function getPublicTokenRateLimitPolicy(
  method: PublicTokenMethod,
) {
  return policies[method];
}

export function isRateLimitAllowed(input: {
  networkCount: number;
  tokenCount: number;
  policy: PublicTokenRateLimitPolicy;
}) {
  return input.networkCount <= input.policy.networkLimit &&
    input.tokenCount <= input.policy.tokenLimit;
}

export function getUserAgentCategory(
  userAgent: string | null,
) {
  const normalized = userAgent?.toLowerCase() ?? "";

  if (!normalized) return "unknown";
  if (/bot|crawler|spider|slurp/.test(normalized)) return "bot";
  if (/mobile|android|iphone|ipad/.test(normalized)) return "mobile";
  return "desktop";
}

export function createRateLimitTelemetry(input: {
  routeCategory: PublicTokenRouteCategory;
  method: PublicTokenMethod;
  statusClass: "2xx" | "4xx" | "5xx";
  networkIdentifier: string;
  userAgent: string | null;
  outcome: "allowed" | "denied" | "error";
  timestamp?: string;
}) {
  return {
    event: "public_token_rate_limit",
    routeCategory: input.routeCategory,
    method: input.method,
    statusClass: input.statusClass,
    networkIdentifier: input.networkIdentifier.slice(0, 12),
    userAgentCategory: getUserAgentCategory(input.userAgent),
    rateLimitOutcome: input.outcome,
    requestTimestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function createRateLimitResponse(retryAfterSeconds: number) {
  return {
    status: 429,
    headers: {
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
      "Cache-Control": "no-store",
    },
    body: {
      success: false,
      error: PUBLIC_TOKEN_RATE_LIMIT_MESSAGE,
    },
  };
}
