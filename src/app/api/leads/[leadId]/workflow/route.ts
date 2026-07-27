import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedLeadStatuses = [
  "new",
  "contacted",
  "consultation_scheduled",
  "estimate_in_progress",
  "proposal_sent",
  "customer_reviewing",
  "won",
  "lost",
];

const allowedConsultationStatuses = [
  "not_requested",
  "pending",
  "confirmed",
  "declined",
  "canceled",
  "completed",
];

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

function optionalText(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue.length > 0
    ? cleanedValue
    : null;
}

function requiredText(
  value: FormDataEntryValue | null,
  fieldName: string,
): string {
  const cleanedValue = optionalText(value);

  if (!cleanedValue) {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  return cleanedValue;
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
    },
  });
}

function addBusinessDays(
  startingDate: Date,
  numberOfDays: number,
) {
  const date = new Date(startingDate);
  let daysAdded = 0;

  while (daysAdded < numberOfDays) {
    date.setDate(date.getDate() + 1);

    const dayOfWeek = date.getDay();

    if (
      dayOfWeek !== 0 &&
      dayOfWeek !== 6
    ) {
      daysAdded += 1;
    }
  }

  return date;
}

function getEndOfBusinessParts(
  endOfBusinessTime: string | null,
) {
  const fallback = {
    hours: 17,
    minutes: 0,
  };

  if (!endOfBusinessTime) {
    return fallback;
  }

  const [hoursText, minutesText] =
    endOfBusinessTime.split(":");

  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return fallback;
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

function getRuleDueAt(
  rule: TaskRule | null,
  endOfBusinessTime: string | null,
) {
  if (!rule) {
    return setEndOfBusiness(
      new Date(),
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    rule.due_mode === "no_due_date"
  ) {
    return null;
  }

  const now = new Date();

  if (rule.due_mode === "same_day") {
    return setEndOfBusiness(
      now,
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    rule.due_mode === "business_days"
  ) {
    return setEndOfBusiness(
      addBusinessDays(
        now,
        Math.max(rule.due_offset, 0),
      ),
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    rule.due_mode === "calendar_days"
  ) {
    const dueDate = new Date(now);

    dueDate.setDate(
      dueDate.getDate() +
        Math.max(rule.due_offset, 0),
    );

    return setEndOfBusiness(
      dueDate,
      endOfBusinessTime,
    ).toISOString();
  }

  return setEndOfBusiness(
    now,
    endOfBusinessTime,
  ).toISOString();
}

function resolveAssigneeId(
  rule: TaskRule | null,
  settings: CompanySettings | null,
) {
  if (!rule) {
    return (
      settings?.default_lead_owner_id ??
      null
    );
  }

  if (
    rule.assignment_strategy ===
    "specific_employee"
  ) {
    return (
      rule.default_assignee_id ?? null
    );
  }

  if (
    rule.assignment_strategy ===
      "lead_owner" ||
    rule.assignment_strategy ===
      "default_lead_owner"
  ) {
    return (
      settings?.default_lead_owner_id ??
      null
    );
  }

  if (
    rule.assignment_strategy ===
    "default_estimator"
  ) {
    return (
      settings?.default_estimator_id ??
      null
    );
  }

  if (
    rule.assignment_strategy ===
    "default_project_manager"
  ) {
    return (
      settings?.default_project_manager_id ??
      null
    );
  }

  return null;
}

export async function POST(
  request: Request,
) {
  try {
    const formData =
      await request.formData();

    const website = optionalText(
      formData.get("website"),
    );

    if (website) {
      return redirectTo("/thank-you");
    }

    const name = requiredText(
      formData.get("name"),
      "Name",
    );

    const phone = requiredText(
      formData.get("phone"),
      "Phone",
    );

    const email = optionalText(
      formData.get("email"),
    );

    const propertyAddress = optionalText(
      formData.get("propertyAddress"),
    );

    const projectType = requiredText(
      formData.get("projectType"),
      "Project type",
    );

    const description = requiredText(
      formData.get("description"),
      "Project description",
    );

    const estimatedBudget = optionalText(
      formData.get("estimatedBudget"),
    );

    const desiredTimeline = optionalText(
      formData.get("desiredTimeline"),
    );

    const preferredContactMethod =
      optionalText(
        formData.get(
          "preferredContactMethod",
        ),
      ) ?? "phone";

    const requestedDate = optionalText(
      formData.get("requestedDate"),
    );

    const requestedTime = optionalText(
      formData.get("requestedTime"),
    );

    const alternateDate = optionalText(
      formData.get("alternateDate"),
    );

    const alternateTime = optionalText(
      formData.get("alternateTime"),
    );

    const consultationWasRequested =
      Boolean(
        requestedDate ||
          requestedTime,
      );

    const consultationStatus =
      consultationWasRequested
        ? "pending"
        : "not_requested";

    const supabase =
      createAdminServerClient();

    const [
      settingsResult,
      taskRuleResult,
    ] = await Promise.all([
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
          "new_lead_follow_up",
        )
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (settingsResult.error) {
      console.error(
        "Unable to load company settings for new lead:",
        settingsResult.error,
      );
    }

    if (taskRuleResult.error) {
      console.error(
        "Unable to load new-lead task rule:",
        taskRuleResult.error,
      );
    }

    const companySettings =
      (settingsResult.data ??
        null) as CompanySettings | null;

    const taskRule =
      (taskRuleResult.data ??
        null) as TaskRule | null;

    const assignedToId =
      resolveAssigneeId(
        taskRule,
        companySettings,
      );

    const nowIso =
      new Date().toISOString();

    const {
      data: newLead,
      error: leadError,
    } = await supabase
      .from("leads")
      .insert({
        name,
        phone,
        email,
        property_address:
          propertyAddress,
        project_type: projectType,
        description,
        estimated_budget:
          estimatedBudget,
        desired_timeline:
          desiredTimeline,
        preferred_contact_method:
          preferredContactMethod,
        requested_date:
          requestedDate,
        requested_time:
          requestedTime,
        alternate_date:
          alternateDate,
        alternate_time:
          alternateTime,
        consultation_status:
          consultationStatus,
        lead_status: "new",
        lead_source: "website",
        responsible_person_id:
          assignedToId,
        assigned_at: assignedToId
          ? nowIso
          : null,
        assigned_by_id: null,
      })
      .select(
        "id, responsible_person_id",
      )
      .single();

    if (leadError || !newLead) {
      console.error(
        "Supabase lead submission error:",
        leadError,
      );

      return redirectTo(
        "/contact?error=submission",
      );
    }

    const leadId = String(newLead.id);

    const initialReviewDueAt =
      getRuleDueAt(
        taskRule,
        companySettings?.end_of_business_time ??
          null,
      );

    const taskTitle =
      taskRule?.name
        ? `${taskRule.name}: ${name}`
        : `Review new lead: ${name}`;

    const taskDescription =
      taskRule?.description ??
      "Review the customer request, contact the lead, and confirm the next step.";

    const taskPriority =
      taskRule?.default_priority ??
      "high";

    const taskCategory =
      taskRule?.category ?? "sales";

    const taskMetadata = {
      created_by:
        "website_lead_workflow",
      task_rule_key:
        taskRule?.task_key ??
        "new_lead_follow_up",
      customer_name: name,
      project_type: projectType,
      preferred_contact_method:
        preferredContactMethod,
      property_address:
        propertyAddress,
      phone,
      email,
      consultation_requested:
        consultationWasRequested,
    };

    const activityPromise = supabase
      .from("lead_activities")
      .insert({
        lead_id: leadId,
        activity_type:
          "lead_submitted",
        channel: "system",
        direction: "inbound",
        summary:
          "Website lead submitted",
        details: `${name} submitted a request for ${projectType}.`,
        metadata: {
          source: "website",
          phone,
          email,
          property_address:
            propertyAddress,
          consultation_requested:
            consultationWasRequested,
          requested_date:
            requestedDate,
          requested_time:
            requestedTime,
          assigned_to_id:
            assignedToId,
        },
      });

    const legacyTaskPromise =
      supabase
        .from("lead_tasks")
        .insert({
          lead_id: leadId,
          task_type:
            "review_new_lead",
          title: taskTitle,
          description:
            taskDescription,
          status: "open",
          priority: taskPriority,
          due_at:
            initialReviewDueAt,
          assigned_to_id:
            assignedToId,
          assigned_at: assignedToId
            ? nowIso
            : null,
          metadata: taskMetadata,
        })
        .select("id")
        .single();

    const [
      activityResult,
      legacyTaskResult,
    ] = await Promise.all([
      activityPromise,
      legacyTaskPromise,
    ]);

    if (
      activityResult.error ||
      legacyTaskResult.error
    ) {
      console.error(
        "Lead workflow creation error:",
        {
          activityError:
            activityResult.error,
          taskError:
            legacyTaskResult.error,
          leadId,
        },
      );

      await Promise.all([
        supabase
          .from("lead_activities")
          .delete()
          .eq("lead_id", leadId),

        supabase
          .from("lead_tasks")
          .delete()
          .eq("lead_id", leadId),
      ]);

      await supabase
        .from("leads")
        .delete()
        .eq("id", leadId);

      return redirectTo(
        "/contact?error=submission",
      );
    }

    const {
      error: companyTaskError,
    } = await supabase
      .from("tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "review_new_lead",
        task_type_id:
          taskRule?.id ?? null,
        title: taskTitle,
        description:
          taskDescription,
        category: taskCategory,
        status: "open",
        priority: taskPriority,
        due_at: initialReviewDueAt,
        assigned_to_id:
          assignedToId,
        assigned_at: assignedToId
          ? nowIso
          : null,
        source_type:
          "website_lead_workflow",
        metadata: {
          ...taskMetadata,
          legacy_lead_task_id:
            legacyTaskResult.data?.id ??
            null,
        },
      });

    if (companyTaskError) {
      console.error(
        "Unable to create company-wide new-lead task:",
        companyTaskError,
      );

      await Promise.all([
        supabase
          .from("lead_activities")
          .delete()
          .eq("lead_id", leadId),

        supabase
          .from("lead_tasks")
          .delete()
          .eq("lead_id", leadId),

        supabase
          .from("tasks")
          .delete()
          .eq("lead_id", leadId),
      ]);

      await supabase
        .from("leads")
        .delete()
        .eq("id", leadId);

      return redirectTo(
        "/contact?error=submission",
      );
    }

    return redirectTo("/thank-you");
  } catch (error) {
    console.error(
      "Project request error:",
      error,
    );

    return redirectTo(
      "/contact?error=submission",
    );
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const rawLeadId =
      body.leadId ?? body.lead_id;

    const leadId =
      typeof rawLeadId === "string" ||
      typeof rawLeadId === "number"
        ? String(rawLeadId).trim()
        : "";

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

    const updates: {
      lead_status?: string;
      consultation_status?: string;
      notes?: string | null;
      follow_up_at?: string | null;
    } = {};

    const rawLeadStatus =
      body.status ??
      body.leadStatus ??
      body.lead_status;

    if (rawLeadStatus !== undefined) {
      const leadStatus =
        typeof rawLeadStatus === "string"
          ? rawLeadStatus.trim()
          : "";

      if (
        !allowedLeadStatuses.includes(
          leadStatus,
        )
      ) {
        return Response.json(
          {
            error:
              "A valid lead status is required.",
          },
          {
            status: 400,
          },
        );
      }

      updates.lead_status =
        leadStatus;
    }

    const rawConsultationStatus =
      body.consultationStatus ??
      body.consultation_status;

    if (
      rawConsultationStatus !== undefined
    ) {
      const consultationStatus =
        typeof rawConsultationStatus ===
        "string"
          ? rawConsultationStatus.trim()
          : "";

      if (
        !allowedConsultationStatuses.includes(
          consultationStatus,
        )
      ) {
        return Response.json(
          {
            error:
              "A valid consultation status is required.",
          },
          {
            status: 400,
          },
        );
      }

      updates.consultation_status =
        consultationStatus;
    }

    if (body.notes !== undefined) {
      if (
        typeof body.notes !== "string"
      ) {
        return Response.json(
          {
            error:
              "Notes must be valid text.",
          },
          {
            status: 400,
          },
        );
      }

      const cleanedNotes =
        body.notes.trim();

      updates.notes =
        cleanedNotes.length > 0
          ? cleanedNotes
          : null;
    }

    const rawFollowUpAt =
      body.followUpAt ??
      body.follow_up_at;

    if (rawFollowUpAt !== undefined) {
      if (
        rawFollowUpAt === null ||
        rawFollowUpAt === ""
      ) {
        updates.follow_up_at = null;
      } else if (
        typeof rawFollowUpAt === "string"
      ) {
        const followUpDate = new Date(
          rawFollowUpAt,
        );

        if (
          Number.isNaN(
            followUpDate.getTime(),
          )
        ) {
          return Response.json(
            {
              error:
                "A valid follow-up date and time is required.",
            },
            {
              status: 400,
            },
          );
        }

        updates.follow_up_at =
          followUpDate.toISOString();
      } else {
        return Response.json(
          {
            error:
              "A valid follow-up date and time is required.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (
      Object.keys(updates).length === 0
    ) {
      console.error(
        "No recognized lead changes:",
        body,
      );

      return Response.json(
        {
          error:
            "No valid lead changes were provided.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

    const {
      data: existingLead,
      error: readError,
    } = await supabase
      .from("leads")
      .select(
        "id, lead_status, consultation_status, notes, follow_up_at",
      )
      .eq("id", leadId)
      .single();

    if (readError || !existingLead) {
      console.error(
        "Supabase lead read error:",
        readError,
      );

      return Response.json(
        {
          error:
            readError?.message ??
            "Lead could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    const { data, error } =
      await supabase
        .from("leads")
        .update(updates)
        .eq("id", leadId)
        .select(
          "id, lead_status, consultation_status, notes, follow_up_at",
        )
        .single();

    if (error) {
      console.error(
        "Supabase lead update error:",
        error,
      );

      return Response.json(
        {
          error: error.message,
        },
        {
          status: 500,
        },
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
    }> = [];

    if (
      updates.lead_status !==
        undefined &&
      updates.lead_status !==
        existingLead.lead_status
    ) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          "lead_status_changed",
        channel: "status",
        direction: "internal",
        summary: `Lead status changed to ${updates.lead_status.replaceAll(
          "_",
          " ",
        )}`,
        details: null,
        metadata: {
          previous_status:
            existingLead.lead_status,
          new_status:
            updates.lead_status,
        },
      });
    }

    if (
      updates.consultation_status !==
        undefined &&
      updates.consultation_status !==
        existingLead.consultation_status
    ) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          "consultation_status_changed",
        channel: "consultation",
        direction: "internal",
        summary: `Consultation status changed to ${updates.consultation_status.replaceAll(
          "_",
          " ",
        )}`,
        details: null,
        metadata: {
          previous_status:
            existingLead.consultation_status,
          new_status:
            updates.consultation_status,
        },
      });
    }

    if (
      updates.follow_up_at !==
        undefined &&
      updates.follow_up_at !==
        existingLead.follow_up_at
    ) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          updates.follow_up_at
            ? "follow_up_scheduled"
            : "follow_up_removed",
        channel: "task",
        direction: "internal",
        summary:
          updates.follow_up_at
            ? "Follow-up scheduled"
            : "Follow-up removed",
        details:
          updates.follow_up_at,
        metadata: {
          previous_follow_up_at:
            existingLead.follow_up_at,
          new_follow_up_at:
            updates.follow_up_at,
        },
      });
    }

    if (
      updates.notes !== undefined &&
      updates.notes !==
        existingLead.notes
    ) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          "notes_updated",
        channel: "note",
        direction: "internal",
        summary:
          "Lead notes updated",
        details: updates.notes,
        metadata: {},
      });
    }

    if (
      activityRecords.length > 0
    ) {
      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert(activityRecords);

      if (activityError) {
        console.error(
          "Lead activity logging error:",
          activityError,
        );
      }
    }

    return Response.json({
      success: true,
      lead: data,
    });
  } catch (error) {
    console.error(
      "Lead update request error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to update the lead.",
      },
      {
        status: 500,
      },
    );
  }
}