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

type ItemBody = {
  id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  unitCost?: number;
  sortOrder?: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeNumber(
  value: unknown,
  fallback = 0,
) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : fallback;
}

async function verifyChangeOrder(
  projectId: string,
  changeOrderId: string,
) {
  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase
      .from("project_change_orders")
      .select(
        `
          id,
          project_id,
          change_order_number,
          title,
          status,
          amount,
          cost_amount,
          schedule_impact_days
        `,
      )
      .eq("id", changeOrderId)
      .eq("project_id", projectId)
      .single();

  return {
    supabase,
    changeOrder: data,
    error,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_line_items",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_line_items",
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

  const {
    supabase,
    changeOrder,
    error: changeOrderError,
  } = await verifyChangeOrder(
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

  const { data, error } =
    await supabase
      .from(
        "project_change_order_items",
      )
      .select("*")
      .eq(
        "change_order_id",
        changeOrderId,
      )
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
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
      amount: Number(
        changeOrder.amount ?? 0,
      ),
      costAmount: Number(
        changeOrder.cost_amount ?? 0,
      ),
      scheduleImpactDays: Number(
        changeOrder
          .schedule_impact_days ?? 0,
      ),
    },

    items: (data ?? []).map(
      (item) => ({
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
        unitCost: Number(
          item.unit_cost ?? 0,
        ),
        sortOrder: Number(
          item.sort_order ?? 0,
        ),
        salesTotal:
          Number(
            item.quantity ?? 0,
          ) *
          Number(
            item.unit_price ?? 0,
          ),
        costTotal:
          Number(
            item.quantity ?? 0,
          ) *
          Number(
            item.unit_cost ?? 0,
          ),
      }),
    ),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_line_items",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_line_items",
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

  let body: ItemBody;

  try {
    body =
      (await request.json()) as ItemBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid line-item submission.",
      },
      {
        status: 400,
      },
    );
  }

  const description =
    body.description?.trim() ?? "";

  const quantity =
    normalizeNumber(
      body.quantity,
      1,
    );

  const unitPrice =
    normalizeNumber(
      body.unitPrice,
      0,
    );

  const unitCost =
    normalizeNumber(
      body.unitCost,
      0,
    );

  if (!description) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Line-item description is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (quantity <= 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Quantity must be greater than zero.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    unitPrice < 0 ||
    unitCost < 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Price and cost cannot be negative.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    supabase,
    changeOrder,
    error: changeOrderError,
  } = await verifyChangeOrder(
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
    changeOrder.status !== "draft"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Line items can only be edited while the change order is in Draft status.",
      },
      {
        status: 400,
      },
    );
  }

  const { data, error } =
    await supabase
      .from(
        "project_change_order_items",
      )
      .insert({
        change_order_id:
          changeOrderId,
        description,
        quantity,
        unit:
          body.unit?.trim() ||
          "each",
        unit_price: unitPrice,
        unit_cost: unitCost,
        sort_order:
          normalizeNumber(
            body.sortOrder,
            0,
          ),
      })
      .select("*")
      .single();

  if (error || !data) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ??
          "Could not add the line item.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    item: data,
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_line_items",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_line_items",
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

  let body: ItemBody;

  try {
    body =
      (await request.json()) as ItemBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid line-item update.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId) ||
    !body.id ||
    !isUuid(body.id)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid line-item ID.",
      },
      {
        status: 400,
      },
    );
  }

  const description =
    body.description?.trim() ?? "";

  const quantity =
    normalizeNumber(
      body.quantity,
      1,
    );

  const unitPrice =
    normalizeNumber(
      body.unitPrice,
      0,
    );

  const unitCost =
    normalizeNumber(
      body.unitCost,
      0,
    );

  if (
    !description ||
    quantity <= 0 ||
    unitPrice < 0 ||
    unitCost < 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Enter a description, positive quantity, and nonnegative price and cost.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    supabase,
    changeOrder,
    error: changeOrderError,
  } = await verifyChangeOrder(
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
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    changeOrder.status !== "draft"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Line items can only be edited while the change order is in Draft status.",
      },
      {
        status: 400,
      },
    );
  }

  const { data, error } =
    await supabase
      .from(
        "project_change_order_items",
      )
      .update({
        description,
        quantity,
        unit:
          body.unit?.trim() ||
          "each",
        unit_price: unitPrice,
        unit_cost: unitCost,
        sort_order:
          normalizeNumber(
            body.sortOrder,
            0,
          ),
      })
      .eq("id", body.id)
      .eq(
        "change_order_id",
        changeOrderId,
      )
      .select("*")
      .single();

  if (error || !data) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ??
          "Could not update the line item.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    item: data,
  });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  const featureAccess =
    await checkApiFeature(
      request,
      "change_order_line_items",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This feature is disabled for the current account.",
        featureKey:
          "change_order_line_items",
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

  const itemId =
    request.nextUrl.searchParams.get(
      "itemId",
    );

  if (
    !isUuid(projectId) ||
    !isUuid(changeOrderId) ||
    !itemId ||
    !isUuid(itemId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid line-item ID.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    supabase,
    changeOrder,
    error: changeOrderError,
  } = await verifyChangeOrder(
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
          "Change order not found.",
      },
      {
        status: 404,
      },
    );
  }

  const { error } =
    await supabase
      .from(
        "project_change_order_items",
      )
      .delete()
      .eq("id", itemId)
      .eq(
        "change_order_id",
        changeOrderId,
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

  return NextResponse.json({
    success: true,
  });
}
