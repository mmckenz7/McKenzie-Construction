import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedCostTypes = new Set([
  "materials",
  "labor",
  "subcontractor",
  "equipment",
  "dumpster",
  "permit",
  "delivery",
  "change_order",
  "refund",
  "overhead",
  "other",
]);

const allowedPaymentStatuses = new Set([
  "unpaid",
  "partially_paid",
  "paid",
  "reimbursed",
  "void",
]);

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type CreateProjectCostBody = {
  costType?: unknown;
  description?: unknown;
  vendorName?: unknown;
  amount?: unknown;
  costDate?: unknown;
  paymentStatus?: unknown;
  paymentMethod?: unknown;
  referenceNumber?: unknown;
  notes?: unknown;
};

type ProjectCostRecord = {
  id: string;
  project_id: string;
  cost_type: string;
  description: string;
  vendor_name: string | null;
  amount: number;
  cost_date: string | null;
  payment_status: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const projectCostSelect = `
  id,
  project_id,
  cost_type,
  description,
  vendor_name,
  amount,
  cost_date,
  payment_status,
  payment_method,
  reference_number,
  notes,
  metadata,
  created_at,
  updated_at
`;

function normalizeRequiredText(
  value: unknown,
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value.trim();
}

function normalizeOptionalText(
  value: unknown,
): string | null | undefined {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  return value.trim() || null;
}

function normalizeAmount(
  value: unknown,
): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value ===
          "string"
        ? Number(
            value.replace(
              /[$,\s]/g,
              "",
            ),
          )
        : Number.NaN;

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return undefined;
  }

  return (
    Math.round(
      parsed * 100,
    ) / 100
  );
}

function normalizeDate(
  value: unknown,
): string | null | undefined {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const cleanedValue =
    value.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      cleanedValue,
    )
  ) {
    return undefined;
  }

  const parsedDate =
    new Date(
      `${cleanedValue}T00:00:00Z`,
    );

  if (
    Number.isNaN(
      parsedDate.getTime(),
    ) ||
    parsedDate
      .toISOString()
      .slice(0, 10) !==
      cleanedValue
  ) {
    return undefined;
  }

  return cleanedValue;
}

function calculateCostSummary(
  costs: ProjectCostRecord[],
) {
  let grossCosts = 0;
  let refunds = 0;
  let unpaidCosts = 0;
  let paidCosts = 0;

  const totalsByType: Record<
    string,
    number
  > = {};

  for (const cost of costs) {
    if (
      cost.payment_status ===
      "void"
    ) {
      continue;
    }

    if (
      cost.cost_type ===
      "refund"
    ) {
      refunds += cost.amount;
    } else {
      grossCosts += cost.amount;

      totalsByType[
        cost.cost_type
      ] =
        (totalsByType[
          cost.cost_type
        ] ?? 0) +
        cost.amount;
    }

    if (
      cost.payment_status ===
        "unpaid" ||
      cost.payment_status ===
        "partially_paid"
    ) {
      if (
        cost.cost_type !==
        "refund"
      ) {
        unpaidCosts +=
          cost.amount;
      }
    }

    if (
      cost.payment_status ===
        "paid" ||
      cost.payment_status ===
        "reimbursed"
    ) {
      if (
        cost.cost_type !==
        "refund"
      ) {
        paidCosts += cost.amount;
      }
    }
  }

  return {
    grossCosts:
      Math.round(
        grossCosts * 100,
      ) / 100,

    refunds:
      Math.round(
        refunds * 100,
      ) / 100,

    netCosts:
      Math.round(
        (grossCosts - refunds) *
          100,
      ) / 100,

    unpaidCosts:
      Math.round(
        unpaidCosts * 100,
      ) / 100,

    paidCosts:
      Math.round(
        paidCosts * 100,
      ) / 100,

    totalsByType:
      Object.fromEntries(
        Object.entries(
          totalsByType,
        ).map(
          ([
            costType,
            total,
          ]) => [
            costType,
            Math.round(
              total * 100,
            ) / 100,
          ],
        ),
      ),
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const {
    projectId: rawProjectId,
  } = await context.params;

  const projectId =
    rawProjectId.trim();

  if (!projectId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid project ID is required.",
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
    .select(
      `
        id,
        contract_value
      `,
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!project) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("project_costs")
    .select(projectCostSelect)
    .eq(
      "project_id",
      projectId,
    )
    .order(
      "cost_date",
      {
        ascending: false,
        nullsFirst: false,
      },
    )
    .order(
      "created_at",
      {
        ascending: false,
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

  const costs =
    (data ??
      []) as ProjectCostRecord[];

  const summary =
    calculateCostSummary(
      costs,
    );

  const contractValue =
    typeof project.contract_value ===
      "number"
      ? project.contract_value
      : project.contract_value !==
          null
        ? Number(
            project.contract_value,
          )
        : 0;

  const projectedProfit =
    contractValue -
    summary.netCosts;

  const projectedMargin =
    contractValue > 0
      ? (projectedProfit /
          contractValue) *
        100
      : null;

  return NextResponse.json({
    success: true,
    costs,
    summary: {
      ...summary,
      contractValue:
        Math.round(
          contractValue * 100,
        ) / 100,

      projectedProfit:
        Math.round(
          projectedProfit * 100,
        ) / 100,

      projectedMargin:
        projectedMargin ===
        null
          ? null
          : Math.round(
              projectedMargin *
                100,
            ) / 100,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const {
    projectId: rawProjectId,
  } = await context.params;

  const projectId =
    rawProjectId.trim();

  if (!projectId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid project ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  let body: CreateProjectCostBody;

  try {
    body =
      (await request.json()) as CreateProjectCostBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const costType =
    typeof body.costType ===
    "string"
      ? body.costType.trim()
      : "";

  if (
    !allowedCostTypes.has(
      costType,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Choose a valid cost type.",
      },
      {
        status: 400,
      },
    );
  }

  const description =
    normalizeRequiredText(
      body.description,
    );

  if (!description) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A cost description is required.",
      },
      {
        status: 400,
      },
    );
  }

  const amount =
    normalizeAmount(
      body.amount,
    );

  if (
    amount === undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Amount must be a valid non-negative number.",
      },
      {
        status: 400,
      },
    );
  }

  const costDate =
    normalizeDate(
      body.costDate,
    );

  if (
    costDate === undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The cost date must use the YYYY-MM-DD format.",
      },
      {
        status: 400,
      },
    );
  }

  const paymentStatus =
    typeof body.paymentStatus ===
    "string"
      ? body.paymentStatus.trim()
      : "unpaid";

  if (
    !allowedPaymentStatuses.has(
      paymentStatus,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Choose a valid payment status.",
      },
      {
        status: 400,
      },
    );
  }

  const vendorName =
    normalizeOptionalText(
      body.vendorName,
    );

  if (
    vendorName === undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid vendor name.",
      },
      {
        status: 400,
      },
    );
  }

  const paymentMethod =
    normalizeOptionalText(
      body.paymentMethod,
    );

  if (
    paymentMethod ===
    undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid payment method.",
      },
      {
        status: 400,
      },
    );
  }

  const referenceNumber =
    normalizeOptionalText(
      body.referenceNumber,
    );

  if (
    referenceNumber ===
    undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid reference number.",
      },
      {
        status: 400,
      },
    );
  }

  const notes =
    normalizeOptionalText(
      body.notes,
    );

  if (
    notes === undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid cost notes.",
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
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!project) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("project_costs")
    .insert({
      project_id: projectId,
      cost_type: costType,
      description,
      vendor_name:
        vendorName,
      amount,
      cost_date: costDate,
      payment_status:
        paymentStatus,
      payment_method:
        paymentMethod,
      reference_number:
        referenceNumber,
      notes,
      metadata: {
        created_from:
          "project_detail_page",
        created_by_auth_user_id:
          user.id,
        created_at:
          new Date().toISOString(),
      },
    })
    .select(projectCostSelect)
    .single();

  if (error) {
    if (
      error.code === "23503"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The selected project no longer exists.",
        },
        {
          status: 400,
        },
      );
    }

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

  return NextResponse.json(
    {
      success: true,
      cost: data,
    },
    {
      status: 201,
    },
  );
}