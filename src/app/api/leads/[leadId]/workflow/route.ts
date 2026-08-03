import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { isConsultationDateTimeAllowed } from "@/lib/consultation-hours";
import { companyEmailSignature } from "@/lib/crm/company-signature";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type WorkflowAction =
  | "reschedule_consultation"
  | "cancel_consultation"
  | "revisions_requested"
  | "revised_estimate_sent"
  | "customer_reviewing"
  | "schedule_follow_up"
  | "start_call"
  | "won"
  | "lost";

type RequestBody = {
  action?: unknown;
  appointmentAt?: unknown;
  followUpAt?: unknown;
  notes?: unknown;
  lostReason?: unknown;
};

type LeadRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  project_type: string | null;
  preferred_contact_method: string | null;
  lead_status: string | null;
  consultation_status: string | null;
  follow_up_at: string | null;
  responsible_person_id: string | null;
};

type WorkflowTaskInput = {
  taskType: string;
  title: string;
  description: string;
  priority: string;
  dueAt: string | null;
  metadata?: Record<string, unknown>;
};

const validActions: WorkflowAction[] = [
  "reschedule_consultation",
  "cancel_consultation",
  "revisions_requested",
  "revised_estimate_sent",
  "customer_reviewing",
  "schedule_follow_up",
  "start_call",
  "won",
  "lost",
];

function isWorkflowAction(
  value: string,
): value is WorkflowAction {
  return validActions.includes(
    value as WorkflowAction,
  );
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
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

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded += 1;
    }
  }

  return result;
}

function setTime(
  date: Date,
  hours: number,
  minutes = 0,
) {
  const result = new Date(date);

  result.setHours(hours, minutes, 0, 0);

  return result;
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

    const action = cleanText(body.action);

    if (!isWorkflowAction(action)) {
      return Response.json(
        {
          error:
            "Choose a valid workflow action.",
        },
        {
          status: 400,
        },
      );
    }

    const notes = cleanText(body.notes);
    const lostReason = cleanText(
      body.lostReason,
    );

    const supabase =
      createAdminServerClient();

    const {
      data: leadData,
      error: leadReadError,
    } = await supabase
      .from("leads")
      .select(
        `
          id,
          name,
          phone,
          email,
          property_address,
          project_type,
          preferred_contact_method,
          lead_status,
          consultation_status,
          follow_up_at,
          responsible_person_id
        `,
      )
      .eq("id", leadId)
      .single();

    if (leadReadError || !leadData) {
      return Response.json(
        {
          error:
            leadReadError?.message ??
            "The lead could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    const lead = leadData as LeadRecord;

    const now = new Date();
    const nowIso = now.toISOString();

    async function createWorkflowTask(
      input: WorkflowTaskInput,
    ) {
      const taskMetadata = {
        ...(input.metadata ?? {}),
        source: "lead_workflow",
        lead_id: leadId,
        customer_name: lead.name,
        project_type: lead.project_type,
        property_address:
          lead.property_address,
      };

      const {
        data: legacyTask,
        error: legacyTaskError,
      } = await supabase
        .from("lead_tasks")
        .insert({
          lead_id: leadId,
          task_type: input.taskType,
          title: input.title,
          description: input.description,
          status: "open",
          priority: input.priority,
          due_at: input.dueAt,
          assigned_to_id:
            lead.responsible_person_id,
          assigned_at:
            lead.responsible_person_id
              ? nowIso
              : null,
          metadata: taskMetadata,
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
          task_type: input.taskType,
          title: input.title,
          description: input.description,
          category: "sales",
          status: "open",
          priority: input.priority,
          due_at: input.dueAt,
          assigned_to_id:
            lead.responsible_person_id,
          assigned_at:
            lead.responsible_person_id
              ? nowIso
              : null,
          source_type: "lead_workflow",
          metadata: {
            ...taskMetadata,
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

    async function cancelWorkflowTasks(
      taskTypes: string[],
      completionNote: string,
    ) {
      const {
        error: legacyCancelError,
      } = await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note: completionNote,
        })
        .eq("lead_id", leadId)
        .in("task_type", taskTypes)
        .in("status", [
          "open",
          "in_progress",
        ]);

      if (legacyCancelError) {
        console.error(
          "Unable to cancel lead tasks:",
          legacyCancelError,
        );
      }

      const {
        error: companyCancelError,
      } = await supabase
        .from("tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note: completionNote,
        })
        .eq("lead_id", leadId)
        .in("task_type", taskTypes)
        .in("status", [
          "open",
          "in_progress",
        ]);

      if (companyCancelError) {
        console.error(
          "Unable to cancel company tasks:",
          companyCancelError,
        );
      }
    }

    async function completeWorkflowTasks(
      taskTypes: string[],
      completionNote: string,
    ) {
      const {
        error: legacyCompleteError,
      } = await supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          completed_at: nowIso,
          completion_note: completionNote,
        })
        .eq("lead_id", leadId)
        .in("task_type", taskTypes)
        .in("status", [
          "open",
          "in_progress",
        ]);

      if (legacyCompleteError) {
        console.error(
          "Unable to complete lead tasks:",
          legacyCompleteError,
        );
      }

      const {
        error: companyCompleteError,
      } = await supabase
        .from("tasks")
        .update({
          status: "completed",
          completed_at: nowIso,
          completion_note: completionNote,
        })
        .eq("lead_id", leadId)
        .in("task_type", taskTypes)
        .in("status", [
          "open",
          "in_progress",
        ]);

      if (companyCompleteError) {
        console.error(
          "Unable to complete company tasks:",
          companyCompleteError,
        );
      }
    }

    async function cancelAllOpenWorkflowTasks(
      completionNote: string,
    ) {
      const {
        error: legacyCancelError,
      } = await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note: completionNote,
        })
        .eq("lead_id", leadId)
        .in("status", [
          "open",
          "in_progress",
        ]);

      if (legacyCancelError) {
        console.error(
          "Unable to cancel all lead tasks:",
          legacyCancelError,
        );
      }

      const {
        error: companyCancelError,
      } = await supabase
        .from("tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note: completionNote,
        })
        .eq("lead_id", leadId)
        .in("status", [
          "open",
          "in_progress",
        ]);

      if (companyCancelError) {
        console.error(
          "Unable to cancel all company tasks:",
          companyCancelError,
        );
      }
    }

    if (action === "start_call") {
      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert({
            lead_id: leadId,
            activity_type:
              "phone_call_started",
            channel: "call",
            direction: "outbound",
            summary:
              "Outbound call started",
            details: notes || null,
            occurred_at: nowIso,
            metadata: {
              phone: lead.phone,
              customer_name: lead.name,
              started_from: "crm",
            },
          });

      if (activityError) {
        return Response.json(
          {
            error: activityError.message,
          },
          {
            status: 500,
          },
        );
      }

      return Response.json({
        success: true,
        action,
        phone: lead.phone,
        occurredAt: nowIso,
      });
    }

    if (
      action ===
      "reschedule_consultation"
    ) {
      const appointmentAt = cleanText(
        body.appointmentAt,
      );

      const appointmentDate = new Date(
        appointmentAt,
      );

      const { data: consultationSettings, error: consultationSettingsError } = await supabase
        .from("company_settings")
        .select("company_name, consultation_start_time, consultation_end_time")
        .limit(1)
        .maybeSingle();

      if (consultationSettingsError || !consultationSettings) {
        return Response.json({ error: "Company consultation hours could not be loaded." }, { status: 500 });
      }

      if (!isConsultationDateTimeAllowed(appointmentAt, {
        start: consultationSettings.consultation_start_time ?? "08:00",
        end: consultationSettings.consultation_end_time ?? "17:00",
      })) {
        return Response.json({ error: "Choose a consultation time in 30-minute increments within company consultation hours." }, { status: 400 });
      }

      if (
        !appointmentAt ||
        Number.isNaN(
          appointmentDate.getTime(),
        )
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

      const appointmentIso =
        appointmentDate.toISOString();

      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            lead_status:
              "consultation_scheduled",
            consultation_status:
              "reschedule_requested",
            follow_up_at: appointmentIso,
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

      await cancelWorkflowTasks(
        ["complete_consultation"],
        "Replaced by the rescheduled consultation.",
      );

      const newTask =
        await createWorkflowTask({
          taskType:
            "complete_consultation",
          title: `Complete consultation: ${
            lead.name ?? "Customer"
          }`,
          description:
            "Complete the rescheduled site consultation, record notes, and mark the visit complete.",
          priority: "high",
          dueAt: appointmentIso,
          metadata: {
            created_by:
              "reschedule_consultation_workflow",
            appointment_at:
              appointmentIso,
          },
        });

      let emailDraftCreated = false;

      if (lead.email) {
        const formattedAppointment =
          formatDateAndTime(
            appointmentDate,
          );

        const { error: draftError } =
          await supabase
            .from("email_drafts")
            .insert({
              lead_id: leadId,
              template_key:
                "consultation_rescheduled",
              to_email: lead.email,
              subject:
                "Your McKenzie Construction consultation has been rescheduled",
              body: `Hi ${lead.name ?? "there"},

Your consultation with McKenzie Construction has been rescheduled for ${formattedAppointment}.

Project: ${
                lead.project_type ??
                "Construction consultation"
              }
Property: ${
                lead.property_address ??
                "Address to be confirmed"
              }

Please reply to this email or call us if this updated time no longer works.

Thank you,

${companyEmailSignature(consultationSettings.company_name)}`,
              status: "draft",
              metadata: {
                created_by:
                  "reschedule_consultation_workflow",
                appointment_at:
                  appointmentIso,
              },
            });

        if (draftError) {
          console.error(
            "Unable to create reschedule email draft:",
            draftError,
          );
        } else {
          emailDraftCreated = true;
        }
      }

      const activityRows: Array<{
        lead_id: string;
        activity_type: string;
        channel: string;
        direction: string;
        summary: string;
        details: string | null;
        metadata: Record<string, unknown>;
      }> = [
        {
          lead_id: leadId,
          activity_type:
            "consultation_rescheduled",
          channel: "consultation",
          direction: "internal",
          summary:
            "Consultation rescheduled",
          details:
            formatDateAndTime(
              appointmentDate,
            ),
          metadata: {
            previous_follow_up_at:
              lead.follow_up_at,
            appointment_at:
              appointmentIso,
            legacy_task_id:
              newTask.legacyTaskId,
            company_task_id:
              newTask.companyTaskId,
            notes: notes || null,
          },
        },
      ];

      if (emailDraftCreated) {
        activityRows.push({
          lead_id: leadId,
          activity_type:
            "email_draft_created",
          channel: "email",
          direction: "outbound",
          summary:
            "Consultation reschedule email draft created",
          details:
            "Draft requires review before sending.",
          metadata: {
            template_key:
              "consultation_rescheduled",
          },
        });
      }

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert(activityRows);

      if (activityError) {
        console.error(
          "Unable to record consultation reschedule activities:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        appointmentAt: appointmentIso,
        emailDraftCreated,
      });
    }

    if (
      action === "cancel_consultation"
    ) {
      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            consultation_status:
              "canceled",
            lead_status: "contacted",
            follow_up_at: null,
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

      await cancelWorkflowTasks(
        ["complete_consultation"],
        notes || "Consultation canceled.",
      );

      let emailDraftCreated = false;

      if (lead.email) {
        const { data: consultationSettings, error: consultationSettingsError } = await supabase
          .from("company_settings")
          .select("company_name")
          .limit(1)
          .maybeSingle();

        if (consultationSettingsError || !consultationSettings) {
          return Response.json({ error: "Company settings could not be loaded." }, { status: 500 });
        }

        const { error: draftError } =
          await supabase
            .from("email_drafts")
            .insert({
              lead_id: leadId,
              template_key:
                "consultation_canceled",
              to_email: lead.email,
              subject:
                "McKenzie Construction consultation update",
              body: `Hi ${lead.name ?? "there"},

Your scheduled consultation with McKenzie Construction has been canceled.

${
  notes
    ? `Reason or additional information: ${notes}\n\n`
    : ""
}Please reply to this email or call 865-263-3811 if you would like to reschedule.

Thank you,

${companyEmailSignature(consultationSettings.company_name)}`,
              status: "draft",
              metadata: {
                created_by:
                  "cancel_consultation_workflow",
                canceled_at: nowIso,
              },
            });

        if (!draftError) {
          emailDraftCreated = true;
        } else {
          console.error(
            "Unable to create cancellation email draft:",
            draftError,
          );
        }
      }

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert({
            lead_id: leadId,
            activity_type:
              "consultation_canceled",
            channel: "consultation",
            direction: "internal",
            summary:
              "Consultation canceled",
            details: notes || null,
            metadata: {
              previous_consultation_status:
                lead.consultation_status,
              previous_lead_status:
                lead.lead_status,
              email_draft_created:
                emailDraftCreated,
            },
          });

      if (activityError) {
        console.error(
          "Unable to record consultation cancellation:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        emailDraftCreated,
      });
    }

    if (
      action === "revisions_requested"
    ) {
      const estimateDueDate =
        addBusinessDays(now, 2);

      const estimateDueAt =
        estimateDueDate.toISOString();

      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            lead_status:
              "estimate_in_progress",
            follow_up_at: estimateDueAt,
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

      await completeWorkflowTasks(
        [
          "first_phone_follow_up",
          "phone_follow_up",
          "callback_customer",
        ],
        "Customer requested estimate revisions.",
      );

      await cancelWorkflowTasks(
        ["prepare_estimate"],
        "Replaced by a new revision task.",
      );

      const revisionTask =
        await createWorkflowTask({
          taskType: "prepare_estimate",
          title: `Revise estimate: ${
            lead.name ?? "Customer"
          }`,
          description:
            "Complete the requested estimate revisions and mark the revised estimate sent.",
          priority: "high",
          dueAt: estimateDueAt,
          metadata: {
            created_by:
              "revisions_requested_workflow",
            requested_at: nowIso,
            notes: notes || null,
            revision_number: 1,
          },
        });

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert({
            lead_id: leadId,
            activity_type:
              "estimate_revisions_requested",
            channel: "estimate",
            direction: "inbound",
            summary:
              "Customer requested estimate revisions",
            details: notes || null,
            metadata: {
              estimate_due_at:
                estimateDueAt,
              legacy_task_id:
                revisionTask.legacyTaskId,
              company_task_id:
                revisionTask.companyTaskId,
            },
          });

      if (activityError) {
        console.error(
          "Unable to record estimate revision request:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        estimateDueAt,
      });
    }

    if (
      action === "revised_estimate_sent"
    ) {
      const followUpDate = setTime(
        addBusinessDays(now, 2),
        10,
      );

      const followUpAt =
        followUpDate.toISOString();

      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            lead_status: "proposal_sent",
            follow_up_at: followUpAt,
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

      await completeWorkflowTasks(
        ["prepare_estimate"],
        "The revised estimate was sent.",
      );

      const followUpTask =
        await createWorkflowTask({
          taskType: "phone_follow_up",
          title: `Follow up on revised estimate: ${
            lead.name ?? "Customer"
          }`,
          description:
            "Call the customer to follow up on the revised estimate.",
          priority: "high",
          dueAt: followUpAt,
          metadata: {
            created_by:
              "revised_estimate_sent_workflow",
            revised_estimate_sent_at:
              nowIso,
            phone: lead.phone,
          },
        });

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert([
            {
              lead_id: leadId,
              activity_type:
                "revised_estimate_sent",
              channel: "estimate",
              direction: "outbound",
              summary:
                "Revised estimate sent to customer",
              details: notes || null,
              metadata: {
                sent_at: nowIso,
              },
            },
            {
              lead_id: leadId,
              activity_type:
                "phone_follow_up_scheduled",
              channel: "task",
              direction: "internal",
              summary:
                "Follow-up for revised estimate scheduled",
              details:
                formatDateAndTime(
                  followUpDate,
                ),
              metadata: {
                due_at: followUpAt,
                legacy_task_id:
                  followUpTask.legacyTaskId,
                company_task_id:
                  followUpTask.companyTaskId,
              },
            },
          ]);

      if (activityError) {
        console.error(
          "Unable to record revised estimate activities:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        followUpAt,
      });
    }

    if (
      action === "customer_reviewing" ||
      action === "schedule_follow_up"
    ) {
      let followUpDate: Date;

      const requestedFollowUpAt =
        cleanText(body.followUpAt);

      if (requestedFollowUpAt) {
        followUpDate = new Date(
          requestedFollowUpAt,
        );

        if (
          Number.isNaN(
            followUpDate.getTime(),
          )
        ) {
          return Response.json(
            {
              error:
                "Choose a valid follow-up date and time.",
            },
            {
              status: 400,
            },
          );
        }
      } else if (
        action === "customer_reviewing"
      ) {
        followUpDate = setTime(
          addBusinessDays(now, 3),
          10,
        );
      } else {
        return Response.json(
          {
            error:
              "Choose a follow-up date and time.",
          },
          {
            status: 400,
          },
        );
      }

      const followUpAt =
        followUpDate.toISOString();

      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            lead_status:
              "customer_reviewing",
            follow_up_at: followUpAt,
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

      await cancelWorkflowTasks(
        [
          "first_phone_follow_up",
          "phone_follow_up",
          "callback_customer",
        ],
        "Replaced by a newly scheduled follow-up.",
      );

      const followUpTask =
        await createWorkflowTask({
          taskType: "phone_follow_up",
          title: `Follow up with ${
            lead.name ?? "Customer"
          }`,
          description:
            notes ||
            "Call the customer for a decision or project update.",
          priority: "high",
          dueAt: followUpAt,
          metadata: {
            created_by:
              action ===
              "customer_reviewing"
                ? "customer_reviewing_workflow"
                : "schedule_follow_up_workflow",
            phone: lead.phone,
            notes: notes || null,
          },
        });

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert({
            lead_id: leadId,
            activity_type:
              action ===
              "customer_reviewing"
                ? "customer_reviewing"
                : "follow_up_scheduled",
            channel: "task",
            direction: "internal",
            summary:
              action ===
              "customer_reviewing"
                ? "Customer is reviewing the proposal"
                : "Next follow-up scheduled",
            details:
              formatDateAndTime(
                followUpDate,
              ),
            metadata: {
              follow_up_at: followUpAt,
              legacy_task_id:
                followUpTask.legacyTaskId,
              company_task_id:
                followUpTask.companyTaskId,
              notes: notes || null,
            },
          });

      if (activityError) {
        console.error(
          "Unable to record follow-up activity:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        followUpAt,
      });
    }

    if (action === "won") {
      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            lead_status: "won",
            follow_up_at: null,
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

      await cancelAllOpenWorkflowTasks(
        "Lead was marked won.",
      );

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert({
            lead_id: leadId,
            activity_type: "lead_won",
            channel: "status",
            direction: "internal",
            summary: "Job awarded",
            details: notes || null,
            metadata: {
              previous_status:
                lead.lead_status,
              won_at: nowIso,
              ready_to_convert_to_project:
                true,
            },
          });

      if (activityError) {
        console.error(
          "Unable to record won activity:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        wonAt: nowIso,
        canConvertToProject: true,
      });
    }

    if (action === "lost") {
      if (!lostReason) {
        return Response.json(
          {
            error:
              "Choose or enter a reason the lead was lost.",
          },
          {
            status: 400,
          },
        );
      }

      const { error: leadUpdateError } =
        await supabase
          .from("leads")
          .update({
            lead_status: "lost",
            follow_up_at: null,
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

      await cancelAllOpenWorkflowTasks(
        `Lead lost: ${lostReason}`,
      );

      const { error: activityError } =
        await supabase
          .from("lead_activities")
          .insert({
            lead_id: leadId,
            activity_type: "lead_lost",
            channel: "status",
            direction: "internal",
            summary: "Lead marked lost",
            details:
              notes || lostReason,
            metadata: {
              previous_status:
                lead.lead_status,
              lost_reason: lostReason,
              lost_at: nowIso,
            },
          });

      if (activityError) {
        console.error(
          "Unable to record lost activity:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        lostAt: nowIso,
        lostReason,
      });
    }

    return Response.json(
      {
        error:
          "The requested workflow action was not completed.",
      },
      {
        status: 400,
      },
    );
  } catch (error) {
    console.error(
      "Lead workflow action error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the workflow action.",
      },
      {
        status: 500,
      },
    );
  }
}
