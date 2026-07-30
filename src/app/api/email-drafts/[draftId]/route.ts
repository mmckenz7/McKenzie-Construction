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

type LeadRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  project_type: string | null;
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

type EmailDraftSettings =
  CompanyAssignmentSettings & {
    end_of_business_time: string | null;
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

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeAssignmentStrategy(
  value: string | null | undefined,
): TaskAssignmentStrategy {
  if (
    value &&
    allowedAssignmentStrategies.has(
      value as TaskAssignmentStrategy,
    )
  ) {
    return value as TaskAssignmentStrategy;
  }

  return "lead_owner";
}

function addBusinessDays(
  startingDate: Date,
  numberOfDays: number,
) {
  const result = new Date(startingDate);
  let daysAdded = 0;

  while (daysAdded < numberOfDays) {
    result.setDate(
      result.getDate() + 1,
    );

    const dayOfWeek =
      result.getDay();

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
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
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
  companySettings:
    | EmailDraftSettings
    | null,
  startingDate: Date,
  fallbackBusinessDays: number,
) {
  const endOfBusinessTime =
    companySettings
      ?.end_of_business_time ??
    null;

  if (!taskRule) {
    return setEndOfBusiness(
      addBusinessDays(
        startingDate,
        fallbackBusinessDays,
      ),
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    taskRule.due_mode ===
    "no_due_date"
  ) {
    return null;
  }

  if (
    taskRule.due_mode ===
    "same_day"
  ) {
    return setEndOfBusiness(
      startingDate,
      endOfBusinessTime,
    ).toISOString();
  }

  if (
    taskRule.due_mode ===
    "business_days"
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
    taskRule.due_mode ===
    "calendar_days"
  ) {
    const dueDate =
      new Date(startingDate);

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
    addBusinessDays(
      startingDate,
      fallbackBusinessDays,
    ),
    endOfBusinessTime,
  ).toISOString();
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
    const { draftId: rawDraftId } =
      await context.params;

    const draftId =
      rawDraftId.trim();

    if (!draftId) {
      return Response.json(
        {
          error:
            "A valid draft ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

    const {
      data: draft,
      error,
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

    if (
      error ||
      !draft
    ) {
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
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the email draft.",
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
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  try {
    const { draftId: rawDraftId } =
      await context.params;

    const draftId =
      rawDraftId.trim();

    if (!draftId) {
      return Response.json(
        {
          error:
            "A valid draft ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const body =
      (await request.json()) as RequestBody;

    const action =
      cleanText(body.action);

    if (!isDraftAction(action)) {
      return Response.json(
        {
          error:
            "Choose a valid email draft action.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

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

    if (
      draftReadError ||
      !existingDraft
    ) {
      return Response.json(
        {
          error:
            draftReadError
              ?.message ??
            "The email draft could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      existingDraft.status ===
        "sent" &&
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
      existingDraft.status ===
        "canceled" &&
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

    const now =
      new Date();

    const nowIso =
      now.toISOString();

    const leadId =
      String(
        existingDraft.lead_id,
      );

    const toEmail =
      body.toEmail === undefined
        ? existingDraft.to_email
        : cleanText(
            body.toEmail,
          );

    const ccEmail =
      body.ccEmail === undefined
        ? existingDraft.cc_email
        : cleanText(
            body.ccEmail,
          ) || null;

    const subject =
      body.subject === undefined
        ? existingDraft.subject
        : cleanText(
            body.subject,
          );

    const emailBody =
      body.body === undefined
        ? existingDraft.body
        : cleanText(
            body.body,
          );

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
      const {
        data: updatedDraft,
        error,
      } = await supabase
        .from("email_drafts")
        .update({
          to_email:
            toEmail,
          cc_email:
            ccEmail,
          subject,
          body:
            emailBody,
          status:
            "draft",
          approved_at:
            null,
          error_message:
            null,
        })
        .eq("id", draftId)
        .select("*")
        .single();

      if (error) {
        return Response.json(
          {
            error:
              error.message,
          },
          {
            status: 500,
          },
        );
      }

      const {
        error: activityError,
      } = await supabase
        .from("lead_activities")
        .insert({
          lead_id:
            leadId,
          activity_type:
            "email_draft_updated",
          channel:
            "email",
          direction:
            "internal",
          summary:
            "Email draft updated",
          details:
            subject,
          metadata: {
            email_draft_id:
              draftId,
            template_key:
              existingDraft.template_key,
          },
        });

      if (activityError) {
        console.error(
          "Unable to record draft update:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        draft:
          updatedDraft,
      });
    }

    if (action === "approve") {
      const {
        data: approvedDraft,
        error,
      } = await supabase
        .from("email_drafts")
        .update({
          to_email:
            toEmail,
          cc_email:
            ccEmail,
          subject,
          body:
            emailBody,
          status:
            "approved",
          approved_at:
            nowIso,
          error_message:
            null,
        })
        .eq("id", draftId)
        .select("*")
        .single();

      if (error) {
        return Response.json(
          {
            error:
              error.message,
          },
          {
            status: 500,
          },
        );
      }

      const {
        error: activityError,
      } = await supabase
        .from("lead_activities")
        .insert({
          lead_id:
            leadId,
          activity_type:
            "email_draft_approved",
          channel:
            "email",
          direction:
            "internal",
          summary:
            "Email draft approved",
          details:
            subject,
          metadata: {
            email_draft_id:
              draftId,
            template_key:
              existingDraft.template_key,
            approved_at:
              nowIso,
          },
        });

      if (activityError) {
        console.error(
          "Unable to record draft approval:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        draft:
          approvedDraft,
      });
    }

    if (action === "cancel") {
      const {
        data: canceledDraft,
        error,
      } = await supabase
        .from("email_drafts")
        .update({
          status:
            "canceled",
          canceled_at:
            nowIso,
        })
        .eq("id", draftId)
        .select("*")
        .single();

      if (error) {
        return Response.json(
          {
            error:
              error.message,
          },
          {
            status: 500,
          },
        );
      }

      const taskCancellation = {
        status:
          "canceled",
        canceled_at:
          nowIso,
        completion_note:
          "The related email draft was canceled.",
      };

      const [
        legacyTaskResult,
        companyTaskResult,
      ] = await Promise.all([
        supabase
          .from("lead_tasks")
          .update(
            taskCancellation,
          )
          .eq(
            "lead_id",
            leadId,
          )
          .eq(
            "task_type",
            "review_follow_up_email",
          )
          .in("status", [
            "open",
            "in_progress",
          ]),

        supabase
          .from("tasks")
          .update(
            taskCancellation,
          )
          .eq(
            "lead_id",
            leadId,
          )
          .eq(
            "task_type",
            "review_follow_up_email",
          )
          .in("status", [
            "open",
            "in_progress",
          ]),
      ]);

      if (
        legacyTaskResult.error
      ) {
        console.error(
          "Unable to cancel lead email-review task:",
          legacyTaskResult.error,
        );
      }

      if (
        companyTaskResult.error
      ) {
        console.error(
          "Unable to cancel company email-review task:",
          companyTaskResult.error,
        );
      }

      const {
        error: activityError,
      } = await supabase
        .from("lead_activities")
        .insert({
          lead_id:
            leadId,
          activity_type:
            "email_draft_canceled",
          channel:
            "email",
          direction:
            "internal",
          summary:
            "Email draft canceled",
          details:
            existingDraft.subject,
          metadata: {
            email_draft_id:
              draftId,
            template_key:
              existingDraft.template_key,
            canceled_at:
              nowIso,
          },
        });

      if (activityError) {
        console.error(
          "Unable to record draft cancellation:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        draft:
          canceledDraft,
      });
    }

    if (action === "mark_sent") {
      if (
        existingDraft.status !==
        "approved"
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

      const [
        leadResult,
        followUpRuleResult,
        settingsResult,
      ] = await Promise.all([
        supabase
          .from("leads")
          .select(
            `
              id,
              name,
              phone,
              project_type,
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
            "proposal_follow_up",
          )
          .eq(
            "is_active",
            true,
          )
          .maybeSingle(),

        supabase
          .from("company_settings")
          .select(
            `
              automatically_assign_new_leads,
              automatically_assign_new_tasks,
              automatically_assign_converted_projects,
              allow_unassigned_leads,
              allow_unassigned_tasks,
              require_responsible_person,
              require_task_assignee,
              require_project_manager,
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
              leadResult.error
                ?.message ??
              "The lead could not be loaded.",
          },
          {
            status: 404,
          },
        );
      }

      if (
        followUpRuleResult.error
      ) {
        console.error(
          "Unable to load proposal follow-up rule:",
          followUpRuleResult.error,
        );

        return Response.json(
          {
            error:
              "The proposal follow-up task settings could not be loaded.",
          },
          {
            status: 500,
          },
        );
      }

      if (
        settingsResult.error ||
        !settingsResult.data
      ) {
        console.error(
          "Unable to load company settings:",
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

      const lead =
        leadResult.data as LeadRecord;

      const followUpRule =
        (followUpRuleResult.data ??
          null) as TaskRule | null;

      const companySettings =
        settingsResult.data as EmailDraftSettings;

      const metadata =
        existingDraft.metadata &&
        typeof existingDraft.metadata ===
          "object" &&
        !Array.isArray(
          existingDraft.metadata,
        )
          ? (
              existingDraft.metadata as Record<
                string,
                unknown
              >
            )
          : {};

      const shouldScheduleNextCall =
        metadata
          .next_phone_follow_up_after_send ===
        true;

      let nextFollowUpAt:
        | string
        | null = null;

      let assignedToId:
        | string
        | null = null;

      let assignmentStrategy:
        | TaskAssignmentStrategy
        | null = null;

      let requestedBusinessDays =
        3;

      if (shouldScheduleNextCall) {
        requestedBusinessDays =
          typeof metadata
            .next_phone_follow_up_business_days ===
          "number"
            ? Math.max(
                Math.trunc(
                  metadata
                    .next_phone_follow_up_business_days,
                ),
                0,
              )
            : 3;

        nextFollowUpAt =
          getTaskDueAt(
            followUpRule,
            companySettings,
            now,
            requestedBusinessDays,
          );

        assignmentStrategy =
          normalizeAssignmentStrategy(
            followUpRule
              ?.assignment_strategy,
          );

        try {
          assignedToId =
            await resolveTaskAssignee(
              supabase,
              {
                settings:
                  companySettings,
                assignmentStrategy,
                defaultAssigneeId:
                  followUpRule
                    ?.default_assignee_id ??
                  null,
                leadOwnerId:
                  lead.responsible_person_id,
              },
            );
        } catch (error) {
          console.error(
            "Unable to resolve next phone follow-up assignee:",
            error,
          );

          return Response.json(
            {
              error:
                "The next phone follow-up assignee could not be determined.",
            },
            {
              status: 500,
            },
          );
        }

        if (
          !assignedToId &&
          taskAssigneeIsRequired(
            companySettings,
          )
        ) {
          return Response.json(
            {
              error:
                "An active task assignee is required before marking this email sent.",
            },
            {
              status: 400,
            },
          );
        }
      }

      const {
        data: sentDraft,
        error: sentDraftError,
      } = await supabase
        .from("email_drafts")
        .update({
          status:
            "sent",
          sent_at:
            nowIso,
          error_message:
            null,
        })
        .eq("id", draftId)
        .select("*")
        .single();

      if (sentDraftError) {
        return Response.json(
          {
            error:
              sentDraftError.message,
          },
          {
            status: 500,
          },
        );
      }

      const reviewCompletion = {
        status:
          "completed",
        completed_at:
          nowIso,
        completion_note:
          "The approved email was marked sent.",
      };

      const [
        legacyReviewResult,
        companyReviewResult,
      ] = await Promise.all([
        supabase
          .from("lead_tasks")
          .update(
            reviewCompletion,
          )
          .eq(
            "lead_id",
            leadId,
          )
          .eq(
            "task_type",
            "review_follow_up_email",
          )
          .in("status", [
            "open",
            "in_progress",
          ]),

        supabase
          .from("tasks")
          .update(
            reviewCompletion,
          )
          .eq(
            "lead_id",
            leadId,
          )
          .eq(
            "task_type",
            "review_follow_up_email",
          )
          .in("status", [
            "open",
            "in_progress",
          ]),
      ]);

      if (
        legacyReviewResult.error
      ) {
        console.error(
          "Unable to complete lead email-review task:",
          legacyReviewResult.error,
        );
      }

      if (
        companyReviewResult.error
      ) {
        console.error(
          "Unable to complete company email-review task:",
          companyReviewResult.error,
        );
      }

      let legacyFollowUpTaskId:
        | string
        | null = null;

      let companyFollowUpTaskId:
        | string
        | null = null;

      if (shouldScheduleNextCall) {
        const followUpCancellation = {
          status:
            "canceled",
          canceled_at:
            nowIso,
          completion_note:
            "Replaced by the newly scheduled follow-up call.",
        };

        const [
          legacyCancelResult,
          companyCancelResult,
        ] = await Promise.all([
          supabase
            .from("lead_tasks")
            .update(
              followUpCancellation,
            )
            .eq(
              "lead_id",
              leadId,
            )
            .in("task_type", [
              "first_phone_follow_up",
              "phone_follow_up",
            ])
            .in("status", [
              "open",
              "in_progress",
            ]),

          supabase
            .from("tasks")
            .update(
              followUpCancellation,
            )
            .eq(
              "lead_id",
              leadId,
            )
            .in("task_type", [
              "first_phone_follow_up",
              "phone_follow_up",
            ])
            .in("status", [
              "open",
              "in_progress",
            ]),
        ]);

        if (
          legacyCancelResult.error
        ) {
          console.error(
            "Unable to cancel older lead follow-up tasks:",
            legacyCancelResult.error,
          );
        }

        if (
          companyCancelResult.error
        ) {
          console.error(
            "Unable to cancel older company follow-up tasks:",
            companyCancelResult.error,
          );
        }

        const taskTitle =
          `Follow up with ${
            lead.name ??
            "Customer"
          }`;

        const taskDescription =
          followUpRule
            ?.description ??
          "Call the customer after the estimate follow-up email was sent.";

        const taskPriority =
          followUpRule
            ?.default_priority ??
          "high";

        const taskCategory =
          followUpRule
            ?.category ??
          "sales";

        const taskMetadata = {
          created_by:
            "email_draft_sent_workflow",
          task_rule_key:
            followUpRule
              ?.task_key ??
            "proposal_follow_up",
          task_type_id:
            followUpRule
              ?.id ??
            null,
          assignment_strategy:
            assignmentStrategy,
          email_draft_id:
            draftId,
          phone:
            lead.phone,
          project_type:
            lead.project_type,
          fallback_follow_up_business_days:
            requestedBusinessDays,
          assigned_to_id:
            assignedToId,
        };

        const {
          data: legacyFollowUpTask,
          error:
            legacyFollowUpTaskError,
        } = await supabase
          .from("lead_tasks")
          .insert({
            lead_id:
              leadId,
            task_type:
              "phone_follow_up",
            title:
              taskTitle,
            description:
              taskDescription,
            status:
              "open",
            priority:
              taskPriority,
            due_at:
              nextFollowUpAt,
            assigned_to_id:
              assignedToId,
            assigned_at:
              assignedToId
                ? nowIso
                : null,
            metadata:
              taskMetadata,
          })
          .select("id")
          .single();

        if (
          legacyFollowUpTaskError ||
          !legacyFollowUpTask
        ) {
          console.error(
            "Unable to create next lead phone follow-up:",
            legacyFollowUpTaskError,
          );

          await supabase
            .from("email_drafts")
            .update({
              status:
                "approved",
              sent_at:
                null,
              error_message:
                "Follow-up task creation failed while marking the draft sent.",
            })
            .eq(
              "id",
              draftId,
            );

          return Response.json(
            {
              error:
                legacyFollowUpTaskError
                  ?.message ??
                "The next lead follow-up task could not be created.",
            },
            {
              status: 500,
            },
          );
        }

        legacyFollowUpTaskId =
          String(
            legacyFollowUpTask.id,
          );

        const {
          data: companyFollowUpTask,
          error:
            companyFollowUpTaskError,
        } = await supabase
          .from("tasks")
          .insert({
            lead_id:
              leadId,
            task_type:
              "phone_follow_up",
            task_type_id:
              followUpRule
                ?.id ??
              null,
            title:
              taskTitle,
            description:
              taskDescription,
            category:
              taskCategory,
            status:
              "open",
            priority:
              taskPriority,
            due_at:
              nextFollowUpAt,
            assigned_to_id:
              assignedToId,
            assigned_at:
              assignedToId
                ? nowIso
                : null,
            source_type:
              "email_draft_sent_workflow",
            metadata: {
              ...taskMetadata,
              legacy_lead_task_id:
                legacyFollowUpTaskId,
            },
          })
          .select("id")
          .single();

        if (
          companyFollowUpTaskError ||
          !companyFollowUpTask
        ) {
          console.error(
            "Unable to create next company phone follow-up:",
            companyFollowUpTaskError,
          );

          await Promise.all([
            supabase
              .from("lead_tasks")
              .delete()
              .eq(
                "id",
                legacyFollowUpTaskId,
              ),

            supabase
              .from("email_drafts")
              .update({
                status:
                  "approved",
                sent_at:
                  null,
                error_message:
                  "Company follow-up task creation failed while marking the draft sent.",
              })
              .eq(
                "id",
                draftId,
              ),
          ]);

          return Response.json(
            {
              error:
                companyFollowUpTaskError
                  ?.message ??
                "The next company follow-up task could not be created.",
            },
            {
              status: 500,
            },
          );
        }

        companyFollowUpTaskId =
          String(
            companyFollowUpTask.id,
          );

        const {
          error: leadUpdateError,
        } = await supabase
          .from("leads")
          .update({
            follow_up_at:
              nextFollowUpAt,
            lead_status:
              "customer_reviewing",
          })
          .eq(
            "id",
            leadId,
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
        metadata: Record<
          string,
          unknown
        >;
      }> = [
        {
          lead_id:
            leadId,
          activity_type:
            "email_sent",
          channel:
            "email",
          direction:
            "outbound",
          summary:
            "Email marked sent",
          details:
            existingDraft.subject,
          metadata: {
            email_draft_id:
              draftId,
            template_key:
              existingDraft.template_key,
            sent_at:
              nowIso,
            delivery_method:
              "manual_until_email_provider_connected",
          },
        },
      ];

      if (nextFollowUpAt) {
        activityRecords.push({
          lead_id:
            leadId,
          activity_type:
            "phone_follow_up_scheduled",
          channel:
            "task",
          direction:
            "internal",
          summary:
            "Next phone follow-up scheduled",
          details:
            nextFollowUpAt,
          metadata: {
            due_at:
              nextFollowUpAt,
            email_draft_id:
              draftId,
            legacy_task_id:
              legacyFollowUpTaskId,
            company_task_id:
              companyFollowUpTaskId,
            task_rule_key:
              followUpRule
                ?.task_key ??
              "proposal_follow_up",
            task_type_id:
              followUpRule
                ?.id ??
              null,
            assigned_to_id:
              assignedToId,
            assignment_strategy:
              assignmentStrategy,
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
          "Unable to record sent-email activities:",
          activityError,
        );
      }

      return Response.json({
        success: true,
        action,
        draft:
          sentDraft,
        nextFollowUpAt,
        assignedToId,
        followUpTaskCreated:
          Boolean(
            legacyFollowUpTaskId,
          ),
        companyTaskCreated:
          Boolean(
            companyFollowUpTaskId,
          ),
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
          error instanceof Error
            ? error.message
            : "Unable to update the email draft.",
      },
      {
        status: 500,
      },
    );
  }
}