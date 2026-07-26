import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
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

    const supabase = createAdminServerClient();

    const { data: lead, error: leadReadError } =
      await supabase
        .from("leads")
        .select(
          `
            id,
            name,
            project_type,
            property_address,
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

    const completedAt = new Date();
    const completedAtIso = completedAt.toISOString();

    const estimateDueAt = addBusinessDays(
      completedAt,
      2,
    );

    const estimateDueAtIso =
      estimateDueAt.toISOString();

    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({
        lead_status: "estimate_in_progress",
        consultation_status: "completed",
        follow_up_at: estimateDueAtIso,
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

    const { error: completeConsultationTaskError } =
      await supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          completed_at: completedAtIso,
          completion_note:
            "The site consultation was completed.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "complete_consultation")
        .in("status", ["open", "in_progress"]);

    if (completeConsultationTaskError) {
      console.error(
        "Unable to complete consultation task:",
        completeConsultationTaskError,
      );
    }

    const { error: cancelExistingEstimateTaskError } =
      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: completedAtIso,
          completion_note:
            "Replaced by a newly created estimate task.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "prepare_estimate")
        .in("status", ["open", "in_progress"]);

    if (cancelExistingEstimateTaskError) {
      console.error(
        "Unable to cancel older estimate task:",
        cancelExistingEstimateTaskError,
      );
    }

    const { data: estimateTask, error: taskCreateError } =
      await supabase
        .from("lead_tasks")
        .insert({
          lead_id: leadId,
          task_type: "prepare_estimate",
          title: `Prepare estimate: ${
            lead.name ?? "Customer"
          }`,
          description:
            "Prepare the project estimate and mark it sent when it has been delivered to the customer.",
          status: "open",
          priority: "high",
          due_at: estimateDueAtIso,
          metadata: {
            created_by:
              "complete_consultation_workflow",
            consultation_completed_at:
              completedAtIso,
            estimate_due_at: estimateDueAtIso,
            customer_name: lead.name,
            project_type: lead.project_type,
            property_address:
              lead.property_address,
          },
        })
        .select("id")
        .single();

    if (taskCreateError) {
      console.error(
        "Unable to create estimate task:",
        taskCreateError,
      );
    }

    const activityRecords = [
      {
        lead_id: leadId,
        activity_type: "consultation_completed",
        channel: "consultation",
        direction: "internal",
        summary: "Site consultation completed",
        details: formatDateAndTime(completedAt),
        metadata: {
          previous_lead_status:
            lead.lead_status,
          previous_consultation_status:
            lead.consultation_status,
          completed_at: completedAtIso,
        },
      },
      {
        lead_id: leadId,
        activity_type: "estimate_started",
        channel: "estimate",
        direction: "internal",
        summary: "Estimate preparation started",
        details: `Estimate due ${formatDateAndTime(
          estimateDueAt,
        )}`,
        metadata: {
          estimate_due_at: estimateDueAtIso,
          estimate_task_id:
            estimateTask?.id ?? null,
          turnaround_business_days: 2,
        },
      },
    ];

    const { error: activityError } = await supabase
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
      completedAt: completedAtIso,
      estimateDueAt: estimateDueAtIso,
      estimateTaskCreated: Boolean(estimateTask),
    });
  } catch (error) {
    console.error(
      "Complete consultation workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to complete the consultation workflow.",
      },
      {
        status: 500,
      },
    );
  }
}