import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

type DraftAction =
  | "save"
  | "approve"
  | "cancel"
  | "mark_sent";

type RequestBody = {
  action?: unknown;
  toEmail?: unknown;
  ccEmail?: unknown;
  subject?: unknown;
  body?: unknown;
};

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

function setFollowUpTime(date: Date) {
  const result = new Date(date);

  result.setHours(10, 0, 0, 0);

  return result;
}

function isDraftAction(
  value: string,
): value is DraftAction {
  return [
    "save",
    "approve",
    "cancel",
    "mark_sent",
  ].includes(value);
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { draftId: rawDraftId } =
      await context.params;

    const draftId = rawDraftId.trim();

    if (!draftId) {
      return Response.json(
        {
          error: "A valid draft ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase = createAdminServerClient();

    const { data: draft, error } = await supabase
      .from("email_drafts")
      .select(
        `
          id,
          lead_id,
          template_key,
          to_email,
          cc_email,
          subject,
          body,
          status,
          approved_at,
          sent_at,
          canceled_at,
          external_message_id,
          error_message,
          metadata,
          created_at,
          updated_at
        `,
      )
      .eq("id", draftId)
      .single();

    if (error || !draft) {
      return Response.json(
        {
          error:
            error?.message ??
            "The email draft could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      success: true,
      draft,
    });
  } catch (error) {
    console.error(
      "Email draft read error:",
      error,
    );

    return Response.json(
      {
        error: "Unable to load the email draft.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const { draftId: rawDraftId } =
      await context.params;

    const draftId = rawDraftId.trim();

    if (!draftId) {
      return Response.json(
        {
          error: "A valid draft ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const body = (await request.json()) as RequestBody;

    const action = cleanText(body.action);

    if (!isDraftAction(action)) {
      return Response.json(
        {
          error: "Choose a valid email draft action.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase = createAdminServerClient();

    const {
      data: existingDraft,
      error: draftReadError,
    } = await supabase
      .from("email_drafts")
      .select(
        `
          id,
          lead_id,
          template_key,
          to_email,
          cc_email,
          subject,
          body,
          status,
          metadata
        `,
      )
      .eq("id", draftId)
      .single();

    if (draftReadError || !existingDraft) {
      return Response.json(
        {
          error:
            draftReadError?.message ??
            "The email draft could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      existingDraft.status === "sent" &&
      action !== "mark_sent"
    ) {
      return Response.json(
        {
          error:
            "A sent email draft cannot be edited.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      existingDraft.status === "canceled" &&
      action !== "cancel"
    ) {
      return Response.json(
        {
          error:
            "A canceled email draft cannot be edited.",
        },
        {
          status: 400,
        },
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const toEmail =
      body.toEmail === undefined
        ? existingDraft.to_email
        : cleanText(body.toEmail);

    const ccEmail =
      body.ccEmail === undefined
        ? existingDraft.cc_email
        : cleanText(body.ccEmail) || null;

    const subject =
      body.subject === undefined
        ? existingDraft.subject
        : cleanText(body.subject);

    const emailBody =
      body.body === undefined
        ? existingDraft.body
        : cleanText(body.body);

    if (
      action === "save" ||
      action === "approve"
    ) {
      if (!toEmail) {
        return Response.json(
          {
            error:
              "The recipient email address is required.",
          },
          {
            status: 400,
          },
        );
      }

      if (!subject) {
        return Response.json(
          {
            error:
              "The email subject is required.",
          },
          {
            status: 400,
          },
        );
      }

      if (!emailBody) {
        return Response.json(
          {
            error:
              "The email body is required.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (action === "save") {
      const { data: updatedDraft, error } =
        await supabase
          .from("email_drafts")
          .update({
            to_email: toEmail,
            cc_email: ccEmail,
            subject,
            body: emailBody,
            status: "draft",
            approved_at: null,
            error_message: null,
          })
          .eq("id", draftId)
          .select("*")
          .single();

      if (error) {
        return Response.json(
          {
            error: error.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_activities")
        .insert({
          lead_id: String(
            existingDraft.lead_id,
          ),
          activity_type:
            "email_draft_updated",
          channel: "email",
          direction: "internal",
          summary: "Email draft updated",
          details: subject,
          metadata: {
            email_draft_id: draftId,
            template_key:
              existingDraft.template_key,
          },
        });

      return Response.json({
        success: true,
        action,
        draft: updatedDraft,
      });
    }

    if (action === "approve") {
      const { data: approvedDraft, error } =
        await supabase
          .from("email_drafts")
          .update({
            to_email: toEmail,
            cc_email: ccEmail,
            subject,
            body: emailBody,
            status: "approved",
            approved_at: nowIso,
            error_message: null,
          })
          .eq("id", draftId)
          .select("*")
          .single();

      if (error) {
        return Response.json(
          {
            error: error.message,
          },
          {
            status: 500,
          },
        );
      }

      await supabase
        .from("lead_activities")
        .insert({
          lead_id: String(
            existingDraft.lead_id,
          ),
          activity_type:
            "email_draft_approved",
          channel: "email",
          direction: "internal",
          summary: "Email draft approved",
          details: subject,
          metadata: {
            email_draft_id: draftId,
            template_key:
              existingDraft.template_key,
            approved_at: nowIso,
          },
        });

      return Response.json({
        success: true,
        action,
        draft: approvedDraft,
      });
    }

    if (action === "cancel") {
      const { data: canceledDraft, error } =
        await supabase
          .from("email_drafts")
          .update({
            status: "canceled",
            canceled_at: nowIso,
          })
          .eq("id", draftId)
          .select("*")
          .single();

      if (error) {
        return Response.json(
          {
            error: error.message,
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
            "The related email draft was canceled.",
        })
        .eq(
          "lead_id",
          String(existingDraft.lead_id),
        )
        .eq(
          "task_type",
          "review_follow_up_email",
        )
        .in("status", [
          "open",
          "in_progress",
        ]);

      await supabase
        .from("lead_activities")
        .insert({
          lead_id: String(
            existingDraft.lead_id,
          ),
          activity_type:
            "email_draft_canceled",
          channel: "email",
          direction: "internal",
          summary: "Email draft canceled",
          details: existingDraft.subject,
          metadata: {
            email_draft_id: draftId,
            template_key:
              existingDraft.template_key,
            canceled_at: nowIso,
          },
        });

      return Response.json({
        success: true,
        action,
        draft: canceledDraft,
      });
    }

    if (action === "mark_sent") {
      if (
        existingDraft.status !== "approved"
      ) {
        return Response.json(
          {
            error:
              "Approve the email draft before marking it sent.",
          },
          {
            status: 400,
          },
        );
      }

      const { data: sentDraft, error } =
        await supabase
          .from("email_drafts")
          .update({
            status: "sent",
            sent_at: nowIso,
            error_message: null,
          })
          .eq("id", draftId)
          .select("*")
          .single();

      if (error) {
        return Response.json(
          {
            error: error.message,
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
            "The approved email was marked sent.",
        })
        .eq(
          "lead_id",
          String(existingDraft.lead_id),
        )
        .eq(
          "task_type",
          "review_follow_up_email",
        )
        .in("status", [
          "open",
          "in_progress",
        ]);

      const metadata =
        existingDraft.metadata &&
        typeof existingDraft.metadata ===
          "object"
          ? (existingDraft.metadata as Record<
              string,
              unknown
            >)
          : {};

      const shouldScheduleNextCall =
        metadata.next_phone_follow_up_after_send ===
        true;

      let nextFollowUpAt: string | null = null;
      let followUpTaskCreated = false;

      if (shouldScheduleNextCall) {
        const requestedBusinessDays =
          typeof metadata.next_phone_follow_up_business_days ===
          "number"
            ? metadata.next_phone_follow_up_business_days
            : 3;

        const nextFollowUpDate =
          setFollowUpTime(
            addBusinessDays(
              now,
              requestedBusinessDays,
            ),
          );

        nextFollowUpAt =
          nextFollowUpDate.toISOString();

        await supabase
          .from("lead_tasks")
          .update({
            status: "canceled",
            canceled_at: nowIso,
            completion_note:
              "Replaced by the newly scheduled follow-up call.",
          })
          .eq(
            "lead_id",
            String(existingDraft.lead_id),
          )
          .eq(
            "task_type",
            "phone_follow_up",
          )
          .in("status", [
            "open",
            "in_progress",
          ]);

        const {
          data: lead,
          error: leadReadError,
        } = await supabase
          .from("leads")
          .select(
            "id, name, phone, project_type",
          )
          .eq(
            "id",
            String(existingDraft.lead_id),
          )
          .single();

        if (leadReadError) {
          console.error(
            "Unable to load lead for next follow-up:",
            leadReadError,
          );
        }

        const {
          data: followUpTask,
          error: followUpTaskError,
        } = await supabase
          .from("lead_tasks")
          .insert({
            lead_id: String(
              existingDraft.lead_id,
            ),
            task_type: "phone_follow_up",
            title: `Follow up with ${
              lead?.name ?? "Customer"
            }`,
            description:
              "Call the customer after the estimate follow-up email was sent.",
            status: "open",
            priority: "high",
            due_at: nextFollowUpAt,
            metadata: {
              created_by:
                "email_draft_sent_workflow",
              email_draft_id: draftId,
              phone: lead?.phone ?? null,
              project_type:
                lead?.project_type ?? null,
              follow_up_business_days:
                requestedBusinessDays,
            },
          })
          .select("id")
          .single();

        if (followUpTaskError) {
          console.error(
            "Unable to create next phone follow-up:",
            followUpTaskError,
          );
        } else {
          followUpTaskCreated =
            Boolean(followUpTask);
        }

        const { error: leadUpdateError } =
          await supabase
            .from("leads")
            .update({
              follow_up_at:
                nextFollowUpAt,
              lead_status:
                "customer_reviewing",
            })
            .eq(
              "id",
              String(
                existingDraft.lead_id,
              ),
            );

        if (leadUpdateError) {
          console.error(
            "Unable to update lead follow-up date:",
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
          lead_id: String(
            existingDraft.lead_id,
          ),
          activity_type: "email_sent",
          channel: "email",
          direction: "outbound",
          summary: "Email marked sent",
          details: existingDraft.subject,
          metadata: {
            email_draft_id: draftId,
            template_key:
              existingDraft.template_key,
            sent_at: nowIso,
            delivery_method:
              "manual_until_email_provider_connected",
          },
        },
      ];

      if (nextFollowUpAt) {
        activityRecords.push({
          lead_id: String(
            existingDraft.lead_id,
          ),
          activity_type:
            "phone_follow_up_scheduled",
          channel: "task",
          direction: "internal",
          summary:
            "Next phone follow-up scheduled",
          details: nextFollowUpAt,
          metadata: {
            due_at: nextFollowUpAt,
            email_draft_id: draftId,
          },
        });
      }

      await supabase
        .from("lead_activities")
        .insert(activityRecords);

      return Response.json({
        success: true,
        action,
        draft: sentDraft,
        nextFollowUpAt,
        followUpTaskCreated,
      });
    }

    return Response.json(
      {
        error:
          "The email draft action was not completed.",
      },
      {
        status: 400,
      },
    );
  } catch (error) {
    console.error(
      "Email draft update error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to update the email draft.",
      },
      {
        status: 500,
      },
    );
  }
}