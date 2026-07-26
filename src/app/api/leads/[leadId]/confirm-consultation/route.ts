import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type RequestBody = {
  appointmentAt?: unknown;
};

function formatAppointmentForEmail(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
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

    const appointmentAt =
      typeof body.appointmentAt === "string"
        ? body.appointmentAt.trim()
        : "";

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

    const supabase = createAdminServerClient();

    const { data: lead, error: leadReadError } =
      await supabase
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
            consultation_status
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
      formatAppointmentForEmail(appointmentAt);

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

    const now = new Date().toISOString();
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

    const { error: completeTaskError } = await supabase
      .from("lead_tasks")
      .update({
        status: "completed",
        completed_at: now,
        completion_note:
          "Consultation confirmed with the customer.",
      })
      .eq("lead_id", leadId)
      .eq("task_type", "review_new_lead")
      .in("status", ["open", "in_progress"]);

    if (completeTaskError) {
      console.error(
        "Unable to complete review task:",
        completeTaskError,
      );
    }

    const { error: cancelExistingTaskError } =
      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: now,
          completion_note:
            "Replaced by a newly confirmed consultation.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "complete_consultation")
        .in("status", ["open", "in_progress"]);

    if (cancelExistingTaskError) {
      console.error(
        "Unable to cancel older consultation task:",
        cancelExistingTaskError,
      );
    }

    const { error: taskCreateError } = await supabase
      .from("lead_tasks")
      .insert({
        lead_id: leadId,
        task_type: "complete_consultation",
        title: `Complete consultation: ${
          lead.name ?? "Customer"
        }`,
        description:
          "Complete the site consultation, record notes, and mark the visit complete.",
        status: "open",
        priority: "high",
        due_at: appointmentIso,
        metadata: {
          created_by:
            "confirm_consultation_workflow",
          appointment_at: appointmentIso,
          customer_name: lead.name,
          project_type: lead.project_type,
          property_address: lead.property_address,
        },
      });

    if (taskCreateError) {
      console.error(
        "Unable to create consultation task:",
        taskCreateError,
      );
    }

    const emailSubject =
      "Your McKenzie Construction consultation is confirmed";

    const emailBody = `Hi ${lead.name ?? "there"},

Your consultation with McKenzie Construction is confirmed for ${formattedAppointment}.

Project: ${
      lead.project_type ?? "Construction consultation"
    }
Property: ${
      lead.property_address ?? "Address to be confirmed"
    }

We will review the project with you, discuss the scope of work, and gather the information needed to prepare your estimate.

Please reply to this email or call us if anything changes before the appointment.

Thank you,

Michael McKenzie
McKenzie Construction
865-263-3811`;

    const { data: emailDraft, error: draftCreateError } =
      await supabase
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
            appointment_at: appointmentIso,
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
      metadata: Record<string, unknown>;
    }> = [
      {
        lead_id: leadId,
        activity_type: "consultation_confirmed",
        channel: "consultation",
        direction: "internal",
        summary: "Consultation confirmed",
        details: formattedAppointment,
        metadata: {
          previous_lead_status:
            lead.lead_status,
          previous_consultation_status:
            lead.consultation_status,
          appointment_at: appointmentIso,
        },
      },
      {
        lead_id: leadId,
        activity_type: "task_created",
        channel: "task",
        direction: "internal",
        summary:
          "Complete consultation task created",
        details: formattedAppointment,
        metadata: {
          task_type: "complete_consultation",
          due_at: appointmentIso,
        },
      },
    ];

    if (emailDraft) {
      activityRecords.push({
        lead_id: leadId,
        activity_type: "email_draft_created",
        channel: "email",
        direction: "outbound",
        summary:
          "Consultation confirmation email draft created",
        details: emailSubject,
        metadata: {
          email_draft_id: emailDraft.id,
          template_key:
            "consultation_confirmation",
        },
      });
    }

    const { error: activityError } = await supabase
      .from("lead_activities")
      .insert(activityRecords);

    if (activityError) {
      console.error(
        "Unable to log consultation activities:",
        activityError,
      );
    }

    return Response.json({
      success: true,
      appointmentAt: appointmentIso,
      emailDraftCreated: Boolean(emailDraft),
    });
  } catch (error) {
    console.error(
      "Confirm consultation workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to confirm the consultation.",
      },
      {
        status: 500,
      },
    );
  }
}