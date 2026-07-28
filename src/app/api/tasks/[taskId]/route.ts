import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedStatuses = new Set([
  "open",
  "in_progress",
  "completed",
  "canceled",
]);

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

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

type UpdateTaskBody = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  priority?: unknown;
  status?: unknown;
  dueAt?: unknown;
  assignedToId?: unknown;
  leadId?: unknown;
  projectId?: unknown;
  customerId?: unknown;
  completionNote?: unknown;
  recurrenceRule?: unknown;
};

const taskSelect = `
  id,
  title,
  description,
  category,
  task_type,
  task_type_id,
  status,
  priority,
  due_at,
  started_at,
  completed_at,
  canceled_at,
  completion_note,
  assigned_to_id,
  assigned_at,
  lead_id,
  project_id,
  customer_id,
  recurrence_rule,
  source_type,
  metadata,
  created_at,
  updated_at
`;

function optionalText(value: unknown) {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue || null;
}

function optionalDate(value: unknown) {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function optionalRecurrenceRule(
  value: unknown,
) {
  if (
    value === null ||
    value === "" ||
    value === "none"
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !allowedRecurrenceRules.has(value)
  ) {
    return undefined;
  }

  return value;
}

function calculateNextDueAt(
  currentDueAt: string,
  recurrenceRule: string,
) {
  const currentDueDate = new Date(
    currentDueAt,
  );

  if (
    Number.isNaN(
      currentDueDate.getTime(),
    )
  ) {
    return null;
  }

  const nextDueDate = new Date(
    currentDueDate,
  );

  if (recurrenceRule === "daily") {
    nextDueDate.setDate(
      nextDueDate.getDate() + 1,
    );
  }

  if (recurrenceRule === "weekly") {
    nextDueDate.setDate(
      nextDueDate.getDate() + 7,
    );
  }

  if (recurrenceRule === "monthly") {
    const originalDay =
      nextDueDate.getDate();

    nextDueDate.setDate(1);
    nextDueDate.setMonth(
      nextDueDate.getMonth() + 1,
    );

    const finalDayOfMonth = new Date(
      nextDueDate.getFullYear(),
      nextDueDate.getMonth() + 1,
      0,
    ).getDate();

    nextDueDate.setDate(
      Math.min(
        originalDay,
        finalDayOfMonth,
      ),
    );
  }

  return nextDueDate.toISOString();
}

function normalizeMetadata(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { taskId } =
    await context.params;

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase
      .from("tasks")
      .select(taskSelect)
      .eq("id", taskId)
      .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error: "Task not found.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
    task: data,
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { taskId } =
    await context.params;

  let body: UpdateTaskBody;

  try {
    body =
      (await request.json()) as UpdateTaskBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: existingTask,
    error: readError,
  } = await supabase
    .from("tasks")
    .select(taskSelect)
    .eq("id", taskId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      {
        success: false,
        error: readError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!existingTask) {
    return NextResponse.json(
      {
        success: false,
        error: "Task not found.",
      },
      {
        status: 404,
      },
    );
  }

  const updates: Record<
    string,
    unknown
  > = {
    updated_at:
      new Date().toISOString(),
  };

  if (body.title !== undefined) {
    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Task title is required.",
        },
        {
          status: 400,
        },
      );
    }

    updates.title = title;
  }

  if (
    body.description !== undefined
  ) {
    const description =
      optionalText(body.description);

    if (
      description === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid task description.",
        },
        {
          status: 400,
        },
      );
    }

    updates.description =
      description;
  }

  if (body.category !== undefined) {
    const category =
      typeof body.category ===
      "string"
        ? body.category.trim()
        : "";

    if (
      !allowedCategories.has(
        category,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid task category.",
        },
        {
          status: 400,
        },
      );
    }

    updates.category = category;
  }

  if (body.priority !== undefined) {
    const priority =
      typeof body.priority ===
      "string"
        ? body.priority.trim()
        : "";

    if (
      !allowedPriorities.has(
        priority,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid task priority.",
        },
        {
          status: 400,
        },
      );
    }

    updates.priority = priority;
  }

  if (body.dueAt !== undefined) {
    const dueAt = optionalDate(
      body.dueAt,
    );

    if (dueAt === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid task due date.",
        },
        {
          status: 400,
        },
      );
    }

    updates.due_at = dueAt;
  }

  if (
    body.recurrenceRule !==
    undefined
  ) {
    const recurrenceRule =
      optionalRecurrenceRule(
        body.recurrenceRule,
      );

    if (
      recurrenceRule === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid recurrence schedule.",
        },
        {
          status: 400,
        },
      );
    }

    const effectiveDueAt =
      updates.due_at !== undefined
        ? updates.due_at
        : existingTask.due_at;

    if (
      recurrenceRule &&
      !effectiveDueAt
    ) {
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

    updates.recurrence_rule =
      recurrenceRule;

    updates.task_type =
      recurrenceRule
        ? "recurring"
        : "manual";
  }

  if (
    body.assignedToId !== undefined
  ) {
    const assignedToId =
      optionalText(
        body.assignedToId,
      );

    if (
      assignedToId === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid responsible person selection.",
        },
        {
          status: 400,
        },
      );
    }

    if (assignedToId) {
      const {
        data: employee,
        error,
      } = await supabase
        .from("team_members")
        .select("id, status")
        .eq("id", assignedToId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
          },
          {
            status: 500,
          },
        );
      }

      if (!employee) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The selected employee does not exist.",
          },
          {
            status: 404,
          },
        );
      }

      if (
        employee.status !==
        "active"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Only active employees can be assigned tasks.",
          },
          {
            status: 400,
          },
        );
      }
    }

    updates.assigned_to_id =
      assignedToId;

    updates.assigned_at =
      assignedToId
        ? new Date().toISOString()
        : null;
  }

  if (body.leadId !== undefined) {
    const leadId = optionalText(
      body.leadId,
    );

    if (leadId === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid related lead.",
        },
        {
          status: 400,
        },
      );
    }

    updates.lead_id = leadId;
  }

  if (
    body.projectId !== undefined
  ) {
    const projectId =
      optionalText(body.projectId);

    if (
      projectId === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid related project.",
        },
        {
          status: 400,
        },
      );
    }

    updates.project_id =
      projectId;
  }

  if (
    body.customerId !== undefined
  ) {
    const customerId =
      optionalText(
        body.customerId,
      );

    if (
      customerId === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid related customer.",
        },
        {
          status: 400,
        },
      );
    }

    updates.customer_id =
      customerId;
  }

  if (
    body.completionNote !==
    undefined
  ) {
    const completionNote =
      optionalText(
        body.completionNote,
      );

    if (
      completionNote ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid completion note.",
        },
        {
          status: 400,
        },
      );
    }

    updates.completion_note =
      completionNote;
  }

  let requestedStatus:
    | string
    | null = null;

  if (body.status !== undefined) {
    const status =
      typeof body.status ===
      "string"
        ? body.status.trim()
        : "";

    if (
      !allowedStatuses.has(status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid task status.",
        },
        {
          status: 400,
        },
      );
    }

    requestedStatus = status;

    const now =
      new Date().toISOString();

    updates.status = status;

    if (status === "open") {
      updates.started_at = null;
      updates.completed_at = null;
      updates.canceled_at = null;
    }

    if (status === "in_progress") {
      updates.started_at =
        existingTask.started_at ??
        now;

      updates.completed_at = null;
      updates.canceled_at = null;
    }

    if (status === "completed") {
      updates.completed_at = now;
      updates.canceled_at = null;
    }

    if (status === "canceled") {
      updates.canceled_at = now;
      updates.completed_at = null;
    }
  }

  const { data, error } =
    await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select(taskSelect)
      .single();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  let nextTask = null;
  let recurrenceWarning:
    | string
    | null = null;

  const shouldCreateNextTask =
    requestedStatus ===
      "completed" &&
    existingTask.status !==
      "completed" &&
    Boolean(
      data.recurrence_rule,
    ) &&
    Boolean(data.due_at);

  if (
    shouldCreateNextTask &&
    data.recurrence_rule &&
    data.due_at
  ) {
    const nextDueAt =
      calculateNextDueAt(
        data.due_at,
        data.recurrence_rule,
      );

    if (nextDueAt) {
      const recurrenceMetadata = {
        ...normalizeMetadata(
          data.metadata,
        ),
        recurrence_parent_task_id:
          data.id,
        recurrence_due_at:
          nextDueAt,
      };

      const {
        data: existingNextTask,
        error: duplicateCheckError,
      } = await supabase
        .from("tasks")
        .select(taskSelect)
        .contains("metadata", {
          recurrence_parent_task_id:
            data.id,
          recurrence_due_at:
            nextDueAt,
        })
        .maybeSingle();

      if (duplicateCheckError) {
        recurrenceWarning =
          duplicateCheckError.message;
      } else if (
        existingNextTask
      ) {
        nextTask =
          existingNextTask;
      } else {
        const {
          data: createdNextTask,
          error:
            createNextTaskError,
        } = await supabase
          .from("tasks")
          .insert({
            title: data.title,
            description:
              data.description,
            category: data.category,
            task_type:
              "recurring",
            task_type_id:
              data.task_type_id,
            status: "open",
            priority:
              data.priority,
            due_at: nextDueAt,
            started_at: null,
            completed_at: null,
            canceled_at: null,
            completion_note: null,
            assigned_to_id:
              data.assigned_to_id,
            assigned_at:
              data.assigned_to_id
                ? new Date().toISOString()
                : null,
            lead_id: data.lead_id,
            project_id:
              data.project_id,
            customer_id:
              data.customer_id,
            recurrence_rule:
              data.recurrence_rule,
            source_type:
              data.source_type ??
              "recurring",
            metadata:
              recurrenceMetadata,
          })
          .select(taskSelect)
          .single();

        if (createNextTaskError) {
          recurrenceWarning =
            createNextTaskError.message;
        } else {
          nextTask =
            createdNextTask;
        }
      }
    } else {
      recurrenceWarning =
        "The task was completed, but the next due date could not be calculated.";
    }
  }

  return NextResponse.json({
    success: true,
    task: data,
    nextTask,
    recurrenceWarning,
  });
}