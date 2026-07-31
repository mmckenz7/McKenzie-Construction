import { NextRequest, NextResponse } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type SubmitBody = {
  language?: "en" | "es";
  earliestDemoStart?: string;
  earliestConstructionStart?: string;
  demoDurationDays?: number;
  totalDurationDays?: number;
  notes?: string;
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
  const { token } = await context.params;

  if (!isUuid(token)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid schedule request link.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const { data, error } = await supabase.rpc(
    "get_schedule_request_by_token",
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
        error: "Schedule request not found.",
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
        error: "This schedule request has expired.",
      },
      {
        status: 410,
      },
    );
  }

  return NextResponse.json({
    success: true,
    request: data,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { token } = await context.params;

  if (!isUuid(token)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid schedule request link.",
      },
      {
        status: 400,
      },
    );
  }

  let body: SubmitBody;

  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid form submission.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.language !== "en" &&
    body.language !== "es"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Please select a language.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !body.earliestDemoStart ||
    !body.earliestConstructionStart
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Both start dates are required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof body.demoDurationDays !== "number" ||
    typeof body.totalDurationDays !== "number"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Both durations are required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();


  if (
    schedule_request.status === "submitted" ||
    schedule_request.submitted_at
  ) {
    return NextResponse.json(
      {
        success: false,
        alreadySubmitted: true,
        error:
          "This schedule response has already been submitted.",
      },
      {
        status: 409,
      },
    );
  }

  const { data, error } = await supabase.rpc(
    "submit_schedule_request_by_token",
    {
      requested_token: token,
      requested_language: body.language,
      requested_earliest_demo_start:
        body.earliestDemoStart,
      requested_earliest_construction_start:
        body.earliestConstructionStart,
      requested_demo_duration_days:
        body.demoDurationDays,
      requested_total_duration_days:
        body.totalDurationDays,
      requested_notes: body.notes ?? "",
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

  if (
    !data ||
    typeof data !== "object" ||
    data.success !== true
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "The schedule response could not be submitted.",
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
    requestId:
      "request_id" in data
        ? data.request_id
        : null,
  });
}
