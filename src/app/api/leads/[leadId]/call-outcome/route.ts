import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type CallOutcome =
  | "spoke"
  | "no_answer"
  | "left_voicemail"
  | "callback_requested";

type RequestBody = {
  outcome?: unknown;
  notes?: unknown;
  callbackAt?: unknown;
};

type LeadRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  project_type: string | null;
  property_address: string | null;
  lead_status: string | null;
  follow_up_at: string | null;
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

type NewTaskInput = {
  taskType: string;
  taskRule: TaskRule | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  dueAt: string | null;
  assignedToId: string | null;
  sourceType: string;
  metadata: Record<string, unknown>;
};

const allowedOutcomes: CallOutcome[] = [
  "spoke",
  "no_answer",
  "left_voicemail",
  "callback_requested",
];

function isCallOutcome(
  value: string,
): value is CallOutcome {
  return allowedOutcomes.includes(
    value as CallOutcome,
  );
}

function addBusinessDays(
  startingDate: Date,
  numberOfDays: number,
) {
  const result = new Date(startingDate);
  let daysAdded = 0;

  while (daysAdded < numberOfDays) {
    result.setDate(result.getDate() + 1);

    const dayOfWeek = result.getDay();

    if (
      dayOfWeek !== 0 &&
      dayOfWeek !== 6
    ) {
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
      startingDate,
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    taskRule.due_mode === "no_due_date"
  ) {
    return null;
  }

  if (
    taskRule.due_mode === "same_day"
  ) {
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
    startingDate,
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

function getOutcomeLabel(
  outcome: CallOutcome,
) {
  switch (outcome) {
    case "spoke":
      return "Spoke with customer";

    case "no_answer":
      return "No answer";

    case "left_voicemail":
      return "Left voicemail";

    case "callback_requested":
      return "Call back requested";
  }
}

export async function POST(
  request: Request,
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

    const body =
      (await request.json()) as RequestBody;

    const outcome =
      typeof body.outcome === "string"
        ? body.outcome.trim()
        : "";

    if (!isCallOutcome(outcome)) {
      return Response.json(
        {
          error:
            "Choose a valid call outcome.",
        },
        {
          status: 400,
        },
      );
    }

    const notes =
      typeof body.notes === "string"
        ? body.notes.trim()
        : "";

    const callbackAt =
      typeof body.callbackAt === "string"
        ? body.callbackAt.trim()
        : "";

    let callbackDate: Date | null = null;

    if (
      outcome === "callback_requested"
    ) {
      callbackDate = new Date(
        callbackAt,
      );

      if (
        !callbackAt ||
        Number.isNaN(
          callbackDate.getTime(),
        )
      ) {
        return Response.json(
          {
            error:
              "Choose a valid callback date and time.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const supabase =
      createAdminServerClient();

    const [
      leadResult,
      reviewTaskRuleResult,
      callbackTaskRuleResult,
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
            lead_status,
            follow_up_at,
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
          "review_email_draft",
        )
        .eq("is_active", true)
        .maybeSingle(),

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
          "customer_callback",
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

    if (reviewTaskRuleResult.error) {
      console.error(
        "Unable to load review-email task rule:",
        reviewTaskRuleResult.error,
      );
    }

    if (callbackTaskRuleResult.error) {
      console.error(
        "Unable to load callback task rule:",
        callbackTaskRuleResult.error,
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

    const reviewTaskRule =
      (reviewTaskRuleResult.data ??
        null) as TaskRule | null;

    const callbackTaskRule =
      (callbackTaskRuleResult.data ??
        null) as TaskRule | null;

    const companySettings =
      (settingsResult.data ??
        null) as CompanySettings | null;

    if (
      (outcome === "no_answer" ||
        outcome === "left_voicemail") &&
      !lead.email
    ) {
      return Response.json(
        {
          error:
            "This customer has no email address. Add an email before recording a no-answer or voicemail outcome.",
        },
        {
          status: 400,
        },
      );
    }

    const occurredAt = new Date();

    const occurredAtIso =
      occurredAt.toISOString();

    const outcomeLabel =
      getOutcomeLabel(outcome);

    const completionNote = notes
      ? `${outcomeLabel}. ${notes}`
      : outcomeLabel;

    async function completePhoneTasks() {
      const updateValues = {
        status: "completed",
        completed_at: occurredAtIso,
        completion_note:
          completionNote,
      };

      const taskTypes = [
        "first_phone_follow_up",
        "phone_follow_up",
        "callback_customer",
      ];

      const [
        legacyResult,
        companyResult,
      ] = await Promise.all([
        supabase
          .from("lead_tasks")
          .update(updateValues)
          .eq("lead_id", leadId)
          .in(
            "task_type",
            taskTypes,
          )
          .in("status", [
            "open",
            "in_progress",
          ]),

        supabase
          .from("tasks")
          .update(updateValues)
          .eq("lead_id", leadId)
          .in(
            "task_type",
            taskTypes,
          )
          .in("status", [
            "open",
            "in_progress",
          ]),
      ]);

      if (legacyResult.error) {
        console.error(
          "Unable to complete lead phone tasks:",
          legacyResult.error,
        );
      }

      if (companyResult.error) {
        console.error(
          "Unable to complete company phone tasks:",
          companyResult.error,
        );
      }
    }

    async function cancelCallbackTasks() {
      const updateValues = {
        status: "canceled",
        canceled_at: occurredAtIso,
        completion_note:
          "Replaced by a newly scheduled callback.",
      };

      const [
        legacyResult,
        companyResult,
      ] = await Promise.all([
        supabase
          .from("lead_tasks")
          .update(updateValues)
          .eq("lead_id", leadId)
          .eq(
            "task_type",
            "callback_customer",
          )
          .in("status", [
            "open",
            "in_progress",
          ]),

        supabase
          .from("tasks")
          .update(updateValues)
          .eq("lead_id", leadId)
          .eq(
            "task_type",
            "callback_customer",
          )
          .in("status", [
            "open",
            "in_progress",
          ]),
      ]);

      if (legacyResult.error) {
        console.error(
          "Unable to cancel lead callback tasks:",
          legacyResult.error,
        );
      }

      if (companyResult.error) {
        console.error(
          "Unable to cancel company callback tasks:",
          companyResult.error,
        );
      }
    }

    async function createTaskPair(
      input: NewTaskInput,
    ) {
      const assignedAt =
        input.assignedToId
          ? occurredAtIso
          : null;

      const {
        data: legacyTask,
        error: legacyTaskError,
      } = await supabase
        .from("lead_tasks")
        .insert({
          lead_id: leadId,
          task_type:
            input.taskType,
          title: input.title,
          description:
            input.description,
          status: "open",
          priority:
            input.priority,
          due_at: input.dueAt,
          assigned_to_id:
            input.assignedToId,
          assigned_at: assignedAt,
          metadata: input.metadata,
        })
        .select("id")
        .single();

      if (legacyTaskError) {
        console.error(
          `Unable to create ${input.taskType} lead task:`,
          legacyTaskError,
        );
      }

      const {
        data: companyTask,
        error: companyTaskError,
      } = await supabase
        .from("tasks")
        .insert({
          lead_id: leadId,
          task_type:
            input.taskType,
          task_type_id:
            input.taskRule?.id ??
            null,
          title: input.title,
          description:
            input.description,
          category:
            input.category,
          status: "open",
          priority:
            input.priority,
          due_at: input.dueAt,
          assigned_to_id:
            input.assignedToId,
          assigned_at: assignedAt,
          source_type:
            input.sourceType,
          metadata: {
            ...input.metadata,
            legacy_lead_task_id:
              legacyTask?.id ?? null,
          },
        })
        .select("id")
        .single();

      if (companyTaskError) {
        console.error(
          `Unable to create ${input.taskType} company task:`,
          companyTaskError,
        );
      }

      return {
        legacyTaskId:
          legacyTask?.id ?? null,
        companyTaskId:
          companyTask?.id ?? null,
      };
    }

    let emailDraftId: string | null =
      null;

    let emailDraftCreated = false;
    let reviewTaskCreated = false;
    let callbackTaskCreated = false;
    let nextFollowUpAt: string | null =
      null;

    let reviewTaskIds: {
      legacyTaskId: string | null;
      companyTaskId: string | null;
    } | null = null;

    let callbackTaskIds: {
      legacyTaskId: string | null;
      companyTaskId: string | null;
    } | null = null;

    if (
      outcome === "no_answer" ||
      outcome === "left_voicemail"
    ) {
      const emailSubject =
        "Following up on your McKenzie Construction estimate";

      const openingSentence =
        outcome === "left_voicemail"
          ? "I just tried to reach you by phone and left a voicemail."
          : "I just tried to reach you by phone but was unable to connect.";

      const emailBody = `Hi ${lead.name ?? "there"},

${openingSentence} I wanted to follow up regarding the estimate for your ${
        lead.project_type ?? "project"
      }.

Please let me know whether you have any questions, would like to discuss changes, or are ready to move forward. You can reply to this email or call me at 865-263-3811.

Thank you,

Michael McKenzie
McKenzie Construction
865-263-3811`;

      const {
        data: emailDraft,
        error: draftError,
      } = await supabase
        .from("email_drafts")
        .insert({
          lead_id: leadId,
          template_key:
            outcome === "left_voicemail"
              ? "estimate_follow_up_voicemail"
              : "estimate_follow_up_no_answer",
          to_email: lead.email,
          subject: emailSubject,
          body: emailBody,
          status: "draft",
          metadata: {
            created_by:
              "call_outcome_workflow",
            call_outcome: outcome,
            call_attempted_at:
              occurredAtIso,
            next_phone_follow_up_after_send:
              true,
            next_phone_follow_up_business_days:
              3,
          },
        })
        .select("id")
        .single();

      if (
        draftError ||
        !emailDraft
      ) {
        console.error(
          "Unable to create follow-up email draft:",
          draftError,
        );

        return Response.json(
          {
            error:
              draftError?.message ??
              "Unable to create the follow-up email draft.",
          },
          {
            status: 500,
          },
        );
      }

      emailDraftId =
        String(emailDraft.id);

      emailDraftCreated = true;

      const reviewDueAt =
        getTaskDueAt(
          reviewTaskRule,
          companySettings,
          occurredAt,
        );

      const reviewAssignedToId =
        resolveAssigneeId(
          reviewTaskRule,
          companySettings,
          lead,
        );

      reviewTaskIds =
        await createTaskPair({
          taskType:
            "review_follow_up_email",
          taskRule: reviewTaskRule,
          title: `Review follow-up email: ${
            lead.name ?? "Customer"
          }`,
          description:
            reviewTaskRule?.description ??
            "Review the prepared follow-up email, make any job-specific changes, and approve it for sending.",
          category:
            reviewTaskRule?.category ??
            "sales",
          priority:
            reviewTaskRule?.default_priority ??
            "high",
          dueAt: reviewDueAt,
          assignedToId:
            reviewAssignedToId,
          sourceType:
            "call_outcome_workflow",
          metadata: {
            created_by:
              "call_outcome_workflow",
            task_rule_key:
              reviewTaskRule?.task_key ??
              "review_email_draft",
            email_draft_id:
              emailDraftId,
            call_outcome: outcome,
            customer_name: lead.name,
            assigned_to_id:
              reviewAssignedToId,
          },
        });

      reviewTaskCreated =
        Boolean(
          reviewTaskIds.legacyTaskId ||
            reviewTaskIds.companyTaskId,
        );

      nextFollowUpAt =
        reviewDueAt;

      const {
        error: leadUpdateError,
      } = await supabase
        .from("leads")
        .update({
          follow_up_at:
            reviewDueAt,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        console.error(
          "Unable to update lead follow-up:",
          leadUpdateError,
        );
      }
    }

    if (
      outcome === "callback_requested" &&
      callbackDate
    ) {
      const callbackAtIso =
        callbackDate.toISOString();

      await cancelCallbackTasks();

      const callbackAssignedToId =
        resolveAssigneeId(
          callbackTaskRule,
          companySettings,
          lead,
        );

      callbackTaskIds =
        await createTaskPair({
          taskType:
            "callback_customer",
          taskRule:
            callbackTaskRule,
          title: `Call back: ${
            lead.name ?? "Customer"
          }`,
          description:
            callbackTaskRule?.description ??
            "Call the customer back at the requested date and time.",
          category:
            callbackTaskRule?.category ??
            "sales",
          priority:
            callbackTaskRule?.default_priority ??
            "high",
          dueAt: callbackAtIso,
          assignedToId:
            callbackAssignedToId,
          sourceType:
            "call_outcome_workflow",
          metadata: {
            created_by:
              "call_outcome_workflow",
            task_rule_key:
              callbackTaskRule?.task_key ??
              "customer_callback",
            customer_name: lead.name,
            phone: lead.phone,
            callback_requested_at:
              occurredAtIso,
            callback_at:
              callbackAtIso,
            assigned_to_id:
              callbackAssignedToId,
          },
        });

      callbackTaskCreated =
        Boolean(
          callbackTaskIds.legacyTaskId ||
            callbackTaskIds.companyTaskId,
        );

      const {
        error: leadUpdateError,
      } = await supabase
        .from("leads")
        .update({
          follow_up_at:
            callbackAtIso,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        console.error(
          "Unable to update callback date:",
          leadUpdateError,
        );
      }

      nextFollowUpAt =
        callbackAtIso;
    }

    if (outcome === "spoke") {
      const {
        error: leadUpdateError,
      } = await supabase
        .from("leads")
        .update({
          follow_up_at: null,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        console.error(
          "Unable to clear completed follow-up:",
          leadUpdateError,
        );
      }
    }

    await completePhoneTasks();

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
          "phone_call_outcome",
        channel: "call",
        direction: "outbound",
        summary: outcomeLabel,
        details: notes || null,
        metadata: {
          outcome,
          phone: lead.phone,
          occurred_at:
            occurredAtIso,
          previous_follow_up_at:
            lead.follow_up_at,
        },
      },
    ];

    if (emailDraftCreated) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          "email_draft_created",
        channel: "email",
        direction: "outbound",
        summary:
          "Estimate follow-up email draft created",
        details:
          "Draft requires review and approval before sending.",
        metadata: {
          email_draft_id:
            emailDraftId,
          call_outcome: outcome,
          legacy_review_task_id:
            reviewTaskIds?.legacyTaskId ??
            null,
          company_review_task_id:
            reviewTaskIds?.companyTaskId ??
            null,
        },
      });
    }

    if (callbackDate) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          "callback_scheduled",
        channel: "task",
        direction: "internal",
        summary:
          "Customer callback scheduled",
        details:
          formatDateAndTime(
            callbackDate,
          ),
        metadata: {
          callback_at:
            callbackDate.toISOString(),
          legacy_task_id:
            callbackTaskIds?.legacyTaskId ??
            null,
          company_task_id:
            callbackTaskIds?.companyTaskId ??
            null,
        },
      });
    }

    const { error: activityError } =
      await supabase
        .from("lead_activities")
        .insert(activityRecords);

    if (activityError) {
      console.error(
        "Unable to log call outcome activities:",
        activityError,
      );
    }

    return Response.json({
      success: true,
      outcome,
      outcomeLabel,
      emailDraftCreated,
      emailDraftId,
      reviewTaskCreated,
      callbackTaskCreated,
      nextFollowUpAt,
    });
  } catch (error) {
    console.error(
      "Call outcome workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the call outcome workflow.",
      },
      {
        status: 500,
      },
    );
  }
}