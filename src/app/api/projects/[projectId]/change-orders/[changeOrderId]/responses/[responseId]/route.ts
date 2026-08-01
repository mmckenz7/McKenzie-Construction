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
    responseId: string;
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
    responseId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId) ||
    !isUuid(responseId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid response record.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (
    projectError ||
    !project
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectError?.message ??
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  const [
    responseResult,
    itemsResult,
  ] = await Promise.all([
    supabase
      .from(
        "project_change_order_responses",
      )
      .select("*")
      .eq("id", responseId)
      .eq(
        "change_order_id",
        changeOrderId,
      )
      .eq("project_id", projectId)
      .single(),

    supabase
      .from(
        "project_change_order_response_items",
      )
      .select("*")
      .eq("response_id", responseId)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      }),
  ]);

  const responseRecord =
    responseResult.data;

  const error =
    responseResult.error ??
    itemsResult.error;

  if (
    error ||
    !responseRecord
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ??
          "Customer response record not found.",
      },
      {
        status: 404,
      },
    );
  }

  const projectRecord =
    project as Record<string, unknown>;

  return NextResponse.json({
    success: true,

    project: {
      id: String(
        projectRecord.id ?? "",
      ),

      name: String(
        projectRecord.name ??
          projectRecord.project_name ??
          projectRecord.title ??
          "Project",
      ),

      address: String(
        projectRecord.address ??
          projectRecord.project_address ??
          projectRecord.job_address ??
          "",
      ),
    },

    response: {
      id:
        responseRecord.id,

      changeOrderId:
        responseRecord.change_order_id,

      response:
        responseRecord.response,

      customerName:
        responseRecord.customer_name,

      customerNotes:
        responseRecord.customer_notes,

      agreementText:
        responseRecord.agreement_text,

      acknowledgedTerms:
        responseRecord.acknowledged_terms,

      submittedAt:
        responseRecord.submitted_at,

      changeOrderNumber:
        responseRecord.change_order_number,

      title:
        responseRecord.title,

      description:
        responseRecord.description,

      reason:
        responseRecord.reason,

      amount: Number(
        responseRecord.amount ?? 0,
      ),

      scheduleImpactDays: Number(
        responseRecord
          .schedule_impact_days ?? 0,
      ),

      customerNotesSnapshot:
        responseRecord
          .customer_notes_snapshot,

      approvalToken:
        responseRecord.approval_token,

      createdAt:
        responseRecord.created_at,

      items: (
        itemsResult.data ?? []
      ).map((item) => ({
        id: item.id,
        description:
          item.description,
        quantity: Number(
          item.quantity ?? 0,
        ),
        unit:
          item.unit,
        unitPrice: Number(
          item.unit_price ?? 0,
        ),
        salesTotal: Number(
          item.sales_total ?? 0,
        ),
      })),
    },
  });
}
