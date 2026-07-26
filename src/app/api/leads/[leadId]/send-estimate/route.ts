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

function setFollowUpTime(date: Date) {
  const result = new Date(date);

  result.setHours(10, 0, 0, 0);

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
            phone,
            email,
            project_type,
            property_address,
            preferred_contact_method,
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

    const sentAt = new Date();
    const sentAtIso = sentAt.toISOString();

    const followUpDate = setFollowUpTime(
      addBusinessDays(sentAt, 2),
    );

    const followUpAtIso = followUpDate.toISOString();

    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({
        lead_status: "proposal_sent",
        follow_up_at: followUpAtIso,
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

    const { error: completeEstimateTaskError } =
      await supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          completed_at: sentAtIso,
          completion_note:
            "The estimate was sent to the customer.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "prepare_estimate")
        .in("status", ["open", "in_progress"]);

    if (completeEstimateTaskError) {
      console.error(
        "Unable to complete estimate task:",
        completeEstimateTaskError,
      );
    }

    const { error: cancelExistingFollowUpError } =
      await supabase
        .from("lead_tasks")
        .update({
          status: "canceled",
          canceled_at: sentAtIso,
          completion_note:
            "Replaced by a newly scheduled phone follow-up.",
        })
        .eq("lead_id", leadId)
        .eq("task_type", "first_phone_follow_up")
        .in("status", ["open", "in_progress"]);

    if (cancelExistingFollowUpError) {
      console.error(
        "Unable to cancel older phone follow-up task:",
        cancelExistingFollowUpError,
      );
    }

    const {
      data: followUpTask,
      error: followUpTaskError,
    } = await supabase
      .from("lead_tasks")
      .insert({
        lead_id: leadId,
        task_type: "first_phone_follow_up",
        title: `Call about estimate: ${
          lead.name ?? "Customer"
        }`,
        description:
          "Call the customer to follow up on the estimate. Record the call outcome when complete.",
        status: "open",
        priority: "high",
        due_at: followUpAtIso,
        metadata: {
          created_by: "send_estimate_workflow",
          estimate_sent_at: sentAtIso,
          customer_name: lead.name,
          phone: lead.phone,
          email: lead.email,
          project_type: lead.project_type,
          property_address: lead.property_address,
          preferred_contact_method:
            lead.preferred_contact_method,
          follow_up_number: 1,
        },
      })
      .select("id")
      .single();

    if (followUpTaskError) {
      console.error(
        "Unable to create phone follow-up task:",
        followUpTaskError,
      );
    }

    const activityRecords = [
      {
        lead_id: leadId,
        activity_type: "estimate_sent",
        channel: "estimate",
        direction: "outbound",
        summary: "Estimate sent to customer",
        details: formatDateAndTime(sentAt),
        metadata: {
          previous_lead_status: lead.lead_status,
          new_lead_status: "proposal_sent",
          estimate_sent_at: sentAtIso,
        },
      },
      {
        lead_id: leadId,
        activity_type: "phone_follow_up_scheduled",
        channel: "task",
        direction: "internal",
        summary: "First phone follow-up scheduled",
        details: `Call due ${formatDateAndTime(
          followUpDate,
        )}`,
        metadata: {
          task_type: "first_phone_follow_up",
          task_id: followUpTask?.id ?? null,
          due_at: followUpAtIso,
          business_days_after_estimate: 2,
        },
      },
    ];

    const { error: activityError } = await supabase
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
      followUpTaskCreated: Boolean(followUpTask),
    });
  } catch (error) {
    console.error(
      "Send estimate workflow error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to complete the estimate-sent workflow.",
      },
      {
        status: 500,
      },
    );
  }
}