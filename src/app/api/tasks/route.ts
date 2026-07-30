import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  resolveTaskAssignee,
  taskAssigneeIsRequired,
  validateActiveAssignee,
  type CompanyAssignmentSettings,
  type TaskAssignmentStrategy,
} from "@/lib/crm/assignment";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

const allowedCategories = new Set([
  "sales",
  "project",
  "marketing",
  "accounting",
  "operations",
  "customer_service",
  "administrative",
  "owner",
]);

const allowedPriorities = new Set([
  "low",
  "normal",
  "high",
  "urgent",
]);

const allowedRecurrenceRules = new Set([
  "daily",
  "weekly",
  "monthly",
]);

const allowedAssignmentStrategies =
  new Set<TaskAssignmentStrategy>([
    "specific_employee",
    "lead_owner",
    "default_lead_owner",
    "default_estimator",
    "default_project_manager",
    "unassigned",
  ]);

type TaskTypeRecord = {
  id: string;
  task_key: string;
  assignment_strategy: string;
  default_assignee_id: string | null;
  is_active: boolean;
};

type LeadAssignmentRecord = {
  id: string;
  responsible_person_id: string | null;
};

async function requireAuthenticatedUser() {
  const supabase =
    await createAuthenticatedServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: "You must be signed in.",
    },
    {
      status: 401,
    },
  );
}

function normalizeOptionalId(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue || null;
}

function normalizeOptionalText(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue || null;
}

function normalizeRecurrenceRule(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "none"
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !allowedRecurrenceRules.has(value)
  ) {
    return null;
  }

  return value;
}

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

  return "unassigned";
}

export async function GET() {
  try {
    const user =
      await requireAuthenticatedUser();

    if (!user) {
      return unauthorizedResponse();
    }

    const supabase =
      createAdminServerClient();

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("due_at", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      tasks: data ?? [],
    });
  } catch (error) {
    console.error(
      "Unable to load tasks:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load tasks.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const user =
      await requireAuthenticatedUser();

    if (!user) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as {
      title?: unknown;
      description?: unknown;
      category?: unknown;
      priority?: unknown;
      dueAt?: unknown;
      assignedToId?: unknown;
      leadId?: unknown;
      projectId?: unknown;
      customerId?: unknown;
      taskTypeId?: unknown;
      recurrenceRule?: unknown;
      sourceType?: unknown;
      metadata?: unknown;
    };

    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error: "Task title is required.",
        },
        {
          status: 400,
        },
      );
    }

    const category =
      typeof body.category === "string"
        ? body.category
        : "administrative";

    if (!allowedCategories.has(category)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Choose a valid task category.",
        },
        {
          status: 400,
        },
      );
    }

    const priority =
      typeof body.priority === "string"
        ? body.priority
        : "normal";

    if (!allowedPriorities.has(priority)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Choose a valid task priority.",
        },
        {
          status: 400,
        },
      );
    }

    let dueAt: string | null = null;

    if (
      body.dueAt !== null &&
      body.dueAt !== undefined &&
      body.dueAt !== ""
    ) {
      if (typeof body.dueAt !== "string") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Choose a valid due date.",
          },
          {
            status: 400,
          },
        );
      }

      const parsedDueDate = new Date(
        body.dueAt,
      );

      if (
        Number.isNaN(
          parsedDueDate.getTime(),
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Choose a valid due date.",
          },
          {
            status: 400,
          },
        );
      }

      dueAt =
        parsedDueDate.toISOString();
    }

    const recurrenceRule =
      normalizeRecurrenceRule(
        body.recurrenceRule,
      );

    if (
      body.recurrenceRule &&
      body.recurrenceRule !== "none" &&
      !recurrenceRule
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Choose a valid recurrence schedule.",
        },
        {
          status: 400,
        },
      );
    }

    if (recurrenceRule && !dueAt) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Recurring tasks require a due date.",
        },
        {
          status: 400,
        },
      );
    }

    const requestedAssigneeId =
      normalizeOptionalId(
        body.assignedToId,
      );

    const leadId =
      normalizeOptionalId(body.leadId);

    const projectId =
      normalizeOptionalId(
        body.projectId,
      );

    const customerId =
      normalizeOptionalId(
        body.customerId,
      );

    const taskTypeId =
      normalizeOptionalId(
        body.taskTypeId,
      );

    const sourceType =
      normalizeOptionalText(
        body.sourceType,
      ) ?? "manual";

    const metadata =
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    const supabase =
      createAdminServerClient();

    const {
      data: settingsData,
      error: settingsError,
    } = await supabase
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
          default_project_manager_id
        `,
      )
      .limit(1)
      .maybeSingle();

    if (
      settingsError ||
      !settingsData
    ) {
      console.error(
        "Unable to load company task-assignment settings:",
        settingsError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Company task settings could not be loaded.",
        },
        {
          status: 500,
        },
      );
    }

    const assignmentSettings =
      settingsData as CompanyAssignmentSettings;

    let taskType:
      | TaskTypeRecord
      | null = null;

    if (taskTypeId) {
      const {
        data: taskTypeData,
        error: taskTypeError,
      } = await supabase
        .from("task_types")
        .select(
          `
            id,
            task_key,
            assignment_strategy,
            default_assignee_id,
            is_active
          `,
        )
        .eq("id", taskTypeId)
        .maybeSingle();

      if (taskTypeError) {
        console.error(
          "Unable to load selected task type:",
          taskTypeError,
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "The selected task type could not be loaded.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        !taskTypeData ||
        !taskTypeData.is_active
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Choose an active task type.",
          },
          {
            status: 400,
          },
        );
      }

      taskType =
        taskTypeData as TaskTypeRecord;
    }

    let lead:
      | LeadAssignmentRecord
      | null = null;

    if (leadId) {
      const {
        data: leadData,
        error: leadError,
      } = await supabase
        .from("leads")
        .select(
          "id, responsible_person_id",
        )
        .eq("id", leadId)
        .maybeSingle();

      if (leadError) {
        console.error(
          "Unable to load the selected lead:",
          leadError,
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "The selected lead could not be loaded.",
          },
          {
            status: 400,
          },
        );
      }

      if (!leadData) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The selected lead no longer exists.",
          },
          {
            status: 400,
          },
        );
      }

      lead =
        leadData as LeadAssignmentRecord;
    }

    let assignedToId:
      | string
      | null = null;

    if (requestedAssigneeId) {
      assignedToId =
        await validateActiveAssignee(
          supabase,
          requestedAssigneeId,
        );

      if (!assignedToId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Choose an active team member as the task assignee.",
          },
          {
            status: 400,
          },
        );
      }
    } else if (
      taskType &&
      assignmentSettings
        .automatically_assign_new_tasks
    ) {
      assignedToId =
        await resolveTaskAssignee(
          supabase,
          {
            settings:
              assignmentSettings,
            assignmentStrategy:
              normalizeAssignmentStrategy(
                taskType.assignment_strategy,
              ),
            defaultAssigneeId:
              taskType.default_assignee_id,
            leadOwnerId:
              lead?.responsible_person_id ??
              null,
          },
        );
    }

    if (
      !assignedToId &&
      taskAssigneeIsRequired(
        assignmentSettings,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "An active task assignee is required by the company settings.",
        },
        {
          status: 400,
        },
      );
    }

    const now = new Date().toISOString();

    const { data, error } =
      await supabase
        .from("tasks")
        .insert({
          title,
          description:
            normalizeOptionalText(
              body.description,
            ),
          category,
          task_type: recurrenceRule
            ? "recurring"
            : taskType?.task_key ??
              "manual",
          task_type_id: taskTypeId,
          status: "open",
          priority,
          due_at: dueAt,
          assigned_to_id:
            assignedToId,
          assigned_at: assignedToId
            ? now
            : null,
          lead_id: leadId,
          project_id: projectId,
          customer_id: customerId,
          recurrence_rule:
            recurrenceRule,
          source_type: sourceType,
          metadata,
        })
        .select("*")
        .single();

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json(
          {
            success: false,
            error:
              "One of the selected related records no longer exists.",
          },
          {
            status: 400,
          },
        );
      }

      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        task: data,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Unable to create task:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to create task.",
      },
      {
        status: 500,
      },
    );
  }
}