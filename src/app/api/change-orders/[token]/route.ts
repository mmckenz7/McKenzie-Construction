import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  createPublicTokenFailure,
  isPublicTokenBodyTooLarge,
  minimizeChangeOrderPayload,
} from "@/lib/public-token-api";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type SubmitResponseBody = {
  response?: "approved" | "declined";
  customerName?: string;
  notes?: string | null;
  acknowledgedTerms?: boolean;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { token } =
    await context.params;

  if (!isUuid(token)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status });
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "get_change_order_by_token",
      {
        requested_token: token,
      },
    );

  if (error) {
    const failure = createPublicTokenFailure("unexpected");
    return NextResponse.json(failure.body, { status: failure.status });
  }

  if (!data || (
    typeof data === "object" &&
    data !== null &&
    (("expired" in data && data.expired === true) ||
      ("superseded" in data && data.superseded === true))
  )) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status });
  }

  return NextResponse.json({
    success: true,
    changeOrder: minimizeChangeOrderPayload(data),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } =
    await context.params;

  if (!isUuid(token)) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status });
  }

  if (isPublicTokenBodyTooLarge(request.headers.get("content-length"))) {
    return NextResponse.json(
      { success: false, error: "Invalid response submission." },
      { status: 413 },
    );
  }

  let body: SubmitResponseBody;

  try {
    body =
      (await request.json()) as SubmitResponseBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid response submission.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.response !== "approved" &&
    body.response !== "declined"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Choose approve or decline.",
      },
      {
        status: 400,
      },
    );
  }

  const customerName =
    body.customerName?.trim() ?? "";

  if (!customerName) {
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

  if (customerName.length > 160 || (body.notes?.length ?? 0) > 4_000) {
    return NextResponse.json(
      { success: false, error: "Invalid response submission." },
      { status: 400 },
    );
  }

  if (
    body.acknowledgedTerms !== true
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "You must acknowledge the change-order terms before submitting.",
      },
      {
        status: 400,
      },
    );
  }

  const forwardedFor =
    request.headers.get(
      "x-forwarded-for",
    );

  const customerIp =
    forwardedFor
      ?.split(",")[0]
      ?.trim() ??
    request.headers.get(
      "x-real-ip",
    ) ??
    null;

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "submit_change_order_response_v2",
      {
        requested_token: token,
        requested_response:
          body.response,
        requested_customer_name:
          customerName,
        requested_notes:
          body.notes?.trim() || null,
        requested_ip: customerIp,
        requested_user_agent: request.headers.get("user-agent"),
        requested_acknowledged_terms: true,
      },
    );

  if (error) {
    const failure = createPublicTokenFailure("unavailable");
    return NextResponse.json(failure.body, { status: failure.status });
  }

  if (
    data &&
    typeof data === "object" &&
    "already_submitted" in data &&
    data.already_submitted === true
  ) {
    return NextResponse.json(
      {
        success: false,
        alreadySubmitted: true,
        result: {
          status: "status" in data ? data.status : null,
          approved_at: "approved_at" in data ? data.approved_at : null,
          declined_at: "declined_at" in data ? data.declined_at : null,
        },
      },
      {
        status: 409,
      },
    );
  }

  return NextResponse.json({
    success: true,
    result: data && typeof data === "object" ? {
      status: "status" in data ? data.status : null,
      approved_at: "approved_at" in data ? data.approved_at : null,
      declined_at: "declined_at" in data ? data.declined_at : null,
    } : null,
  });
}
