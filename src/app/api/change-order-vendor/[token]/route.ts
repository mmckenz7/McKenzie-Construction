import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  logPublicTokenSupabaseFailure,
  minimizeVendorRequestPayload,
} from "@/lib/public-token-api";
import { enforcePublicTokenRateLimit } from "@/lib/public-token-rate-limit";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function cleanNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const converted =
    Number(value);

  return Number.isFinite(converted)
    ? converted
    : null;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } =
    await context.params;

  const rateLimitResponse = await enforcePublicTokenRateLimit({
    request,
    token,
    routeCategory: "change_order_vendor",
    method: "GET",
  });

  if (rateLimitResponse) return rateLimitResponse;

  if (!isUuid(token)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "get_change_order_vendor_request_by_token",
      {
        requested_token:
          token,
      },
    );

  if (error) {
    const failure = createPublicTokenFailure("unexpected");
    logPublicTokenSupabaseFailure({
      operation: "get_change_order_vendor_request_by_token",
      routeCategory: "change_order_vendor",
      method: "GET",
      error,
      status: failure.status,
    });
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  if (!data || (typeof data === "object" && "unavailable" in data)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  return NextResponse.json({
    success: true,
    request: minimizeVendorRequestPayload(data),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } =
    await context.params;

  const rateLimitResponse = await enforcePublicTokenRateLimit({
    request,
    token,
    routeCategory: "change_order_vendor",
    method: "POST",
  });

  if (rateLimitResponse) return rateLimitResponse;

  if (!isUuid(token)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  if (isPublicTokenBodyTooLarge(request.headers.get("content-length"))) {
    return NextResponse.json({ success: false, error: "Invalid response." }, { status: 413 });
  }

  const body =
    (await request.json()) as {
      responseStatus?: unknown;
      responderName?: unknown;
      responderEmail?: unknown;
      responderPhone?: unknown;
      quotedCost?: unknown;
      earliestStartDate?: unknown;
      expectedDeliveryDate?: unknown;
      durationDays?: unknown;
      leadTimeDays?: unknown;
      quoteExpirationDate?: unknown;
      notes?: unknown;
      exclusions?: unknown;
      attachmentUrls?: unknown;
    };

  const responderName =
    cleanText(body.responderName);

  const responseStatus =
    cleanText(
      body.responseStatus,
    );

  if (!responderName) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Your name is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !responseStatus ||
    ![
      "submitted",
      "declined",
    ].includes(responseStatus)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid response.",
      },
      {
        status: 400,
      },
    );
  }

  const attachmentUrls =
    Array.isArray(
      body.attachmentUrls,
    )
      ? body.attachmentUrls.filter(
          (value): value is string =>
            typeof value === "string" &&
            Boolean(value.trim()),
        )
      : [];

  const textInputs = [
    responderName,
    cleanText(body.responderEmail),
    cleanText(body.responderPhone),
    cleanText(body.notes),
    cleanText(body.exclusions),
  ];

  if (
    responderName.length > 160 ||
    textInputs.some((value) => (value?.length ?? 0) > 4_000) ||
    attachmentUrls.length > 10 ||
    attachmentUrls.some((value) => value.length > 2_048)
  ) {
    return NextResponse.json({ success: false, error: "Invalid response." }, { status: 400 });
  }

  const forwardedFor =
    request.headers.get(
      "x-forwarded-for",
    );

  const clientIp =
    forwardedFor
      ?.split(",")[0]
      ?.trim() ??
    request.headers.get(
      "x-real-ip",
    );

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "submit_change_order_vendor_response",
      {
        requested_token:
          token,

        requested_response_status:
          responseStatus,

        requested_responder_name:
          responderName,

        requested_responder_email:
          cleanText(
            body.responderEmail,
          ),

        requested_responder_phone:
          cleanText(
            body.responderPhone,
          ),

        requested_quoted_cost:
          cleanNumber(
            body.quotedCost,
          ),

        requested_earliest_start_date:
          cleanText(
            body.earliestStartDate,
          ),

        requested_expected_delivery_date:
          cleanText(
            body.expectedDeliveryDate,
          ),

        requested_duration_days:
          cleanNumber(
            body.durationDays,
          ),

        requested_lead_time_days:
          cleanNumber(
            body.leadTimeDays,
          ),

        requested_quote_expiration_date:
          cleanText(
            body.quoteExpirationDate,
          ),

        requested_notes:
          cleanText(body.notes),

        requested_exclusions:
          cleanText(
            body.exclusions,
          ),

        requested_attachment_urls:
          attachmentUrls,

        requested_ip:
          clientIp,

        requested_user_agent:
          request.headers.get(
            "user-agent",
          ),
      },
    );

  if (error) {
    const failure = createPublicTokenFailure("unavailable");
    logPublicTokenSupabaseFailure({
      operation: "submit_change_order_vendor_response",
      routeCategory: "change_order_vendor",
      method: "POST",
      error,
      status: failure.status,
    });
    return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
  }

  return NextResponse.json({
    success: true,
    response: data && typeof data === "object" ? {
      responseStatus:
        "response_status" in data
          ? data.response_status
          : responseStatus,
    } : { responseStatus },
  });
}
