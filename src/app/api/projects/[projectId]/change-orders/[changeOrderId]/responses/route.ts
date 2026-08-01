import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
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

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
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

  const {
    data: changeOrder,
    error: changeOrderError,
  } = await supabase
    .from("project_change_orders")
    .select(
      "id, project_id, change_order_number, title",
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

  const { data, error } =
    await supabase
      .from(
        "project_change_order_responses",
      )
      .select("*")
      .eq(
        "change_order_id",
        changeOrderId,
      )
      .eq("project_id", projectId)
      .order("submitted_at", {
        ascending: false,
      });

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

  const responses = (
    data ?? []
  ).map((record) => ({
    id: record.id,
    response:
      record.response,
    customerName:
      record.customer_name,
    customerNotes:
      record.customer_notes,
    agreementText:
      record.agreement_text,
    acknowledgedTerms:
      record.acknowledged_terms,
    submittedAt:
      record.submitted_at,
    changeOrderNumber:
      record.change_order_number,
    title:
      record.title,
    description:
      record.description,
    reason:
      record.reason,
    amount: Number(
      record.amount ?? 0,
    ),
    scheduleImpactDays: Number(
      record.schedule_impact_days ??
        0,
    ),
    customerNotesSnapshot:
      record.customer_notes_snapshot,
  }));

  return NextResponse.json({
    success: true,
    changeOrder: {
      id: changeOrder.id,
      projectId:
        changeOrder.project_id,
      changeOrderNumber:
        changeOrder.change_order_number,
      title: changeOrder.title,
    },
    responses,
  });
}
