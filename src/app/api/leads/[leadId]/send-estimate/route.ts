import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type LeadRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  project_type: string | null;
  property_address: string | null;
  preferred_contact_method: string | null;
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
      lead.responsible_person_id ??
      companySettings?.default_lead_owner_id ??
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
            phone,
            email,
            project_type,
            property_address,
            preferred_contact_method,
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
          "proposal_follow_up",
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
        "Unable to load proposal follow-up task rule:",
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

    const sentAt = new Date();
    const sentAtIso =
      sentAt.toISOString();

    const followUpAtIso =
      getTaskDueAt(
        taskRule,
        companySettings,
        sentAt,
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
        lead_status: "proposal_sent",
        follow_up_at:
          followUpAtIso,
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

    const estimateCompletion = {
      status: "completed",
      completed_at: sentAtIso,
      completion_note:
        "The estimate was sent to the customer.",
    };

    const [
      legacyEstimateResult,
      companyEstimateResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update(estimateCompletion)
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
        .update(estimateCompletion)
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

    if (legacyEstimateResult.error) {
      console.error(
        "Unable to complete lead estimate task:",
        legacyEstimateResult.error,
      );
    }

    if (companyEstimateResult.error) {
      console.error(
        "Unable to complete company estimate task:",
        companyEstimateResult.error,
      );
    }

    const followUpCancellation = {
      status: "canceled",
      canceled_at: sentAtIso,
      completion_note:
        "Replaced by a newly scheduled proposal follow-up.",
    };

    const followUpTaskTypes = [
      "first_phone_follow_up",
      "phone_follow_up",
    ];

    const [
      legacyCancelResult,
      companyCancelResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update(followUpCancellation)
        .eq("lead_id", leadId)
        .in(
          "task_type",
          followUpTaskTypes,
        )
        .in("status", [
          "open",
          "in_progress",
        ]),

      supabase
        .from("tasks")
        .update(followUpCancellation)
        .eq("lead_id", leadId)
        .in(
          "task_type",
          followUpTaskTypes,
        )
        .in("status", [
          "open",
          "in_progress",
        ]),
    ]);

    if (legacyCancelResult.error) {
      console.error(
        "Unable to cancel older lead follow-up tasks:",
        legacyCancelResult.error,
      );
    }

    if (companyCancelResult.error) {
      console.error(
        "Unable to cancel older company follow-up tasks:",
        companyCancelResult.error,
      );
    }

    const taskTitle =
      `Call about estimate: ${
        lead.name ?? "Customer"
      }`;

    const taskDescription =
      taskRule?.description ??
      "Call the customer to follow up on the estimate. Record the call outcome when complete.";

    const taskPriority =
      taskRule?.default_priority ??
      "high";

    const taskCategory =
      taskRule?.category ?? "sales";

    const taskMetadata = {
      created_by:
        "send_estimate_workflow",
      task_rule_key:
        taskRule?.task_key ??
        "proposal_follow_up",
      estimate_sent_at: sentAtIso,
      customer_name: lead.name,
      phone: lead.phone,
      email: lead.email,
      project_type:
        lead.project_type,
      property_address:
        lead.property_address,
      preferred_contact_method:
        lead.preferred_contact_method,
      follow_up_number: 1,
      assigned_to_id:
        assignedToId,
    };

    const {
      data: legacyFollowUpTask,
      error: legacyTaskCreateError,
    } = await supabase
      .from("lead_tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "first_phone_follow_up",
        title: taskTitle,
        description:
          taskDescription,
        status: "open",
        priority: taskPriority,
        due_at: followUpAtIso,
        assigned_to_id:
          assignedToId,
        assigned_at: assignedToId
          ? sentAtIso
          : null,
        metadata: taskMetadata,
      })
      .select("id")
      .single();

    if (legacyTaskCreateError) {
      console.error(
        "Unable to create lead proposal follow-up task:",
        legacyTaskCreateError,
      );
    }

    const {
      data: companyFollowUpTask,
      error: companyTaskCreateError,
    } = await supabase
      .from("tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "first_phone_follow_up",
        task_type_id:
          taskRule?.id ?? null,
        title: taskTitle,
        description:
          taskDescription,
        category: taskCategory,
        status: "open",
        priority: taskPriority,
        due_at: followUpAtIso,
        assigned_to_id:
          assignedToId,
        assigned_at: assignedToId
          ? sentAtIso
          : null,
        source_type:
          "send_estimate_workflow",
        metadata: {
          ...taskMetadata,
          legacy_lead_task_id:
            legacyFollowUpTask?.id ??
            null,
        },
      })
      .select("id")
      .single();

    if (companyTaskCreateError) {
      console.error(
        "Unable to create company proposal follow-up task:",
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
          "estimate_sent",
        channel: "estimate",
        direction: "outbound",
        summary:
          "Estimate sent to customer",
        details:
          formatDateAndTime(sentAt),
        metadata: {
          previous_lead_status:
            lead.lead_status,
          new_lead_status:
            "proposal_sent",
          estimate_sent_at:
            sentAtIso,
        },
      },
      {
        lead_id: leadId,
        activity_type:
          "phone_follow_up_scheduled",
        channel: "task",
        direction: "internal",
        summary:
          "First proposal follow-up scheduled",
        details: followUpAtIso
          ? `Follow-up due ${formatDateAndTime(
              new Date(followUpAtIso),
            )}`
          : "Follow-up has no automatic due date.",
        metadata: {
          task_type:
            "first_phone_follow_up",
          task_rule_key:
            taskRule?.task_key ??
            "proposal_follow_up",
          legacy_task_id:
            legacyFollowUpTask?.id ??
            null,
          company_task_id:
            companyFollowUpTask?.id ??
            null,
          due_at: followUpAtIso,
          assigned_to_id:
            assignedToId,
        },
      },
    ];

    const { error: activityError } =
      await supabase
        .from("lead_activities")
        .insert(activityRecords);

    if (activityError) {
      console.error(
        "Unable to log estimate-sent activities:",
        activityError,
      );
    }

    return Response.json({
      success: true,
      estimateSentAt: sentAtIso,
      followUpAt: followUpAtIso,
      followUpTaskCreated:
        Boolean(legacyFollowUpTask),
      companyTaskCreated:
        Boolean(companyFollowUpTask),
      assignedToId,
    });
  } catch (error) {
    console.error(
      "Send estimate workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the estimate-sent workflow.",
      },
      {
        status: 500,
      },
    );
  }
}