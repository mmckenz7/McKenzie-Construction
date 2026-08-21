import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import {
  resolveTaskAssignee,
  taskAssigneeIsRequired,
  type CompanyAssignmentSettings,
  type TaskAssignmentStrategy,
} from "@/lib/crm/assignment";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  consultationDateTimeToDate,
  isConsultationDateTimeAllowed,
} from "@/lib/consultation-hours";
import { companyEmailSignature } from "@/lib/crm/company-signature";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type RequestBody = {
  appointmentAt?: unknown;
  customerConfirmed?: unknown;
};

type LeadRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  project_type: string | null;
  lead_status: string | null;
  consultation_status: string | null;
  responsible_person_id: string | null;
};

type TaskTypeRecord = {
  id: string;
  name: string;
  task_key: string;
  description: string | null;
  category: string;
  default_priority: string;
  assignment_strategy: string;
  default_assignee_id: string | null;
  is_active: boolean;
};

const allowedAssignmentStrategies =
  new Set<TaskAssignmentStrategy>([
    "specific_employee",
    "lead_owner",
    "default_lead_owner",
    "default_estimator",
    "default_project_manager",
    "unassigned",
  ]);

function normalizeAssignmentStrategy(
  value: string,
): TaskAssignmentStrategy {
  if (
    allowedAssignmentStrategies.has(
      value as TaskAssignmentStrategy,
    )
  ) {
    return value as TaskAssignmentStrategy;
  }

  return "lead_owner";
}

function formatAppointmentForEmail(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
  ).format(date);
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

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

    const appointmentAt =
      typeof body.appointmentAt ===
      "string"
        ? body.appointmentAt.trim()
        : "";

    const appointmentDate =
      consultationDateTimeToDate(appointmentAt);
    const customerConfirmed = body.customerConfirmed === true;

    if (
      !appointmentAt ||
      !appointmentDate
    ) {
      return Response.json(
        {
          error:
            "Choose a valid consultation date and time.",
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
      settingsResult,
      taskTypeResult,
    ] = await Promise.all([
      supabase
        .from("leads")
        .select(
          `
            id,
            name,
            email,
            phone,
            property_address,
            project_type,
            lead_status,
            consultation_status,
            responsible_person_id
          `,
        )
        .eq("id", leadId)
        .single(),

      supabase
        .from("company_settings")
        .select(
          `
            automatically_assign_new_leads,
            company_name,
            consultation_start_time,
            consultation_end_time,
            automatically_assign_new_tasks,
            automatically_assign_converted_projects,
            allow_unassigned_leads,
            allow_unassigned_tasks,
            require_responsible_person,
            require_task_assignee,
            require_project_manager,
            default_lead_owner_id,
            default_estimator_id,
            default_project_manager_id
          `,
        )
        .limit(1)
        .maybeSingle(),

      supabase
        .from("task_types")
        .select(
          `
            id,
            name,
            task_key,
            description,
            category,
            default_priority,
            assignment_strategy,
            default_assignee_id,
            is_active
          `,
        )
        .eq(
          "task_key",
          "complete_consultation",
        )
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (
      leadResult.error ||
      !leadResult.data
    ) {
      return Response.json(
        {
          error:
            leadResult.error
              ?.message ??
            "The lead could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      settingsResult.error ||
      !settingsResult.data
    ) {
      console.error(
        "Unable to load company assignment settings:",
        settingsResult.error,
      );

      return Response.json(
        {
          error:
            "Company assignment settings could not be loaded.",
        },
        {
          status: 500,
        },
      );
    }

    if (!isConsultationDateTimeAllowed(appointmentAt, {
      start: settingsResult.data.consultation_start_time ?? "08:00",
      end: settingsResult.data.consultation_end_time ?? "17:00",
    })) {
      return Response.json({ error: "Choose a consultation time in 30-minute increments within company consultation hours." }, { status: 400 });
    }

    if (taskTypeResult.error) {
      console.error(
        "Unable to load complete-consultation task type:",
        taskTypeResult.error,
      );

      return Response.json(
        {
          error:
            "The consultation task settings could not be loaded.",
        },
        {
          status: 500,
        },
      );
    }

    const lead =
      leadResult.data as LeadRecord;

    const assignmentSettings =
      settingsResult.data as CompanyAssignmentSettings;

    const taskType =
      taskTypeResult.data as
        | TaskTypeRecord
        | null;

    if (!lead.email) {
      return Response.json(
        {
          error:
            "This customer does not have an email address. Add one before confirming the consultation.",
        },
        {
          status: 400,
        },
      );
    }

    const formattedAppointment =
      formatAppointmentForEmail(
        appointmentAt,
      );

    if (!formattedAppointment) {
      return Response.json(
        {
          error:
            "The consultation date and time could not be formatted.",
        },
        {
          status: 400,
        },
      );
    }

    if (!customerConfirmed) {
      const now = new Date().toISOString();
      const appointmentIso = appointmentDate.toISOString();
      const { error: proposalError } = await supabase.from("leads").update({
        lead_status: "consultation_scheduled",
        consultation_status: "pending_customer_confirmation",
        follow_up_at: appointmentIso,
      }).eq("id", leadId);
      if (proposalError) return Response.json({ error: proposalError.message }, { status: 500 });
      const { error: activityError } = await supabase.from("lead_activities").insert({
        lead_id: leadId,
        activity_type: "consultation_proposed",
        channel: "consultation",
        direction: "outbound",
        summary: "Consultation pending customer confirmation",
        details: formattedAppointment,
        occurred_at: now,
        metadata: {
          previous_consultation_status: lead.consultation_status,
          appointment_at: appointmentIso,
          changed_by_auth_user_id: user.id,
        },
      });
      if (activityError) console.error("Unable to log consultation proposal:", activityError);
      return Response.json({ success: true, appointmentAt: appointmentIso, consultationStatus: "pending_customer_confirmation", emailDraftCreated: false, taskCreated: false });
    }

    const assignmentStrategy =
      taskType
        ? normalizeAssignmentStrategy(
            taskType.assignment_strategy,
          )
        : "lead_owner";

    let assignedToId:
      | string
      | null = null;

    try {
      assignedToId =
        await resolveTaskAssignee(
          supabase,
          {
            settings:
              assignmentSettings,
            assignmentStrategy,
            defaultAssigneeId:
              taskType
                ?.default_assignee_id ??
              null,
            leadOwnerId:
              lead.responsible_person_id,
          },
        );
    } catch (error) {
      console.error(
        "Unable to resolve consultation task assignee:",
        error,
      );

      return Response.json(
        {
          error:
            "The consultation task assignee could not be determined.",
        },
        {
          status: 500,
        },
      );
    }

    if (
      !assignedToId &&
      taskAssigneeIsRequired(
        assignmentSettings,
      )
    ) {
      return Response.json(
        {
          error:
            "An active task assignee is required before confirming the consultation.",
        },
        {
          status: 400,
        },
      );
    }

    const now =
      new Date().toISOString();

    const appointmentIso =
      appointmentDate.toISOString();

    const taskTitle =
      `Complete consultation: ${
        lead.name ?? "Customer"
      }`;

    const taskDescription =
      taskType?.description ??
      "Complete the site consultation, record notes, and mark the visit complete.";

    const taskCategory =
      taskType?.category ??
      "sales";

    const taskPriority =
      taskType
        ?.default_priority ??
      "high";

    const taskMetadata = {
      created_by:
        "confirm_consultation_workflow",
      appointment_at:
        appointmentIso,
      customer_name: lead.name,
      project_type:
        lead.project_type,
      property_address:
        lead.property_address,
      phone: lead.phone,
      assignment_strategy:
        assignmentStrategy,
      task_type_id:
        taskType?.id ?? null,
    };

    const {
      error: leadUpdateError,
    } = await supabase
      .from("leads")
      .update({
        lead_status:
          "consultation_scheduled",
        consultation_status:
          "confirmed",
        follow_up_at:
          appointmentIso,
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

    const reviewCompletion = {
      status: "completed",
      completed_at: now,
      completion_note:
        "Consultation confirmed with the customer.",
    };

    const [
      legacyReviewResult,
      companyReviewResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update(reviewCompletion)
        .eq("lead_id", leadId)
        .eq(
          "task_type",
          "review_new_lead",
        )
        .in("status", [
          "open",
          "in_progress",
        ]),

      supabase
        .from("tasks")
        .update(reviewCompletion)
        .eq("lead_id", leadId)
        .eq(
          "task_type",
          "review_new_lead",
        )
        .in("status", [
          "open",
          "in_progress",
        ]),
    ]);

    if (legacyReviewResult.error) {
      console.error(
        "Unable to complete lead review task:",
        legacyReviewResult.error,
      );
    }

    if (companyReviewResult.error) {
      console.error(
        "Unable to complete company review task:",
        companyReviewResult.error,
      );
    }

    const consultationCancellation = {
      status: "canceled",
      canceled_at: now,
      completion_note:
        "Replaced by a newly confirmed consultation.",
    };

    const [
      legacyCancelResult,
      companyCancelResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update(
          consultationCancellation,
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
          consultationCancellation,
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

    if (legacyCancelResult.error) {
      console.error(
        "Unable to cancel older lead consultation task:",
        legacyCancelResult.error,
      );
    }

    if (companyCancelResult.error) {
      console.error(
        "Unable to cancel older company consultation task:",
        companyCancelResult.error,
      );
    }

    const {
      data: legacyTask,
      error: legacyTaskCreateError,
    } = await supabase
      .from("lead_tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "complete_consultation",
        title: taskTitle,
        description:
          taskDescription,
        status: "open",
        priority:
          taskPriority,
        due_at:
          appointmentIso,
        assigned_to_id:
          assignedToId,
        assigned_at:
          assignedToId
            ? now
            : null,
        metadata:
          taskMetadata,
      })
      .select("id")
      .single();

    if (legacyTaskCreateError) {
      console.error(
        "Unable to create lead consultation task:",
        legacyTaskCreateError,
      );

      return Response.json(
        {
          error:
            legacyTaskCreateError.message,
        },
        {
          status: 500,
        },
      );
    }

    const {
      data: companyTask,
      error: companyTaskCreateError,
    } = await supabase
      .from("tasks")
      .insert({
        lead_id: leadId,
        task_type:
          "complete_consultation",
        task_type_id:
          taskType?.id ?? null,
        title: taskTitle,
        description:
          taskDescription,
        category:
          taskCategory,
        status: "open",
        priority:
          taskPriority,
        due_at:
          appointmentIso,
        assigned_to_id:
          assignedToId,
        assigned_at:
          assignedToId
            ? now
            : null,
        source_type:
          "confirm_consultation_workflow",
        metadata: {
          ...taskMetadata,
          legacy_lead_task_id:
            legacyTask.id,
        },
      })
      .select("id")
      .single();

    if (companyTaskCreateError) {
      console.error(
        "Unable to create company consultation task:",
        companyTaskCreateError,
      );

      await supabase
        .from("lead_tasks")
        .delete()
        .eq(
          "id",
          legacyTask.id,
        );

      return Response.json(
        {
          error:
            companyTaskCreateError.message,
        },
        {
          status: 500,
        },
      );
    }

    const emailSubject =
      "Your McKenzie Construction consultation is confirmed";

    const emailBody = `Hi ${lead.name ?? "there"},

Your consultation with McKenzie Construction is confirmed for ${formattedAppointment}.

Project: ${
      lead.project_type ??
      "Construction consultation"
    }
Property: ${
      lead.property_address ??
      "Address to be confirmed"
    }

We will review the project with you, discuss the scope of work, and gather the information needed to prepare your estimate.

Please reply to this email or call us if anything changes before the appointment.

Thank you,

${companyEmailSignature(settingsResult.data.company_name)}`;

    const {
      data: emailDraft,
      error: draftCreateError,
    } = await supabase
      .from("email_drafts")
      .insert({
        lead_id: leadId,
        template_key:
          "consultation_confirmation",
        to_email: lead.email,
        subject: emailSubject,
        body: emailBody,
        status: "draft",
        metadata: {
          created_by:
            "confirm_consultation_workflow",
          appointment_at:
            appointmentIso,
          changed_by_auth_user_id: user.id,
        },
      })
      .select("id")
      .single();

    if (draftCreateError) {
      console.error(
        "Unable to create confirmation email draft:",
        draftCreateError,
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
          "consultation_confirmed",
        channel:
          "consultation",
        direction:
          "internal",
        summary:
          "Consultation confirmed",
        details:
          formattedAppointment,
        metadata: {
          previous_lead_status:
            lead.lead_status,
          previous_consultation_status:
            lead.consultation_status,
          appointment_at:
            appointmentIso,
        },
      },
      {
        lead_id: leadId,
        activity_type:
          "task_created",
        channel: "task",
        direction:
          "internal",
        summary:
          "Complete consultation task created",
        details:
          formattedAppointment,
        metadata: {
          task_type:
            "complete_consultation",
          task_type_id:
            taskType?.id ?? null,
          due_at:
            appointmentIso,
          assigned_to_id:
            assignedToId,
          assignment_strategy:
            assignmentStrategy,
          legacy_task_id:
            legacyTask.id,
          company_task_id:
            companyTask.id,
        },
      },
    ];

    if (emailDraft) {
      activityRecords.push({
        lead_id: leadId,
        activity_type:
          "email_draft_created",
        channel: "email",
        direction:
          "outbound",
        summary:
          "Consultation confirmation email draft created",
        details:
          emailSubject,
        metadata: {
          email_draft_id:
            emailDraft.id,
          template_key:
            "consultation_confirmation",
        },
      });
    }

    const {
      error: activityError,
    } = await supabase
      .from("lead_activities")
      .insert(
        activityRecords,
      );

    if (activityError) {
      console.error(
        "Unable to log consultation activities:",
        activityError,
      );
    }

    return Response.json({
      success: true,
      appointmentAt:
        appointmentIso,
      consultationStatus: "confirmed",
      assignedToId,
      emailDraftCreated:
        Boolean(emailDraft),
      legacyTaskCreated: true,
      companyTaskCreated: true,
    });
  } catch (error) {
    console.error(
      "Confirm consultation workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to confirm the consultation.",
      },
      {
        status: 500,
      },
    );
  }
}
