import { createAdminServerClient } from "@/lib/supabase/admin-server";

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
  return validActions.includes(value as WorkflowAction);
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
  try {
    const { leadId: rawLeadId } = await context.params;
    const leadId = rawLeadId.trim();

    if (!leadId) {
      return Response.json(
        {
          error: "A valid lead ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const body = (await request.json()) as RequestBody;

    const action = cleanText(body.action);

    if (!isWorkflowAction(action)) {
      return Response.json(
        {
          error: "Choose a valid workflow action.",
        },
        {
          status: 400,
        },
      );
    }

    const notes = cleanText(body.notes);
    const lostReason = cleanText(body.lostReason);

    const supabase = createAdminServerClient();

    const { data: lead, error: leadReadError } =
      await supabase
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
            follow_up_at
          `,
        )
        .eq("id", leadId)
        .single();

    if (leadReadError || !lead) {
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

    const now = new Date();
    const nowIso = now.toISOString();

    if (action === "start_call") {
      const { error: activityError } = await supabase
        .from("lead_activities")
        .insert({
          lead_id: leadId,
          activity_type: "phone_call_started",
          channel: "call",
          direction: "outbound",
          summary: "Outbound call started",
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

    if (action === "reschedule_consultation") {
      const appointmentAt = cleanText(
        body.appointmentAt,
      );

      const appointmentDate = new Date(appointmentAt);

      if (
        !appointmentAt ||
        Number.isNaN(appointmentDate.getTime())
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

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          lead_status: "consultation_scheduled",
          consultation_status: "confirmed",
          follow_up_at: appointmentIso,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note:
            "Replaced by the rescheduled consultation.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "complete_consultation")
        .in("status", ["open", "in_progress"]);

      const { data: newTask, error: taskError } =
        await supabase
          .from("lead_tasks")
          .insert({
            lead_id: leadId,
            task_type: "complete_consultation",
            title: `Complete consultation: ${
              lead.name ?? "Customer"
            }`,
            description:
              "Complete the rescheduled site consultation, record notes, and mark the visit complete.",
            status: "open",
            priority: "high",
            due_at: appointmentIso,
            metadata: {
              created_by:
                "reschedule_consultation_workflow",
              appointment_at: appointmentIso,
              customer_name: lead.name,
              project_type: lead.project_type,
              property_address:
                lead.property_address,
            },
          })
          .select("id")
          .single();

      if (taskError) {
        console.error(
          "Unable to create rescheduled consultation task:",
          taskError,
        );
      }

      let emailDraftCreated = false;

      if (lead.email) {
        const formattedAppointment =
          formatDateAndTime(appointmentDate);

        const { error: draftError } = await supabase
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

Michael McKenzie
McKenzie Construction
865-263-3811`,
            status: "draft",
            metadata: {
              created_by:
                "reschedule_consultation_workflow",
              appointment_at: appointmentIso,
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

      await supabase
        .from("lead_activities")
        .insert([
          {
            lead_id: leadId,
            activity_type:
              "consultation_rescheduled",
            channel: "consultation",
            direction: "internal",
            summary: "Consultation rescheduled",
            details:
              formatDateAndTime(appointmentDate),
            metadata: {
              previous_follow_up_at:
                lead.follow_up_at,
              appointment_at: appointmentIso,
              task_id: newTask?.id ?? null,
              notes: notes || null,
            },
          },
          ...(emailDraftCreated
            ? [
                {
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
                },
              ]
            : []),
        ]);

      return Response.json({
        success: true,
        action,
        appointmentAt: appointmentIso,
        emailDraftCreated,
      });
    }

    if (action === "cancel_consultation") {
      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          consultation_status: "canceled",
          lead_status: "contacted",
          follow_up_at: null,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note:
            notes || "Consultation canceled.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "complete_consultation")
        .in("status", ["open", "in_progress"]);

      let emailDraftCreated = false;

      if (lead.email) {
        const { error: draftError } = await supabase
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

Michael McKenzie
McKenzie Construction
865-263-3811`,
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

      await supabase
        .from("lead_activities")
        .insert({
          lead_id: leadId,
          activity_type:
            "consultation_canceled",
          channel: "consultation",
          direction: "internal",
          summary: "Consultation canceled",
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

      return Response.json({
        success: true,
        action,
        emailDraftCreated,
      });
    }

    if (action === "revisions_requested") {
      const estimateDueDate = addBusinessDays(
        now,
        2,
      );

      const estimateDueAt =
        estimateDueDate.toISOString();

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          lead_status: "estimate_in_progress",
          follow_up_at: estimateDueAt,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          completed_at: nowIso,
          completion_note:
            "Customer requested estimate revisions.",
        })
        .eq("lead_id", leadId)
        .in("task_type", [
          "first_phone_follow_up",
          "phone_follow_up",
          "callback_customer",
        ])
        .in("status", ["open", "in_progress"]);

      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note:
            "Replaced by a new revision task.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "prepare_estimate")
        .in("status", ["open", "in_progress"]);

      const { data: revisionTask, error: taskError } =
        await supabase
          .from("lead_tasks")
          .insert({
            lead_id: leadId,
            task_type: "prepare_estimate",
            title: `Revise estimate: ${
              lead.name ?? "Customer"
            }`,
            description:
              "Complete the requested estimate revisions and mark the revised estimate sent.",
            status: "open",
            priority: "high",
            due_at: estimateDueAt,
            metadata: {
              created_by:
                "revisions_requested_workflow",
              requested_at: nowIso,
              notes: notes || null,
              revision_number: 1,
            },
          })
          .select("id")
          .single();

      if (taskError) {
        console.error(
          "Unable to create revision task:",
          taskError,
        );
      }

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
            estimate_due_at: estimateDueAt,
            task_id: revisionTask?.id ?? null,
          },
        });

      return Response.json({
        success: true,
        action,
        estimateDueAt,
      });
    }

    if (action === "revised_estimate_sent") {
      const followUpDate = setTime(
        addBusinessDays(now, 2),
        10,
      );

      const followUpAt =
        followUpDate.toISOString();

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          lead_status: "proposal_sent",
          follow_up_at: followUpAt,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          completed_at: nowIso,
          completion_note:
            "The revised estimate was sent.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "prepare_estimate")
        .in("status", ["open", "in_progress"]);

      const { data: followUpTask, error: taskError } =
        await supabase
          .from("lead_tasks")
          .insert({
            lead_id: leadId,
            task_type: "phone_follow_up",
            title: `Follow up on revised estimate: ${
              lead.name ?? "Customer"
            }`,
            description:
              "Call the customer to follow up on the revised estimate.",
            status: "open",
            priority: "high",
            due_at: followUpAt,
            metadata: {
              created_by:
                "revised_estimate_sent_workflow",
              revised_estimate_sent_at: nowIso,
              phone: lead.phone,
            },
          })
          .select("id")
          .single();

      if (taskError) {
        console.error(
          "Unable to create revised estimate follow-up:",
          taskError,
        );
      }

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
              formatDateAndTime(followUpDate),
            metadata: {
              due_at: followUpAt,
              task_id:
                followUpTask?.id ?? null,
            },
          },
        ]);

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

      const requestedFollowUpAt = cleanText(
        body.followUpAt,
      );

      if (requestedFollowUpAt) {
        followUpDate = new Date(
          requestedFollowUpAt,
        );

        if (
          Number.isNaN(followUpDate.getTime())
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

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          lead_status: "customer_reviewing",
          follow_up_at: followUpAt,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note:
            "Replaced by a newly scheduled follow-up.",
        })
        .eq("lead_id", leadId)
        .in("task_type", [
          "first_phone_follow_up",
          "phone_follow_up",
          "callback_customer",
        ])
        .in("status", ["open", "in_progress"]);

      const { data: followUpTask, error: taskError } =
        await supabase
          .from("lead_tasks")
          .insert({
            lead_id: leadId,
            task_type: "phone_follow_up",
            title: `Follow up with ${
              lead.name ?? "Customer"
            }`,
            description:
              notes ||
              "Call the customer for a decision or project update.",
            status: "open",
            priority: "high",
            due_at: followUpAt,
            metadata: {
              created_by:
                action === "customer_reviewing"
                  ? "customer_reviewing_workflow"
                  : "schedule_follow_up_workflow",
              phone: lead.phone,
              notes: notes || null,
            },
          })
          .select("id")
          .single();

      if (taskError) {
        console.error(
          "Unable to create follow-up task:",
          taskError,
        );
      }

      await supabase
        .from("lead_activities")
        .insert({
          lead_id: leadId,
          activity_type:
            action === "customer_reviewing"
              ? "customer_reviewing"
              : "follow_up_scheduled",
          channel: "task",
          direction: "internal",
          summary:
            action === "customer_reviewing"
              ? "Customer is reviewing the proposal"
              : "Next follow-up scheduled",
          details:
            formatDateAndTime(followUpDate),
          metadata: {
            follow_up_at: followUpAt,
            task_id: followUpTask?.id ?? null,
            notes: notes || null,
          },
        });

      return Response.json({
        success: true,
        action,
        followUpAt,
      });
    }

    if (action === "won") {
      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          lead_status: "won",
          follow_up_at: null,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note:
            "Lead was marked won.",
        })
        .eq("lead_id", leadId)
        .in("status", ["open", "in_progress"]);

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
            ready_to_convert_to_project: true,
          },
        });

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

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          lead_status: "lost",
          follow_up_at: null,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        return Response.json(
          {
            error: leadUpdateError.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: nowIso,
          completion_note:
            `Lead lost: ${lostReason}`,
        })
        .eq("lead_id", leadId)
        .in("status", ["open", "in_progress"]);

      await supabase
        .from("lead_activities")
        .insert({
          lead_id: leadId,
          activity_type: "lead_lost",
          channel: "status",
          direction: "internal",
          summary: "Lead marked lost",
          details: notes || lostReason,
          metadata: {
            previous_status:
              lead.lead_status,
            lost_reason: lostReason,
            lost_at: nowIso,
          },
        });

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
          "Unable to complete the workflow action.",
      },
      {
        status: 500,
      },
    );
  }
}