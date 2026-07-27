import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type LeadRecord = {
  id: string;
  name: string | null;
  project_type: string | null;
  property_address: string | null;
  lead_status: string | null;
  consultation_status: string | null;
  responsible_person_id: string | null;
};

type TaskRule = {
  id: string;
  task_key: string;
  name: string;
  description: string | null;
  category: string;
  default_priority: string;
  due_mode: string;
  due_offset: number;
  assignment_strategy: string;
  default_assignee_id: string | null;
  is_active: boolean;
};

type CompanySettings = {
  default_lead_owner_id: string | null;
  default_estimator_id: string | null;
  default_project_manager_id: string | null;
  end_of_business_time: string | null;
};

function addBusinessDays(
  startingDate: Date,
  numberOfDays: number,
) {
  const result = new Date(startingDate);
  let daysAdded = 0;

  while (daysAdded < numberOfDays) {
    result.setDate(result.getDate() + 1);

    const dayOfWeek = result.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded += 1;
    }
  }

  return result;
}

function getEndOfBusinessParts(
  endOfBusinessTime: string | null,
) {
  if (!endOfBusinessTime) {
    return {
      hours: 17,
      minutes: 0,
    };
  }

  const [hoursText, minutesText] =
    endOfBusinessTime.split(":");

  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return {
      hours: 17,
      minutes: 0,
    };
  }

  return {
    hours,
    minutes,
  };
}

function setEndOfBusiness(
  date: Date,
  endOfBusinessTime: string | null,
) {
  const result = new Date(date);

  const { hours, minutes } =
    getEndOfBusinessParts(
      endOfBusinessTime,
    );

  result.setHours(
    hours,
    minutes,
    0,
    0,
  );

  return result;
}

function getTaskDueAt(
  taskRule: TaskRule | null,
  companySettings: CompanySettings | null,
  startingDate: Date,
) {
  const endOfBusinessTime =
    companySettings?.end_of_business_time ??
    null;

  if (!taskRule) {
    return setEndOfBusiness(
      addBusinessDays(startingDate, 2),
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    taskRule.due_mode === "no_due_date"
  ) {
    return null;
  }

  if (taskRule.due_mode === "same_day") {
    return setEndOfBusiness(
      startingDate,
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    taskRule.due_mode === "business_days"
  ) {
    return setEndOfBusiness(
      addBusinessDays(
        startingDate,
        Math.max(
          taskRule.due_offset,
          0,
        ),
      ),
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    taskRule.due_mode === "calendar_days"
  ) {
    const dueDate = new Date(
      startingDate,
    );

    dueDate.setDate(
      dueDate.getDate() +
        Math.max(
          taskRule.due_offset,
          0,
        ),
    );

    return setEndOfBusiness(
      dueDate,
      endOfBusinessTime,
    ).toISOString();
  }

  return setEndOfBusiness(
    addBusinessDays(startingDate, 2),
    endOfBusinessTime,
  ).toISOString();
}

function resolveAssigneeId(
  taskRule: TaskRule | null,
  companySettings: CompanySettings | null,
  lead: LeadRecord,
) {
  if (!taskRule) {
    return (
      companySettings?.default_estimator_id ??
      lead.responsible_person_id ??
      null
    );
  }

  if (
    taskRule.assignment_strategy ===
    "specific_employee"
  ) {
    return (
      taskRule.default_assignee_id ??
      null
    );
  }

  if (
    taskRule.assignment_strategy ===
    "lead_owner"
  ) {
    return (
      lead.responsible_person_id ??
      companySettings?.default_lead_owner_id ??
      null
    );
  }

  if (
    taskRule.assignment_strategy ===
    "default_lead_owner"
  ) {
    return (
      companySettings?.default_lead_owner_id ??
      lead.responsible_person_id ??
      null
    );
  }

  if (
    taskRule.assignment_strategy ===
    "default_estimator"
  ) {
    return (
      companySettings?.default_estimator_id ??
      lead.responsible_person_id ??
      null
    );
  }

  if (
    taskRule.assignment_strategy ===
    "default_project_manager"
  ) {
    return (
      companySettings?.default_project_manager_id ??
      null
    );
  }

  return null;
}

function formatDateAndTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { leadId: rawLeadId } =
      await context.params;

    const leadId = rawLeadId.trim();

    if (!leadId) {
      return Response.json(
        {
          error:
            "A valid lead ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

    const [
      leadResult,
      taskRuleResult,
      settingsResult,
    ] = await Promise.all([
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
            responsible_person_id
          `,
        )
        .eq("id", leadId)
        .single(),

      supabase
        .from("task_types")
        .select(
          `
            id,
            task_key,
            name,
            description,
            category,
            default_priority,
            due_mode,
            due_offset,
            assignment_strategy,
            default_assignee_id,
            is_active
          `,
        )
        .eq(
          "task_key",
          "prepare_estimate",
        )
        .eq("is_active", true)
        .maybeSingle(),

      supabase
        .from("company_settings")
        .select(
          `
            default_lead_owner_id,
            default_estimator_id,
            default_project_manager_id,
            end_of_business_time
          `,
        )
        .limit(1)
        .maybeSingle(),
    ]);

    if (
      leadResult.error ||
      !leadResult.data
    ) {
      return Response.json(
        {
          error:
            leadResult.error?.message ??
            "The lead could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (taskRuleResult.error) {
      console.error(
        "Unable to load prepare-estimate task rule:",
        taskRuleResult.error,
      );
    }

    if (settingsResult.error) {
      console.error(
        "Unable to load company settings:",
        settingsResult.error,
      );
    }

    const lead =
      leadResult.data as LeadRecord;

    const taskRule =
      (taskRuleResult.data ??
        null) as TaskRule | null;

    const companySettings =
      (settingsResult.data ??
        null) as CompanySettings | null;

    const completedAt = new Date();
    const completedAtIso =
      completedAt.toISOString();

    const estimateDueAtIso =
      getTaskDueAt(
        taskRule,
        companySettings,
        completedAt,
      );

    const assignedToId =
      resolveAssigneeId(
        taskRule,
        companySettings,
        lead,
      );

    const {
      error: leadUpdateError,
    } = await supabase
      .from("leads")
      .update({
        lead_status:
          "estimate_in_progress",
        consultation_status:
          "completed",
        follow_up_at:
          estimateDueAtIso,
      })
      .eq("id", leadId);

    if (leadUpdateError) {
      return Response.json(
        {
          error:
            leadUpdateError.message,
        },
        {
          status: 500,
        },
      );
    }

    const consultationCompletion = {
      status: "completed",
      completed_at: completedAtIso,
      completion_note:
        "The site consultation was completed.",
    };

    const [
      legacyConsultationResult,
      companyConsultationResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update(
          consultationCompletion,
        )
        .eq("lead_id", leadId)
        .eq(
          "task_type",
          "complete_consultation",
        )
        .in("status", [
          "open",
          "in_progress",
        ]),

      supabase
        .from("tasks")
        .update(
          consultationCompletion,
        )
        .eq("lead_id", leadId)
        .eq(
          "task_type",
          "complete_consultation",
        )
        .in("status", [
          "open",
          "in_progress",
        ]),
    ]);

    if (
      legacyConsultationResult.error
    ) {
      console.error(
        "Unable to complete lead consultation task:",
        legacyConsultationResult.error,
      );
    }

    if (
      companyConsultationResult.error
    ) {
      console.error(
        "Unable to complete company consultation task:",
        companyConsultationResult.error,
      );
    }

    const estimateCancellation = {
      status: "canceled",
      canceled_at: completedAtIso,
      completion_note:
        "Replaced by a newly created estimate task.",
    };

    const [
      legacyEstimateCancelResult,
      companyEstimateCancelResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update(estimateCancellation)
        .eq("lead_id", leadId)
        .eq(
          "task_type",
          "prepare_estimate",
        )
        .in("status", [
          "open",
          "in_progress",
        ]),

      supabase
        .from("tasks")
        .update(estimateCancellation)
        .eq("lead_id", leadId)
        .eq(
          "task_type",
          "prepare_estimate",
        )
        .in("status", [
          "open",
          "in_progress",
        ]),
    ]);

    if (
      legacyEstimateCancelResult.error
    ) {
      console.error(
        "Unable to cancel older lead estimate task:",
        legacyEstimateCancelResult.error,
      );
    }

    if (
      companyEstimateCancelResult.error
    ) {
      console.error(
        "Unable to cancel older company estimate task:",
        companyEstimateCancelResult.error,
      );
    }

    const taskTitle =
      `Prepare estimate: ${
        lead.name ?? "Customer"
      }`;

    const taskDescription =
      taskRule?.description ??
      "Prepare the project estimate and mark it sent when it has been delivered to the customer.";

    const taskPriority =
      taskRule?.default_priority ??
      "high";

    const taskCategory =
      taskRule?.category ?? "sales";

    const taskMetadata = {
      created_by:
        "complete_consultation_workflow",
      task_rule_key:
        taskRule?.task_key ??
        "prepare_estimate",
      consultation_completed_at:
        completedAtIso,
      estimate_due_at:
        estimateDueAtIso,
      customer_name: lead.name,
      project_type:
        lead.project_type,
      property_address:
        lead.property_address,
      assigned_to_id:
        assignedToId,
    };

    const {
      data: legacyEstimateTask,
      error: legacyTaskCreateError,
    } = await supabase
      .from("lead_tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "prepare_estimate",
        title: taskTitle,
        description:
          taskDescription,
        status: "open",
        priority: taskPriority,
        due_at: estimateDueAtIso,
        assigned_to_id:
          assignedToId,
        assigned_at: assignedToId
          ? completedAtIso
          : null,
        metadata: taskMetadata,
      })
      .select("id")
      .single();

    if (legacyTaskCreateError) {
      console.error(
        "Unable to create lead estimate task:",
        legacyTaskCreateError,
      );
    }

    const {
      data: companyEstimateTask,
      error: companyTaskCreateError,
    } = await supabase
      .from("tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "prepare_estimate",
        task_type_id:
          taskRule?.id ?? null,
        title: taskTitle,
        description:
          taskDescription,
        category: taskCategory,
        status: "open",
        priority: taskPriority,
        due_at: estimateDueAtIso,
        assigned_to_id:
          assignedToId,
        assigned_at: assignedToId
          ? completedAtIso
          : null,
        source_type:
          "complete_consultation_workflow",
        metadata: {
          ...taskMetadata,
          legacy_lead_task_id:
            legacyEstimateTask?.id ??
            null,
        },
      })
      .select("id")
      .single();

    if (companyTaskCreateError) {
      console.error(
        "Unable to create company estimate task:",
        companyTaskCreateError,
      );
    }

    const activityRecords: Array<{
      lead_id: string;
      activity_type: string;
      channel: string;
      direction: string;
      summary: string;
      details: string | null;
      metadata: Record<
        string,
        unknown
      >;
    }> = [
      {
        lead_id: leadId,
        activity_type:
          "consultation_completed",
        channel: "consultation",
        direction: "internal",
        summary:
          "Site consultation completed",
        details:
          formatDateAndTime(
            completedAt,
          ),
        metadata: {
          previous_lead_status:
            lead.lead_status,
          previous_consultation_status:
            lead.consultation_status,
          completed_at:
            completedAtIso,
        },
      },
      {
        lead_id: leadId,
        activity_type:
          "estimate_started",
        channel: "estimate",
        direction: "internal",
        summary:
          "Estimate preparation started",
        details: estimateDueAtIso
          ? `Estimate due ${formatDateAndTime(
              new Date(
                estimateDueAtIso,
              ),
            )}`
          : "Estimate has no automatic due date.",
        metadata: {
          estimate_due_at:
            estimateDueAtIso,
          legacy_task_id:
            legacyEstimateTask?.id ??
            null,
          company_task_id:
            companyEstimateTask?.id ??
            null,
          assigned_to_id:
            assignedToId,
          task_rule_key:
            taskRule?.task_key ??
            "prepare_estimate",
        },
      },
    ];

    const { error: activityError } =
      await supabase
        .from("lead_activities")
        .insert(activityRecords);

    if (activityError) {
      console.error(
        "Unable to log consultation completion activities:",
        activityError,
      );
    }

    return Response.json({
      success: true,
      completedAt:
        completedAtIso,
      estimateDueAt:
        estimateDueAtIso,
      estimateTaskCreated:
        Boolean(legacyEstimateTask),
      companyTaskCreated:
        Boolean(companyEstimateTask),
      assignedToId,
    });
  } catch (error) {
    console.error(
      "Complete consultation workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the consultation workflow.",
      },
      {
        status: 500,
      },
    );
  }
}