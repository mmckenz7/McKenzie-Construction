import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type SubmitResponseBody = {
  response?: "approved" | "declined";
  customerName?: string;
  notes?: string | null;
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
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid change-order approval link.",
      },
      {
        status: 400,
      },
    );
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
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "expired" in data &&
    data.expired === true
  ) {
    return NextResponse.json(
      {
        success: false,
        expired: true,
        error:
          "This change-order approval link has expired.",
      },
      {
        status: 410,
      },
    );
  }

  return NextResponse.json({
    success: true,
    changeOrder: data,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } =
    await context.params;

  if (!isUuid(token)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid change-order approval link.",
      },
      {
        status: 400,
      },
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
      "submit_change_order_response",
      {
        requested_token: token,
        requested_response:
          body.response,
        requested_customer_name:
          customerName,
        requested_notes:
          body.notes?.trim() || null,
        requested_ip: customerIp,
      },
    );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      },
    );
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
        result: data,
      },
      {
        status: 409,
      },
    );
  }

  return NextResponse.json({
    success: true,
    result: data,
  });
}
