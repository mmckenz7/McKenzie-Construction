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

type ProjectCostBody = {
  costId?: unknown;
  costType?: unknown;
  description?: unknown;
  vendorName?: unknown;
  estimatedAmount?: unknown;
  finalAmount?: unknown;
  amountPaid?: unknown;
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
  amount: number | string;
  estimated_amount: number | string;
  final_amount: number | string | null;
  amount_paid: number | string;
  cost_date: string | null;
  payment_status: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type NormalizedProjectCost = {
  id: string;
  project_id: string;
  cost_type: string;
  description: string;
  vendor_name: string | null;
  amount: number;
  estimated_amount: number;
  final_amount: number | null;
  amount_paid: number;
  effective_amount: number;
  is_finalized: boolean;
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
  estimated_amount,
  final_amount,
  amount_paid,
  cost_date,
  payment_status,
  payment_method,
  reference_number,
  notes,
  metadata,
  created_at,
  updated_at
`;

function roundMoney(
  value: number,
) {
  return (
    Math.round(value * 100) /
    100
  );
}

function toNumber(
  value:
    | number
    | string
    | null
    | undefined,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

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

function normalizeRequiredAmount(
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

  return roundMoney(parsed);
}

function normalizeOptionalAmount(
  value: unknown,
): number | null | undefined {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  return normalizeRequiredAmount(
    value,
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

function normalizeProjectCost(
  cost: ProjectCostRecord,
): NormalizedProjectCost {
  const estimatedAmount =
    roundMoney(
      toNumber(
        cost.estimated_amount ??
          cost.amount,
      ),
    );

  const finalAmount =
    cost.final_amount === null
      ? null
      : roundMoney(
          toNumber(
            cost.final_amount,
          ),
        );

  const effectiveAmount =
    finalAmount !== null
      ? finalAmount
      : estimatedAmount;

  return {
    ...cost,
    amount: roundMoney(
      toNumber(cost.amount),
    ),
    estimated_amount:
      estimatedAmount,
    final_amount:
      finalAmount,
    amount_paid:
      roundMoney(
        toNumber(
          cost.amount_paid,
        ),
      ),
    effective_amount:
      roundMoney(
        effectiveAmount,
      ),
    is_finalized:
      finalAmount !== null,
  };
}

function calculateCostSummary(
  costs: NormalizedProjectCost[],
) {
  let originalEstimatedGrossCosts =
    0;
  let originalEstimatedRefunds = 0;

  let currentProjectedGrossCosts =
    0;
  let currentProjectedRefunds = 0;

  let finalizedGrossCosts = 0;
  let finalizedRefunds = 0;

  let remainingEstimatedGrossCosts =
    0;
  let remainingEstimatedRefunds = 0;

  let amountPaid = 0;
  let unpaidCosts = 0;

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

    const estimatedAmount =
      cost.estimated_amount;

    const effectiveAmount =
      cost.effective_amount;

    const finalizedAmount =
      cost.final_amount;

    const isRefund =
      cost.cost_type ===
      "refund";

    if (isRefund) {
      originalEstimatedRefunds +=
        estimatedAmount;

      currentProjectedRefunds +=
        effectiveAmount;

      if (
        finalizedAmount !== null
      ) {
        finalizedRefunds +=
          finalizedAmount;
      } else {
        remainingEstimatedRefunds +=
          estimatedAmount;
      }
    } else {
      originalEstimatedGrossCosts +=
        estimatedAmount;

      currentProjectedGrossCosts +=
        effectiveAmount;

      if (
        finalizedAmount !== null
      ) {
        finalizedGrossCosts +=
          finalizedAmount;
      } else {
        remainingEstimatedGrossCosts +=
          estimatedAmount;
      }

      amountPaid +=
        Math.min(
          cost.amount_paid,
          effectiveAmount,
        );

      unpaidCosts +=
        Math.max(
          effectiveAmount -
            cost.amount_paid,
          0,
        );

      totalsByType[
        cost.cost_type
      ] =
        (totalsByType[
          cost.cost_type
        ] ?? 0) +
        effectiveAmount;
    }
  }

  const originalEstimatedNetCosts =
    originalEstimatedGrossCosts -
    originalEstimatedRefunds;

  const currentProjectedNetCosts =
    currentProjectedGrossCosts -
    currentProjectedRefunds;

  const finalizedNetCosts =
    finalizedGrossCosts -
    finalizedRefunds;

  const remainingEstimatedNetCosts =
    remainingEstimatedGrossCosts -
    remainingEstimatedRefunds;

  return {
    originalEstimatedGrossCosts:
      roundMoney(
        originalEstimatedGrossCosts,
      ),

    originalEstimatedRefunds:
      roundMoney(
        originalEstimatedRefunds,
      ),

    originalEstimatedNetCosts:
      roundMoney(
        originalEstimatedNetCosts,
      ),

    currentProjectedGrossCosts:
      roundMoney(
        currentProjectedGrossCosts,
      ),

    currentProjectedRefunds:
      roundMoney(
        currentProjectedRefunds,
      ),

    currentProjectedNetCosts:
      roundMoney(
        currentProjectedNetCosts,
      ),

    finalizedGrossCosts:
      roundMoney(
        finalizedGrossCosts,
      ),

    finalizedRefunds:
      roundMoney(
        finalizedRefunds,
      ),

    finalizedNetCosts:
      roundMoney(
        finalizedNetCosts,
      ),

    remainingEstimatedGrossCosts:
      roundMoney(
        remainingEstimatedGrossCosts,
      ),

    remainingEstimatedRefunds:
      roundMoney(
        remainingEstimatedRefunds,
      ),

    remainingEstimatedNetCosts:
      roundMoney(
        remainingEstimatedNetCosts,
      ),

    costVariance:
      roundMoney(
        currentProjectedNetCosts -
          originalEstimatedNetCosts,
      ),

    amountPaid:
      roundMoney(amountPaid),

    unpaidCosts:
      roundMoney(unpaidCosts),

    refunds:
      roundMoney(
        currentProjectedRefunds,
      ),

    grossCosts:
      roundMoney(
        currentProjectedGrossCosts,
      ),

    netCosts:
      roundMoney(
        currentProjectedNetCosts,
      ),

    paidCosts:
      roundMoney(amountPaid),

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
            roundMoney(total),
          ],
        ),
      ),
  };
}

async function getProject(
  projectId: string,
) {
  const supabase =
    createAdminServerClient();

  return supabase
    .from("projects")
    .select(
      `
        id,
        contract_value
      `,
    )
    .eq("id", projectId)
    .maybeSingle();
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
  } = await getProject(
    projectId,
  );

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
    (
      (data ??
        []) as ProjectCostRecord[]
    ).map(
      normalizeProjectCost,
    );

  const summary =
    calculateCostSummary(
      costs,
    );

  const contractValue =
    roundMoney(
      toNumber(
        project.contract_value,
      ),
    );

  const projectedProfit =
    contractValue -
    summary.currentProjectedNetCosts;

  const projectedMargin =
    contractValue > 0
      ? (projectedProfit /
          contractValue) *
        100
      : null;

  const originalEstimatedProfit =
    contractValue -
    summary.originalEstimatedNetCosts;

  return NextResponse.json({
    success: true,
    costs,
    summary: {
      ...summary,

      contractValue,

      originalEstimatedProfit:
        roundMoney(
          originalEstimatedProfit,
        ),

      projectedProfit:
        roundMoney(
          projectedProfit,
        ),

      projectedMargin:
        projectedMargin ===
        null
          ? null
          : roundMoney(
              projectedMargin,
            ),
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

  let body: ProjectCostBody;

  try {
    body =
      (await request.json()) as ProjectCostBody;
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

  const validated =
    validateCostBody(body);

  if (!validated.success) {
    return NextResponse.json(
      {
        success: false,
        error: validated.error,
      },
      {
        status: 400,
      },
    );
  }

  const {
    data: project,
    error: projectError,
  } = await getProject(
    projectId,
  );

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

  const supabase =
    createAdminServerClient();

  const {
    data,
    error,
  } = await supabase
    .from("project_costs")
    .insert({
      project_id: projectId,
      cost_type:
        validated.value.costType,
      description:
        validated.value.description,
      vendor_name:
        validated.value.vendorName,

      amount:
        validated.value
          .estimatedAmount,

      estimated_amount:
        validated.value
          .estimatedAmount,

      final_amount:
        validated.value
          .finalAmount,

      amount_paid:
        validated.value
          .amountPaid,

      cost_date:
        validated.value.costDate,

      payment_status:
        validated.value
          .paymentStatus,

      payment_method:
        validated.value
          .paymentMethod,

      reference_number:
        validated.value
          .referenceNumber,

      notes:
        validated.value.notes,

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
      cost:
        normalizeProjectCost(
          data as ProjectCostRecord,
        ),
    },
    {
      status: 201,
    },
  );
}

export async function PATCH(
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

  let body: ProjectCostBody;

  try {
    body =
      (await request.json()) as ProjectCostBody;
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

  const costId =
    normalizeRequiredText(
      body.costId,
    );

  if (!costId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid project cost ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const validated =
    validateCostBody(body);

  if (!validated.success) {
    return NextResponse.json(
      {
        success: false,
        error: validated.error,
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
    .from("project_costs")
    .update({
      cost_type:
        validated.value.costType,

      description:
        validated.value.description,

      vendor_name:
        validated.value.vendorName,

      amount:
        validated.value
          .estimatedAmount,

      estimated_amount:
        validated.value
          .estimatedAmount,

      final_amount:
        validated.value
          .finalAmount,

      amount_paid:
        validated.value
          .amountPaid,

      cost_date:
        validated.value.costDate,

      payment_status:
        validated.value
          .paymentStatus,

      payment_method:
        validated.value
          .paymentMethod,

      reference_number:
        validated.value
          .referenceNumber,

      notes:
        validated.value.notes,

      metadata: {
        updated_from:
          "project_detail_page",
        updated_by_auth_user_id:
          user.id,
        updated_at:
          new Date().toISOString(),
      },
    })
    .eq(
      "id",
      costId,
    )
    .eq(
      "project_id",
      projectId,
    )
    .select(projectCostSelect)
    .maybeSingle();

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
          "Project cost not found.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
    cost:
      normalizeProjectCost(
        data as ProjectCostRecord,
      ),
  });
}

function validateCostBody(
  body: ProjectCostBody,
):
  | {
      success: true;
      value: {
        costType: string;
        description: string;
        vendorName: string | null;
        estimatedAmount: number;
        finalAmount: number | null;
        amountPaid: number;
        costDate: string | null;
        paymentStatus: string;
        paymentMethod: string | null;
        referenceNumber: string | null;
        notes: string | null;
      };
    }
  | {
      success: false;
      error: string;
    } {
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
    return {
      success: false,
      error:
        "Choose a valid cost type.",
    };
  }

  const description =
    normalizeRequiredText(
      body.description,
    );

  if (!description) {
    return {
      success: false,
      error:
        "A cost description is required.",
    };
  }

  const estimatedAmount =
    normalizeRequiredAmount(
      body.estimatedAmount,
    );

  if (
    estimatedAmount ===
    undefined
  ) {
    return {
      success: false,
      error:
        "Estimated amount must be a valid non-negative number.",
    };
  }

  const finalAmount =
    normalizeOptionalAmount(
      body.finalAmount,
    );

  if (
    finalAmount === undefined
  ) {
    return {
      success: false,
      error:
        "Final amount must be blank or a valid non-negative number.",
    };
  }

  const amountPaid =
    normalizeRequiredAmount(
      body.amountPaid ?? 0,
    );

  if (
    amountPaid === undefined
  ) {
    return {
      success: false,
      error:
        "Amount paid must be a valid non-negative number.",
    };
  }

  const effectiveAmount =
    finalAmount !== null
      ? finalAmount
      : estimatedAmount;

  if (
    amountPaid >
      effectiveAmount &&
    costType !== "refund"
  ) {
    return {
      success: false,
      error:
        "Amount paid cannot exceed the amount currently used for this cost.",
    };
  }

  const costDate =
    normalizeDate(
      body.costDate,
    );

  if (
    costDate === undefined
  ) {
    return {
      success: false,
      error:
        "The cost date must use the YYYY-MM-DD format.",
    };
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
    return {
      success: false,
      error:
        "Choose a valid payment status.",
    };
  }

  const vendorName =
    normalizeOptionalText(
      body.vendorName,
    );

  if (
    vendorName === undefined
  ) {
    return {
      success: false,
      error:
        "Invalid vendor name.",
    };
  }

  const paymentMethod =
    normalizeOptionalText(
      body.paymentMethod,
    );

  if (
    paymentMethod ===
    undefined
  ) {
    return {
      success: false,
      error:
        "Invalid payment method.",
    };
  }

  const referenceNumber =
    normalizeOptionalText(
      body.referenceNumber,
    );

  if (
    referenceNumber ===
    undefined
  ) {
    return {
      success: false,
      error:
        "Invalid reference number.",
    };
  }

  const notes =
    normalizeOptionalText(
      body.notes,
    );

  if (
    notes === undefined
  ) {
    return {
      success: false,
      error:
        "Invalid cost notes.",
    };
  }

  return {
    success: true,
    value: {
      costType,
      description,
      vendorName,
      estimatedAmount,
      finalAmount,
      amountPaid,
      costDate,
      paymentStatus,
      paymentMethod,
      referenceNumber,
      notes,
    },
  };
}