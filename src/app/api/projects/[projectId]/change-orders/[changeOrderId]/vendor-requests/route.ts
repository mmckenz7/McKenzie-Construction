import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { checkApiFeature } from "@/lib/features/server";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
    changeOrderId: string;
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

function cleanBoolean(
  value: unknown,
  fallback: boolean,
) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

async function authorize(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return {
      authUser: null,
      response:
        createUnauthorizedApiResponse(
          request,
        ),
    };
  }

  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_vendor_requests",
    );

  if (!featureAccess.enabled) {
    return {
      authUser: null,
      response:
        NextResponse.json(
          {
            success: false,
            error:
              "Subcontractor and supplier requests are disabled for this account.",
          },
          {
            status: 403,
          },
        ),
    };
  }

  return {
    authUser,
    response: null,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
  }

  const {
    projectId,
    changeOrderId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or change-order ID.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: changeOrder,
    error: changeOrderError,
  } = await supabase
    .from("project_change_orders")
    .select(
      `
        id,
        project_id,
        change_order_number,
        title,
        status,
        superseded_by_change_order_id
      `,
    )
    .eq("id", changeOrderId)
    .eq("project_id", projectId)
    .single();

  if (
    changeOrderError ||
    !changeOrder
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          changeOrderError?.message ??
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data: requests,
    error: requestsError,
  } = await supabase
    .from(
      "change_order_vendor_requests",
    )
    .select(
      `
        *,
        change_order_vendor_responses (*)
      `,
    )
    .eq(
      "change_order_id",
      changeOrderId,
    )
    .eq("project_id", projectId)
    .order("created_at", {
      ascending: false,
    });

  if (requestsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          requestsError.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,

    changeOrder: {
      id: changeOrder.id,
      projectId:
        changeOrder.project_id,
      changeOrderNumber:
        changeOrder.change_order_number,
      title:
        changeOrder.title,
      status:
        changeOrder.status,
      supersededByChangeOrderId:
        changeOrder
          .superseded_by_change_order_id,
    },

    requests: (
      requests ?? []
    ).map((record) => {
      const responses =
        Array.isArray(
          record.change_order_vendor_responses,
        )
          ? record.change_order_vendor_responses
          : [];

      const responseRecord =
        responses[0] ?? null;

      return {
        id: record.id,

        recipientType:
          record.recipient_type,

        recipientId:
          record.recipient_id,

        recipientName:
          record.recipient_name,

        recipientCompany:
          record.recipient_company,

        recipientEmail:
          record.recipient_email,

        recipientPhone:
          record.recipient_phone,

        requestStatus:
          record.request_status,

        requestToken:
          record.request_token,

        requestedScope:
          record.requested_scope,

        requestedCost:
          record.requested_cost,

        requestedSchedule:
          record.requested_schedule,

        requestedLeadTime:
          record.requested_lead_time,

        requestedExpirationDate:
          record
            .requested_expiration_date,

        requestedNotes:
          record.requested_notes,

        dueAt:
          record.due_at,

        expiresAt:
          record.expires_at,

        sentAt:
          record.sent_at,

        openedAt:
          record.opened_at,

        submittedAt:
          record.submitted_at,

        declinedAt:
          record.declined_at,

        reminderSentAt:
          record.reminder_sent_at,

        reminderCount:
          Number(
            record.reminder_count ?? 0,
          ),

        createdAt:
          record.created_at,

        publicPath:
          `/change-order-vendor/${record.request_token}`,

        response: responseRecord
          ? {
              id:
                responseRecord.id,

              responseStatus:
                responseRecord
                  .response_status,

              responderName:
                responseRecord
                  .responder_name,

              responderEmail:
                responseRecord
                  .responder_email,

              responderPhone:
                responseRecord
                  .responder_phone,

              quotedCost:
                responseRecord
                  .quoted_cost ===
                null
                  ? null
                  : Number(
                      responseRecord
                        .quoted_cost,
                    ),

              earliestStartDate:
                responseRecord
                  .earliest_start_date,

              expectedDeliveryDate:
                responseRecord
                  .expected_delivery_date,

              durationDays:
                responseRecord
                  .duration_days,

              leadTimeDays:
                responseRecord
                  .lead_time_days,

              quoteExpirationDate:
                responseRecord
                  .quote_expiration_date,

              notes:
                responseRecord.notes,

              exclusions:
                responseRecord.exclusions,

              attachmentUrls:
                responseRecord
                  .attachment_urls ?? [],

              createdAt:
                responseRecord
                  .created_at,
            }
          : null,
      };
    }),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (
    authorization.response ||
    !authorization.authUser
  ) {
    return authorization.response;
  }

  const {
    projectId,
    changeOrderId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or change-order ID.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    (await request.json()) as {
      recipientType?: unknown;
      recipientId?: unknown;
      recipientName?: unknown;
      recipientCompany?: unknown;
      recipientEmail?: unknown;
      recipientPhone?: unknown;
      requestedScope?: unknown;
      requestedCost?: unknown;
      requestedSchedule?: unknown;
      requestedLeadTime?: unknown;
      requestedExpirationDate?: unknown;
      requestedNotes?: unknown;
      dueAt?: unknown;
      expiresAt?: unknown;
      sendNow?: unknown;
    };

  const recipientType =
    cleanText(body.recipientType);

  const recipientName =
    cleanText(body.recipientName);

  if (
    !recipientType ||
    ![
      "subcontractor",
      "supplier",
    ].includes(recipientType)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Recipient type must be subcontractor or supplier.",
      },
      {
        status: 400,
      },
    );
  }

  if (!recipientName) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Recipient name is required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    changeOrderResult,
    appUserResult,
  ] = await Promise.all([
    supabase
      .from(
        "project_change_orders",
      )
      .select(
        `
          id,
          project_id,
          status,
          superseded_by_change_order_id
        `,
      )
      .eq("id", changeOrderId)
      .eq("project_id", projectId)
      .single(),

    supabase
      .from("app_users")
      .select("id")
      .eq(
        "auth_user_id",
        authorization.authUser.id,
      )
      .single(),
  ]);

  const changeOrder =
    changeOrderResult.data;

  if (
    changeOrderResult.error ||
    !changeOrder
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          changeOrderResult.error
            ?.message ??
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    changeOrder
      .superseded_by_change_order_id
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Vendor requests cannot be created from a superseded change order.",
      },
      {
        status: 400,
      },
    );
  }

  const sendNow =
    cleanBoolean(
      body.sendNow,
      true,
    );

  const {
    data,
    error,
  } = await supabase
    .from(
      "change_order_vendor_requests",
    )
    .insert({
      change_order_id:
        changeOrderId,

      project_id:
        projectId,

      recipient_type:
        recipientType,

      recipient_id:
        cleanText(body.recipientId),

      recipient_name:
        recipientName,

      recipient_company:
        cleanText(
          body.recipientCompany,
        ),

      recipient_email:
        cleanText(
          body.recipientEmail,
        ),

      recipient_phone:
        cleanText(
          body.recipientPhone,
        ),

      request_status:
        sendNow
          ? "sent"
          : "draft",

      requested_scope:
        cleanText(
          body.requestedScope,
        ),

      requested_cost:
        cleanBoolean(
          body.requestedCost,
          true,
        ),

      requested_schedule:
        cleanBoolean(
          body.requestedSchedule,
          true,
        ),

      requested_lead_time:
        cleanBoolean(
          body.requestedLeadTime,
          true,
        ),

      requested_expiration_date:
        cleanBoolean(
          body.requestedExpirationDate,
          true,
        ),

      requested_notes:
        cleanBoolean(
          body.requestedNotes,
          true,
        ),

      due_at:
        cleanText(body.dueAt),

      expires_at:
        cleanText(body.expiresAt),

      sent_at:
        sendNow
          ? new Date().toISOString()
          : null,

      created_by:
        appUserResult.data?.id ??
        null,
    })
    .select("*")
    .single();

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

  return NextResponse.json({
    success: true,

    request: {
      id: data.id,
      requestStatus:
        data.request_status,
      requestToken:
        data.request_token,
      publicPath:
        `/change-order-vendor/${data.request_token}`,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
  }

  const {
    projectId,
    changeOrderId,
  } = await context.params;

  const body =
    (await request.json()) as {
      requestId?: unknown;
      action?: unknown;
    };

  const requestId =
    cleanText(body.requestId);

  const action =
    cleanText(body.action);

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId) ||
    !requestId ||
    !isUuid(requestId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project, change-order, or request ID.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !action ||
    ![
      "send",
      "remind",
      "cancel",
    ].includes(action)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid vendor-request action.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from(
      "change_order_vendor_requests",
    )
    .select("*")
    .eq("id", requestId)
    .eq(
      "change_order_id",
      changeOrderId,
    )
    .eq("project_id", projectId)
    .single();

  if (
    existingError ||
    !existing
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          existingError?.message ??
          "Vendor request not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    [
      "submitted",
      "declined",
      "expired",
      "cancelled",
    ].includes(
      existing.request_status,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This vendor request is no longer active.",
      },
      {
        status: 400,
      },
    );
  }

  const now =
    new Date().toISOString();

  const updateValues =
    action === "send"
      ? {
          request_status: "sent",
          sent_at:
            existing.sent_at ?? now,
        }
      : action === "remind"
        ? {
            reminder_sent_at: now,
            reminder_count:
              Number(
                existing.reminder_count ??
                  0,
              ) + 1,
          }
        : {
            request_status:
              "cancelled",
            cancelled_at: now,
          };

  const {
    data,
    error,
  } = await supabase
    .from(
      "change_order_vendor_requests",
    )
    .update(updateValues)
    .eq("id", requestId)
    .select("*")
    .single();

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

  return NextResponse.json({
    success: true,
    requestStatus:
      data.request_status,
    reminderCount:
      Number(
        data.reminder_count ?? 0,
      ),
  });
}
