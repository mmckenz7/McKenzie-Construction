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

const allowedOutcomes: CallOutcome[] = [
  "spoke",
  "no_answer",
  "left_voicemail",
  "callback_requested",
];

function isCallOutcome(value: string): value is CallOutcome {
  return allowedOutcomes.includes(value as CallOutcome);
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

function getOutcomeLabel(outcome: CallOutcome) {
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

    const outcome =
      typeof body.outcome === "string"
        ? body.outcome.trim()
        : "";

    if (!isCallOutcome(outcome)) {
      return Response.json(
        {
          error: "Choose a valid call outcome.",
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

    if (outcome === "callback_requested") {
      callbackDate = new Date(callbackAt);

      if (
        !callbackAt ||
        Number.isNaN(callbackDate.getTime())
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
            lead_status,
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

    const occurredAt = new Date();
    const occurredAtIso = occurredAt.toISOString();
    const outcomeLabel = getOutcomeLabel(outcome);

    const { error: completeTaskError } = await supabase
      .from("lead_tasks")
      .update({
        status: "completed",
        completed_at: occurredAtIso,
        completion_note: notes
          ? `${outcomeLabel}. ${notes}`
          : outcomeLabel,
      })
      .eq("lead_id", leadId)
      .in("task_type", [
        "first_phone_follow_up",
        "phone_follow_up",
        "callback_customer",
      ])
      .in("status", ["open", "in_progress"]);

    if (completeTaskError) {
      console.error(
        "Unable to complete phone task:",
        completeTaskError,
      );
    }

    let emailDraftId: string | null = null;
    let emailDraftCreated = false;
    let callbackTaskCreated = false;
    let nextFollowUpAt: string | null = null;

    if (
      outcome === "no_answer" ||
      outcome === "left_voicemail"
    ) {
      if (!lead.email) {
        return Response.json(
          {
            error:
              "The call outcome was not saved because this customer has no email address for the follow-up draft.",
          },
          {
            status: 400,
          },
        );
      }

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

      const { data: emailDraft, error: draftError } =
        await supabase
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
              created_by: "call_outcome_workflow",
              call_outcome: outcome,
              call_attempted_at: occurredAtIso,
              next_phone_follow_up_after_send: true,
              next_phone_follow_up_business_days: 3,
            },
          })
          .select("id")
          .single();

      if (draftError) {
        console.error(
          "Unable to create follow-up email draft:",
          draftError,
        );
      } else if (emailDraft) {
        emailDraftId = String(emailDraft.id);
        emailDraftCreated = true;
      }

      const { error: reviewTaskError } = await supabase
        .from("lead_tasks")
        .insert({
          lead_id: leadId,
          task_type: "review_follow_up_email",
          title: `Review follow-up email: ${
            lead.name ?? "Customer"
          }`,
          description:
            "Review the prepared follow-up email, make any job-specific changes, and approve it for sending.",
          status: "open",
          priority: "high",
          due_at: occurredAtIso,
          metadata: {
            created_by: "call_outcome_workflow",
            email_draft_id: emailDraftId,
            call_outcome: outcome,
          },
        });

      if (reviewTaskError) {
        console.error(
          "Unable to create email-review task:",
          reviewTaskError,
        );
      }

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          follow_up_at: occurredAtIso,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        console.error(
          "Unable to update lead follow-up:",
          leadUpdateError,
        );
      }

      nextFollowUpAt = occurredAtIso;
    }

    if (
      outcome === "callback_requested" &&
      callbackDate
    ) {
      const callbackAtIso = callbackDate.toISOString();

      const { error: cancelCallbackError } =
        await supabase
          .from("lead_tasks")
          .update({
            status: "canceled",
            canceled_at: occurredAtIso,
            completion_note:
              "Replaced by a newly scheduled callback.",
          })
          .eq("lead_id", leadId)
          .eq("task_type", "callback_customer")
          .in("status", ["open", "in_progress"]);

      if (cancelCallbackError) {
        console.error(
          "Unable to cancel older callback task:",
          cancelCallbackError,
        );
      }

      const { data: callbackTask, error: callbackTaskError } =
        await supabase
          .from("lead_tasks")
          .insert({
            lead_id: leadId,
            task_type: "callback_customer",
            title: `Call back: ${lead.name ?? "Customer"}`,
            description:
              "Call the customer back at the requested date and time.",
            status: "open",
            priority: "high",
            due_at: callbackAtIso,
            metadata: {
              created_by: "call_outcome_workflow",
              customer_name: lead.name,
              phone: lead.phone,
              callback_requested_at: occurredAtIso,
            },
          })
          .select("id")
          .single();

      if (callbackTaskError) {
        console.error(
          "Unable to create callback task:",
          callbackTaskError,
        );
      } else {
        callbackTaskCreated = Boolean(callbackTask);
      }

      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          follow_up_at: callbackAtIso,
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        console.error(
          "Unable to update callback date:",
          leadUpdateError,
        );
      }

      nextFollowUpAt = callbackAtIso;
    }

    if (outcome === "spoke") {
      const { error: leadUpdateError } = await supabase
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
        activity_type: "phone_call_outcome",
        channel: "call",
        direction: "outbound",
        summary: outcomeLabel,
        details: notes || null,
        metadata: {
          outcome,
          phone: lead.phone,
          occurred_at: occurredAtIso,
          previous_follow_up_at: lead.follow_up_at,
        },
      },
    ];

    if (emailDraftCreated) {
      activityRecords.push({
        lead_id: leadId,
        activity_type: "email_draft_created",
        channel: "email",
        direction: "outbound",
        summary: "Estimate follow-up email draft created",
        details:
          "Draft requires review and approval before sending.",
        metadata: {
          email_draft_id: emailDraftId,
          call_outcome: outcome,
        },
      });
    }

    if (callbackDate) {
      activityRecords.push({
        lead_id: leadId,
        activity_type: "callback_scheduled",
        channel: "task",
        direction: "internal",
        summary: "Customer callback scheduled",
        details: formatDateAndTime(callbackDate),
        metadata: {
          callback_at: callbackDate.toISOString(),
        },
      });
    }

    const { error: activityError } = await supabase
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
      callbackTaskCreated,
      nextFollowUpAt,
    });
  } catch (error) {
    console.error("Call outcome workflow error:", error);

    return Response.json(
      {
        error:
          "Unable to complete the call outcome workflow.",
      },
      {
        status: 500,
      },
    );
  }
}