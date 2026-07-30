import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedViews = new Set([
  "confirmed",
  "estimates",
  "proposals",
  "customer_reviewing",
  "all_opportunities",
  "completed",
  "all",
]);

const allowedTimeframes = new Set([
  "30",
  "60",
  "90",
  "180",
  "365",
  "all",
  "custom",
]);

const confirmedProjectStatuses = new Set([
  "scheduled",
  "in_progress",
  "on_hold",
]);

const opportunityLeadStatuses = new Set([
  "new",
  "consultation_pending",
  "consultation_confirmed",
  "estimate_in_progress",
  "proposal_sent",
  "customer_reviewing",
]);

type ProjectRecord = {
  id: string;
  customer_id: string;
  project_name: string;
  project_type: string | null;
  property_address: string | null;
  status: string;
  project_manager_id: string | null;
  estimated_value: number | string | null;
  contract_value: number | string | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectCostRecord = {
  id: string;
  project_id: string;
  cost_type: string;
  amount: number | string;
  payment_status: string;
  cost_date: string | null;
};

type LeadRecord = {
  id: string;
  name: string | null;
  project_type: string | null;
  property_address: string | null;
  lead_status: string | null;
  consultation_status: string | null;
  estimated_project_value: number | string | null;
  expected_close_date: string | null;
  win_probability: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CustomerRecord = {
  id: string;
  customer_name: string;
};

type TeamMemberRecord = {
  id: string;
  name: string;
};

type FinancialItem = {
  id: string;
  recordType: "project" | "lead";
  name: string;
  customerName: string | null;
  projectType: string | null;
  propertyAddress: string | null;
  status: string;
  responsiblePersonName: string | null;
  scheduledDate: string | null;
  targetDate: string | null;
  value: number;
  recordedCosts: number;
  unpaidCosts: number;
  refunds: number;
  netCosts: number;
  projectedProfit: number;
  projectedMargin: number | null;
  winProbability: number | null;
  weightedValue: number;
};

type DateRange = {
  startDate: string | null;
  endDate: string | null;
};

function toNumber(
  value: number | string | null | undefined,
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

function roundMoney(
  value: number,
) {
  return (
    Math.round(value * 100) /
    100
  );
}

function normalizeDate(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return null;
  }

  const parsedDate =
    new Date(
      `${value}T00:00:00Z`,
    );

  if (
    Number.isNaN(
      parsedDate.getTime(),
    ) ||
    parsedDate
      .toISOString()
      .slice(0, 10) !==
      value
  ) {
    return null;
  }

  return value;
}

function getTodayDate() {
  const now = new Date();

  const localNow =
    new Date(
      now.getTime() -
        now.getTimezoneOffset() *
          60000,
    );

  return localNow
    .toISOString()
    .slice(0, 10);
}

function addDays(
  dateValue: string,
  days: number,
) {
  const date =
    new Date(
      `${dateValue}T00:00:00Z`,
    );

  date.setUTCDate(
    date.getUTCDate() +
      days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function getDateRange(
  timeframe: string,
  requestedStartDate: string | null,
  requestedEndDate: string | null,
): DateRange {
  const today =
    getTodayDate();

  if (timeframe === "all") {
    return {
      startDate: null,
      endDate: null,
    };
  }

  if (timeframe === "custom") {
    return {
      startDate:
        normalizeDate(
          requestedStartDate,
        ),
      endDate:
        normalizeDate(
          requestedEndDate,
        ),
    };
  }

  const numberOfDays =
    Number(timeframe);

  return {
    startDate: today,
    endDate: addDays(
      today,
      numberOfDays,
    ),
  };
}

function isDateInRange(
  dateValue: string | null,
  range: DateRange,
) {
  if (!dateValue) {
    return false;
  }

  if (
    range.startDate &&
    dateValue <
      range.startDate
  ) {
    return false;
  }

  if (
    range.endDate &&
    dateValue >
      range.endDate
  ) {
    return false;
  }

  return true;
}

function getLeadStage(
  lead: LeadRecord,
) {
  if (
    lead.lead_status ===
    "customer_reviewing"
  ) {
    return "customer_reviewing";
  }

  if (
    lead.lead_status ===
    "proposal_sent"
  ) {
    return "proposal_sent";
  }

  if (
    lead.lead_status ===
    "estimate_in_progress"
  ) {
    return "estimate_in_progress";
  }

  if (
    lead.consultation_status ===
    "confirmed"
  ) {
    return "consultation_confirmed";
  }

  if (
    lead.consultation_status ===
    "pending"
  ) {
    return "consultation_pending";
  }

  return (
    lead.lead_status ??
    "new"
  );
}

function getDefaultProbability(
  stage: string,
) {
  switch (stage) {
    case "customer_reviewing":
      return 80;

    case "proposal_sent":
      return 60;

    case "estimate_in_progress":
      return 40;

    case "consultation_confirmed":
      return 25;

    case "consultation_pending":
      return 15;

    case "new":
      return 10;

    default:
      return 0;
  }
}

function getMonthKey(
  value: string,
) {
  return value.slice(0, 7);
}

function getMonthLabel(
  monthKey: string,
) {
  const date =
    new Date(
      `${monthKey}-01T00:00:00Z`,
    );

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function calculateProjectCostTotals(
  costs: ProjectCostRecord[],
) {
  let grossCosts = 0;
  let refunds = 0;
  let unpaidCosts = 0;
  let paidCosts = 0;

  for (const cost of costs) {
    const amount =
      toNumber(cost.amount);

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
      refunds += amount;
      continue;
    }

    grossCosts += amount;

    if (
      cost.payment_status ===
        "unpaid" ||
      cost.payment_status ===
        "partially_paid"
    ) {
      unpaidCosts += amount;
    }

    if (
      cost.payment_status ===
        "paid" ||
      cost.payment_status ===
        "reimbursed"
    ) {
      paidCosts += amount;
    }
  }

  return {
    grossCosts:
      roundMoney(grossCosts),

    refunds:
      roundMoney(refunds),

    netCosts:
      roundMoney(
        grossCosts - refunds,
      ),

    unpaidCosts:
      roundMoney(
        unpaidCosts,
      ),

    paidCosts:
      roundMoney(
        paidCosts,
      ),
  };
}

export async function GET(
  request: NextRequest,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const searchParams =
    request.nextUrl.searchParams;

  const requestedView =
    searchParams.get("view") ??
    "confirmed";

  const requestedTimeframe =
    searchParams.get(
      "timeframe",
    ) ?? "90";

  const view =
    allowedViews.has(
      requestedView,
    )
      ? requestedView
      : "confirmed";

  const timeframe =
    allowedTimeframes.has(
      requestedTimeframe,
    )
      ? requestedTimeframe
      : "90";

  const dateRange =
    getDateRange(
      timeframe,
      searchParams.get(
        "startDate",
      ),
      searchParams.get(
        "endDate",
      ),
    );

  if (
    timeframe === "custom" &&
    (!dateRange.startDate ||
      !dateRange.endDate)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Custom reports require a valid start date and end date.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    dateRange.startDate &&
    dateRange.endDate &&
    dateRange.endDate <
      dateRange.startDate
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The end date cannot be before the start date.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    projectsResult,
    costsResult,
    leadsResult,
    customersResult,
    teamResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `
          id,
          customer_id,
          project_name,
          project_type,
          property_address,
          status,
          project_manager_id,
          estimated_value,
          contract_value,
          start_date,
          target_completion_date,
          completed_at,
          created_at,
          updated_at
        `,
      )
      .order(
        "start_date",
        {
          ascending: true,
          nullsFirst: false,
        },
      ),

    supabase
      .from("project_costs")
      .select(
        `
          id,
          project_id,
          cost_type,
          amount,
          payment_status,
          cost_date
        `,
      ),

    supabase
      .from("leads")
      .select(
        `
          id,
          name,
          project_type,
          property_address,
          lead_status,
          consultation_status,
          estimated_project_value,
          expected_close_date,
          win_probability,
          created_at,
          updated_at
        `,
      ),

    supabase
      .from("customers")
      .select(
        `
          id,
          customer_name
        `,
      ),

    supabase
      .from("team_members")
      .select(
        `
          id,
          name
        `,
      ),
  ]);

  if (projectsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (costsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          costsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (leadsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          leadsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (customersResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          customersResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (teamResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          teamResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  const projects =
    (projectsResult.data ??
      []) as ProjectRecord[];

  const costs =
    (costsResult.data ??
      []) as ProjectCostRecord[];

  const leads =
    (leadsResult.data ??
      []) as LeadRecord[];

  const customers =
    (customersResult.data ??
      []) as CustomerRecord[];

  const teamMembers =
    (teamResult.data ??
      []) as TeamMemberRecord[];

  const customerById =
    new Map(
      customers.map(
        (customer) => [
          customer.id,
          customer,
        ],
      ),
    );

  const teamMemberById =
    new Map(
      teamMembers.map(
        (member) => [
          member.id,
          member,
        ],
      ),
    );

  const costsByProjectId =
    new Map<
      string,
      ProjectCostRecord[]
    >();

  for (const cost of costs) {
    const currentCosts =
      costsByProjectId.get(
        cost.project_id,
      ) ?? [];

    currentCosts.push(cost);

    costsByProjectId.set(
      cost.project_id,
      currentCosts,
    );
  }

  const projectItems: FinancialItem[] =
    [];

  for (const project of projects) {
    const isConfirmed =
      confirmedProjectStatuses.has(
        project.status,
      );

    const isCompleted =
      project.status ===
      "completed";

    const shouldIncludeProject =
      view === "confirmed"
        ? isConfirmed
        : view === "completed"
          ? isCompleted
          : view === "all"
            ? true
            : false;

    if (!shouldIncludeProject) {
      continue;
    }

    const reportingDate =
      isCompleted
        ? project.completed_at?.slice(
            0,
            10,
          ) ??
          project.target_completion_date ??
          project.start_date
        : project.start_date;

    if (
      timeframe !== "all" &&
      !isDateInRange(
        reportingDate,
        dateRange,
      )
    ) {
      continue;
    }

    const contractValue =
      toNumber(
        project.contract_value,
      );

    const projectCosts =
      calculateProjectCostTotals(
        costsByProjectId.get(
          project.id,
        ) ?? [],
      );

    const projectedProfit =
      contractValue -
      projectCosts.netCosts;

    const projectedMargin =
      contractValue > 0
        ? (projectedProfit /
            contractValue) *
          100
        : null;

    const customer =
      customerById.get(
        project.customer_id,
      );

    const projectManager =
      project.project_manager_id
        ? teamMemberById.get(
            project.project_manager_id,
          )
        : null;

    projectItems.push({
      id: project.id,
      recordType:
        "project",
      name:
        project.project_name,
      customerName:
        customer?.customer_name ??
        null,
      projectType:
        project.project_type,
      propertyAddress:
        project.property_address,
      status:
        project.status,
      responsiblePersonName:
        projectManager?.name ??
        null,
      scheduledDate:
        project.start_date,
      targetDate:
        project.target_completion_date,
      value:
        roundMoney(
          contractValue,
        ),
      recordedCosts:
        projectCosts.grossCosts,
      unpaidCosts:
        projectCosts.unpaidCosts,
      refunds:
        projectCosts.refunds,
      netCosts:
        projectCosts.netCosts,
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
      winProbability: 100,
      weightedValue:
        roundMoney(
          contractValue,
        ),
    });
  }

  const leadItems: FinancialItem[] =
    [];

  if (
    view === "estimates" ||
    view === "proposals" ||
    view ===
      "customer_reviewing" ||
    view ===
      "all_opportunities" ||
    view === "all"
  ) {
    for (const lead of leads) {
      const stage =
        getLeadStage(lead);

      let shouldIncludeLead =
        false;

      if (
        view === "estimates"
      ) {
        shouldIncludeLead =
          stage ===
          "estimate_in_progress";
      }

      if (
        view === "proposals"
      ) {
        shouldIncludeLead =
          stage ===
          "proposal_sent";
      }

      if (
        view ===
        "customer_reviewing"
      ) {
        shouldIncludeLead =
          stage ===
          "customer_reviewing";
      }

      if (
        view ===
        "all_opportunities"
      ) {
        shouldIncludeLead =
          opportunityLeadStatuses.has(
            stage,
          );
      }

      if (view === "all") {
        shouldIncludeLead =
          opportunityLeadStatuses.has(
            stage,
          );
      }

      if (!shouldIncludeLead) {
        continue;
      }

      if (
        timeframe !== "all" &&
        !isDateInRange(
          lead.expected_close_date,
          dateRange,
        )
      ) {
        continue;
      }

      const estimatedValue =
        toNumber(
          lead.estimated_project_value,
        );

      const probabilityValue =
        lead.win_probability !==
          null
          ? toNumber(
              lead.win_probability,
            )
          : getDefaultProbability(
              stage,
            );

      const normalizedProbability =
        Math.max(
          0,
          Math.min(
            probabilityValue,
            100,
          ),
        );

      leadItems.push({
        id: lead.id,
        recordType: "lead",
        name:
          lead.name ??
          "Unnamed Lead",
        customerName:
          lead.name,
        projectType:
          lead.project_type,
        propertyAddress:
          lead.property_address,
        status: stage,
        responsiblePersonName:
          null,
        scheduledDate:
          lead.expected_close_date,
        targetDate: null,
        value:
          roundMoney(
            estimatedValue,
          ),
        recordedCosts: 0,
        unpaidCosts: 0,
        refunds: 0,
        netCosts: 0,
        projectedProfit:
          roundMoney(
            estimatedValue,
          ),
        projectedMargin:
          estimatedValue > 0
            ? 100
            : null,
        winProbability:
          roundMoney(
            normalizedProbability,
          ),
        weightedValue:
          roundMoney(
            estimatedValue *
              (normalizedProbability /
                100),
          ),
      });
    }
  }

  const items = [
    ...projectItems,
    ...leadItems,
  ].sort(
    (
      firstItem,
      secondItem,
    ) => {
      if (
        !firstItem.scheduledDate &&
        !secondItem.scheduledDate
      ) {
        return firstItem.name.localeCompare(
          secondItem.name,
        );
      }

      if (
        !firstItem.scheduledDate
      ) {
        return 1;
      }

      if (
        !secondItem.scheduledDate
      ) {
        return -1;
      }

      return firstItem.scheduledDate.localeCompare(
        secondItem.scheduledDate,
      );
    },
  );

  const totals = items.reduce(
    (currentTotals, item) => ({
      totalValue:
        currentTotals.totalValue +
        item.value,

      weightedValue:
        currentTotals.weightedValue +
        item.weightedValue,

      recordedCosts:
        currentTotals.recordedCosts +
        item.recordedCosts,

      netCosts:
        currentTotals.netCosts +
        item.netCosts,

      unpaidCosts:
        currentTotals.unpaidCosts +
        item.unpaidCosts,

      refunds:
        currentTotals.refunds +
        item.refunds,

      projectedProfit:
        currentTotals.projectedProfit +
        item.projectedProfit,
    }),
    {
      totalValue: 0,
      weightedValue: 0,
      recordedCosts: 0,
      netCosts: 0,
      unpaidCosts: 0,
      refunds: 0,
      projectedProfit: 0,
    },
  );

  const averageJobValue =
    items.length > 0
      ? totals.totalValue /
        items.length
      : 0;

  const overallMargin =
    totals.totalValue > 0
      ? (totals.projectedProfit /
          totals.totalValue) *
        100
      : null;

  const noScheduledDateCount =
    items.filter(
      (item) =>
        !item.scheduledDate,
    ).length;

  const noScheduledDateValue =
    items
      .filter(
        (item) =>
          !item.scheduledDate,
      )
      .reduce(
        (total, item) =>
          total + item.value,
        0,
      );

  const monthlyMap =
    new Map<
      string,
      {
        month: string;
        label: string;
        count: number;
        value: number;
        weightedValue: number;
        netCosts: number;
        projectedProfit: number;
      }
    >();

  for (const item of items) {
    if (!item.scheduledDate) {
      continue;
    }

    const monthKey =
      getMonthKey(
        item.scheduledDate,
      );

    const existingMonth =
      monthlyMap.get(
        monthKey,
      ) ?? {
        month: monthKey,
        label:
          getMonthLabel(
            monthKey,
          ),
        count: 0,
        value: 0,
        weightedValue: 0,
        netCosts: 0,
        projectedProfit: 0,
      };

    existingMonth.count += 1;
    existingMonth.value +=
      item.value;
    existingMonth.weightedValue +=
      item.weightedValue;
    existingMonth.netCosts +=
      item.netCosts;
    existingMonth.projectedProfit +=
      item.projectedProfit;

    monthlyMap.set(
      monthKey,
      existingMonth,
    );
  }

  const monthlyBreakdown =
    Array.from(
      monthlyMap.values(),
    )
      .sort(
        (
          firstMonth,
          secondMonth,
        ) =>
          firstMonth.month.localeCompare(
            secondMonth.month,
          ),
      )
      .map((month) => ({
        ...month,
        value:
          roundMoney(
            month.value,
          ),
        weightedValue:
          roundMoney(
            month.weightedValue,
          ),
        netCosts:
          roundMoney(
            month.netCosts,
          ),
        projectedProfit:
          roundMoney(
            month.projectedProfit,
          ),
      }));

  const projectTypeMap =
    new Map<
      string,
      {
        projectType: string;
        count: number;
        value: number;
        weightedValue: number;
        projectedProfit: number;
      }
    >();

  for (const item of items) {
    const projectType =
      item.projectType ??
      "Unspecified";

    const existingType =
      projectTypeMap.get(
        projectType,
      ) ?? {
        projectType,
        count: 0,
        value: 0,
        weightedValue: 0,
        projectedProfit: 0,
      };

    existingType.count += 1;
    existingType.value +=
      item.value;
    existingType.weightedValue +=
      item.weightedValue;
    existingType.projectedProfit +=
      item.projectedProfit;

    projectTypeMap.set(
      projectType,
      existingType,
    );
  }

  const projectTypeBreakdown =
    Array.from(
      projectTypeMap.values(),
    )
      .sort(
        (
          firstType,
          secondType,
        ) =>
          secondType.value -
          firstType.value,
      )
      .map((item) => ({
        ...item,
        value:
          roundMoney(
            item.value,
          ),
        weightedValue:
          roundMoney(
            item.weightedValue,
          ),
        projectedProfit:
          roundMoney(
            item.projectedProfit,
          ),
      }));

  const managerMap =
    new Map<
      string,
      {
        manager: string;
        count: number;
        value: number;
        projectedProfit: number;
      }
    >();

  for (const item of projectItems) {
    const manager =
      item.responsiblePersonName ??
      "Unassigned";

    const existingManager =
      managerMap.get(
        manager,
      ) ?? {
        manager,
        count: 0,
        value: 0,
        projectedProfit: 0,
      };

    existingManager.count += 1;
    existingManager.value +=
      item.value;
    existingManager.projectedProfit +=
      item.projectedProfit;

    managerMap.set(
      manager,
      existingManager,
    );
  }

  const managerBreakdown =
    Array.from(
      managerMap.values(),
    )
      .sort(
        (
          firstManager,
          secondManager,
        ) =>
          secondManager.value -
          firstManager.value,
      )
      .map((item) => ({
        ...item,
        value:
          roundMoney(
            item.value,
          ),
        projectedProfit:
          roundMoney(
            item.projectedProfit,
          ),
      }));

  return NextResponse.json({
    success: true,

    filters: {
      view,
      timeframe,
      startDate:
        dateRange.startDate,
      endDate:
        dateRange.endDate,
      defaultView:
        "confirmed",
      defaultTimeframe:
        "90",
    },

    summary: {
      recordCount:
        items.length,

      projectCount:
        projectItems.length,

      leadCount:
        leadItems.length,

      totalValue:
        roundMoney(
          totals.totalValue,
        ),

      weightedValue:
        roundMoney(
          totals.weightedValue,
        ),

      recordedCosts:
        roundMoney(
          totals.recordedCosts,
        ),

      netCosts:
        roundMoney(
          totals.netCosts,
        ),

      unpaidCosts:
        roundMoney(
          totals.unpaidCosts,
        ),

      refunds:
        roundMoney(
          totals.refunds,
        ),

      projectedProfit:
        roundMoney(
          totals.projectedProfit,
        ),

      projectedMargin:
        overallMargin === null
          ? null
          : roundMoney(
              overallMargin,
            ),

      averageJobValue:
        roundMoney(
          averageJobValue,
        ),

      noScheduledDateCount,

      noScheduledDateValue:
        roundMoney(
          noScheduledDateValue,
        ),
    },

    monthlyBreakdown,
    projectTypeBreakdown,
    managerBreakdown,
    items,
  });
}