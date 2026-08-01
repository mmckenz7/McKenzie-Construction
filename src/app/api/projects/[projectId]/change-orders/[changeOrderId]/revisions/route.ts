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

function normalizeRecord(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),

    projectId: String(
      record.project_id ?? "",
    ),

    changeOrderNumber: Number(
      record.change_order_number ?? 0,
    ),

    title: String(
      record.title ?? "Change order",
    ),

    status: String(
      record.status ?? "draft",
    ),

    amount: Number(
      record.amount ?? 0,
    ),

    scheduleImpactDays: Number(
      record.schedule_impact_days ?? 0,
    ),

    revisedFromChangeOrderId:
      typeof record.revised_from_change_order_id ===
      "string"
        ? record.revised_from_change_order_id
        : null,

    revisionNumber: Number(
      record.revision_number ?? 0,
    ),

    supersededByChangeOrderId:
      typeof record.superseded_by_change_order_id ===
      "string"
        ? record.superseded_by_change_order_id
        : null,

    supersededAt:
      typeof record.superseded_at ===
      "string"
        ? record.superseded_at
        : null,

    createdAt: String(
      record.created_at ?? "",
    ),

    updatedAt: String(
      record.updated_at ?? "",
    ),
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_revisions",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_revisions",
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

  const {
    data: currentRecord,
    error: currentError,
  } = await supabase
    .from("project_change_orders")
    .select("*")
    .eq("id", changeOrderId)
    .eq("project_id", projectId)
    .single();

  if (
    currentError ||
    !currentRecord
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          currentError?.message ??
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  const rootId =
    currentRecord
      .revised_from_change_order_id ??
    currentRecord.id;

  const [
    rootResult,
    revisionsResult,
  ] = await Promise.all([
    supabase
      .from("project_change_orders")
      .select("*")
      .eq("id", rootId)
      .eq("project_id", projectId)
      .single(),

    supabase
      .from("project_change_orders")
      .select("*")
      .eq(
        "revised_from_change_order_id",
        rootId,
      )
      .eq("project_id", projectId)
      .order("revision_number", {
        ascending: true,
      }),
  ]);

  if (
    rootResult.error ||
    !rootResult.data ||
    revisionsResult.error
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          rootResult.error?.message ??
          revisionsResult.error?.message ??
          "Could not load revision history.",
      },
      {
        status: 500,
      },
    );
  }

  const revisions = [
    normalizeRecord(
      rootResult.data as Record<
        string,
        unknown
      >,
    ),

    ...(
      revisionsResult.data ?? []
    ).map((record) =>
      normalizeRecord(
        record as Record<
          string,
          unknown
        >,
      ),
    ),
  ];

  return NextResponse.json({
    success: true,

    rootChangeOrderId:
      rootId,

    currentChangeOrderId:
      changeOrderId,

    revisions,
  });
}
