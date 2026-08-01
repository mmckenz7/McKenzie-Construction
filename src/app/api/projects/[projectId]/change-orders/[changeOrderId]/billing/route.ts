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

function cleanAmount(value: unknown) {
  const converted = Number(value);

  return Number.isFinite(converted)
    ? converted
    : null;
}

async function getChangeOrder(
  supabase: ReturnType<
    typeof createAdminServerClient
  >,
  projectId: string,
  changeOrderId: string,
) {
  return supabase
    .from("project_change_orders")
    .select(
      `
        id,
        project_id,
        change_order_number,
        title,
        status,
        amount,
        billing_status,
        invoice_number,
        invoiced_at,
        amount_paid,
        paid_at,
        superseded_by_change_order_id
      `,
    )
    .eq("id", changeOrderId)
    .eq("project_id", projectId)
    .single();
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_billing",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_billing",
      },
      {
        status: 403,
      },
    );
  }


  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
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

  const [
    changeOrderResult,
    paymentsResult,
  ] = await Promise.all([
    getChangeOrder(
      supabase,
      projectId,
      changeOrderId,
    ),

    supabase
      .from(
        "project_change_order_payments",
      )
      .select("*")
      .eq(
        "change_order_id",
        changeOrderId,
      )
      .order("payment_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      }),
  ]);

  if (
    changeOrderResult.error ||
    !changeOrderResult.data
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

  if (paymentsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          paymentsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  const changeOrder =
    changeOrderResult.data;

  const amount =
    Number(changeOrder.amount ?? 0);

  const amountPaid =
    Number(
      changeOrder.amount_paid ?? 0,
    );

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

      amount,

      billingStatus:
        changeOrder.billing_status,

      invoiceNumber:
        changeOrder.invoice_number,

      invoicedAt:
        changeOrder.invoiced_at,

      amountPaid,

      balanceDue: Math.max(
        amount - amountPaid,
        0,
      ),

      paidAt:
        changeOrder.paid_at,

      supersededByChangeOrderId:
        changeOrder
          .superseded_by_change_order_id,
    },

    payments: (
      paymentsResult.data ?? []
    ).map((payment) => ({
      id: payment.id,

      amount:
        Number(payment.amount ?? 0),

      paymentDate:
        payment.payment_date,

      paymentMethod:
        payment.payment_method,

      referenceNumber:
        payment.reference_number,

      notes:
        payment.notes,

      createdAt:
        payment.created_at,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_billing",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_billing",
      },
      {
        status: 403,
      },
    );
  }


  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
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
      invoiceNumber?: unknown;
      invoicedAt?: unknown;
      billingStatus?: unknown;
  };

  const supabase =
    createAdminServerClient();

  const {
    data: changeOrder,
    error: changeOrderError,
  } = await getChangeOrder(
    supabase,
    projectId,
    changeOrderId,
  );

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

  if (
    changeOrder
      .superseded_by_change_order_id
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Historical change-order versions cannot be invoiced.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    ![
      "approved",
      "in_progress",
      "completed",
    ].includes(changeOrder.status)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Only approved change orders can be invoiced.",
      },
      {
        status: 400,
      },
    );
  }

  const requestedStatus =
    cleanText(body.billingStatus);

  if (
    requestedStatus &&
    ![
      "not_billed",
      "invoiced",
      "void",
    ].includes(requestedStatus)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid billing status.",
      },
      {
        status: 400,
      },
    );
  }

  const invoiceNumber =
    cleanText(body.invoiceNumber);

  const invoicedAt =
    cleanText(body.invoicedAt);

  const updateValues: {
    invoice_number:
      | string
      | null;
    invoiced_at:
      | string
      | null;
    billing_status?: string;
  } = {
    invoice_number:
      invoiceNumber,

    invoiced_at:
      invoicedAt,
  };

  if (
    requestedStatus === "void"
  ) {
    updateValues.billing_status =
      "void";
  } else if (
    requestedStatus ===
      "not_billed"
  ) {
    updateValues.invoice_number =
      null;

    updateValues.invoiced_at =
      null;

    updateValues.billing_status =
      "not_billed";
  }

  const { data, error } =
    await supabase
      .from(
        "project_change_orders",
      )
      .update(updateValues)
      .eq("id", changeOrderId)
      .eq("project_id", projectId)
      .select(
        `
          billing_status,
          invoice_number,
          invoiced_at,
          amount_paid,
          paid_at
        `,
      )
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
    billing: {
      billingStatus:
        data.billing_status,

      invoiceNumber:
        data.invoice_number,

      invoicedAt:
        data.invoiced_at,

      amountPaid:
        Number(
          data.amount_paid ?? 0,
        ),

      paidAt:
        data.paid_at,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_billing",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_billing",
      },
      {
        status: 403,
      },
    );
  }


  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
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
      amount?: unknown;
      paymentDate?: unknown;
      paymentMethod?: unknown;
      referenceNumber?: unknown;
      notes?: unknown;
    };

  const amount =
    cleanAmount(body.amount);

  if (
    amount === null ||
    amount <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Payment amount must be greater than zero.",
      },
      {
        status: 400,
      },
    );
  }

  const paymentDate =
    cleanText(body.paymentDate);

  if (!paymentDate) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Payment date is required.",
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
    getChangeOrder(
      supabase,
      projectId,
      changeOrderId,
    ),

    supabase
      .from("app_users")
      .select("id")
      .eq(
        "auth_user_id",
        authUser.id,
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
          "Payments cannot be recorded against a superseded change order.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    ![
      "approved",
      "in_progress",
      "completed",
    ].includes(changeOrder.status)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Payments can only be recorded against approved change orders.",
      },
      {
        status: 400,
      },
    );
  }

  const currentBalance =
    Math.max(
      Number(
        changeOrder.amount ?? 0,
      ) -
        Number(
          changeOrder.amount_paid ??
            0,
        ),
      0,
    );

  if (amount > currentBalance) {
    return NextResponse.json(
      {
        success: false,
        error:
          `Payment exceeds the remaining balance of $${currentBalance.toFixed(2)}.`,
      },
      {
        status: 400,
      },
    );
  }

  const { data, error } =
    await supabase
      .from(
        "project_change_order_payments",
      )
      .insert({
        change_order_id:
          changeOrderId,

        amount,

        payment_date:
          paymentDate,

        payment_method:
          cleanText(
            body.paymentMethod,
          ),

        reference_number:
          cleanText(
            body.referenceNumber,
          ),

        notes:
          cleanText(body.notes),

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

    payment: {
      id: data.id,

      amount:
        Number(data.amount ?? 0),

      paymentDate:
        data.payment_date,

      paymentMethod:
        data.payment_method,

      referenceNumber:
        data.reference_number,

      notes:
        data.notes,

      createdAt:
        data.created_at,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_billing",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_billing",
      },
      {
        status: 403,
      },
    );
  }


  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const {
    projectId,
    changeOrderId,
  } = await context.params;

  const paymentId =
    request.nextUrl.searchParams.get(
      "paymentId",
    );

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId) ||
    !paymentId ||
    !isUuid(paymentId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project, change-order, or payment ID.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data,
    error,
  } = await supabase
    .from(
      "project_change_order_payments",
    )
    .delete()
    .eq("id", paymentId)
    .eq(
      "change_order_id",
      changeOrderId,
    )
    .select("id")
    .maybeSingle();

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

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Payment not found.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
  });
}
