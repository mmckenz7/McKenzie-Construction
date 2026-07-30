import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";

import { NextResponse } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

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

const allowedDueModes = new Set([
  "same_day",
  "business_days",
  "calendar_days",
  "no_due_date",
]);

const allowedAssignmentStrategies = new Set([
  "lead_owner",
  "default_lead_owner",
  "default_estimator",
  "default_project_manager",
  "specific_employee",
  "unassigned",
]);

type CreateTaskTypeBody = {
  name?: unknown;
  taskKey?: unknown;
  description?: unknown;
  category?: unknown;
  defaultPriority?: unknown;
  dueMode?: unknown;
  dueOffset?: unknown;
  assignmentStrategy?: unknown;
  defaultAssigneeId?: unknown;
  isActive?: unknown;
};

const taskTypeSelect = `
  id,
  name,
  task_key,
  description,
  category,
  default_priority,
  due_mode,
  due_offset,
  assignment_strategy,
  default_assignee_id,
  is_system_type,
  is_active,
  created_at,
  updated_at
`;

function optionalText(value: unknown) {
  if (
    value === undefined ||
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

function normalizeTaskKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDueOffset(
  value: unknown,
  dueMode: string,
) {
  if (
    dueMode === "same_day" ||
    dueMode === "no_due_date"
  ) {
    return 0;
  }

  const numberValue =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 0 ||
    numberValue > 365
  ) {
    return undefined;
  }

  return numberValue;
}

export async function GET(
  request: Request,
) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  if (
    !hasManagementAccess(
      access.teamMember.roles,
    )
  ) {
    return createForbiddenApiResponse(
      request,
    );
  }

  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("task_types")
    .select(taskTypeSelect)
    .order("is_system_type", {
      ascending: false,
    })
    .order("name", {
      ascending: true,
    });

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

  return NextResponse.json({
    success: true,
    taskTypes: data ?? [],
  });
}

export async function POST(request: Request) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  if (
    !hasManagementAccess(
      access.teamMember.roles,
    )
  ) {
    return createForbiddenApiResponse(
      request,
    );
  }

  let body: CreateTaskTypeBody;

  try {
    body =
      (await request.json()) as CreateTaskTypeBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error: "Task type name is required.",
      },
      {
        status: 400,
      },
    );
  }

  const rawTaskKey =
    typeof body.taskKey === "string"
      ? body.taskKey
      : "";

  const taskKey = normalizeTaskKey(rawTaskKey);

  if (!taskKey) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid task key is required.",
      },
      {
        status: 400,
      },
    );
  }

  const category =
    typeof body.category === "string"
      ? body.category.trim()
      : "administrative";

  if (!allowedCategories.has(category)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid task category.",
      },
      {
        status: 400,
      },
    );
  }

  const defaultPriority =
    typeof body.defaultPriority === "string"
      ? body.defaultPriority.trim()
      : "normal";

  if (!allowedPriorities.has(defaultPriority)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid default priority.",
      },
      {
        status: 400,
      },
    );
  }

  const dueMode =
    typeof body.dueMode === "string"
      ? body.dueMode.trim()
      : "business_days";

  if (!allowedDueModes.has(dueMode)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid due timing mode.",
      },
      {
        status: 400,
      },
    );
  }

  const dueOffset = parseDueOffset(
    body.dueOffset,
    dueMode,
  );

  if (dueOffset === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Enter a valid number of days.",
      },
      {
        status: 400,
      },
    );
  }

  const assignmentStrategy =
    typeof body.assignmentStrategy === "string"
      ? body.assignmentStrategy.trim()
      : "unassigned";

  if (
    !allowedAssignmentStrategies.has(
      assignmentStrategy,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid assignment strategy.",
      },
      {
        status: 400,
      },
    );
  }

  const defaultAssigneeId = optionalText(
    body.defaultAssigneeId,
  );

  if (defaultAssigneeId === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid default employee.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    assignmentStrategy ===
      "specific_employee" &&
    !defaultAssigneeId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Choose a specific employee for this task type.",
      },
      {
        status: 400,
      },
    );
  }

  const isActive =
    typeof body.isActive === "boolean"
      ? body.isActive
      : true;

  const description = optionalText(
    body.description,
  );

  if (description === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid task type description.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  if (defaultAssigneeId) {
    const { data: employee, error } =
      await supabase
        .from("team_members")
        .select("id, status")
        .eq("id", defaultAssigneeId)
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

    if (employee.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only active employees can be selected.",
        },
        {
          status: 400,
        },
      );
    }
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("task_types")
    .insert({
      name,
      task_key: taskKey,
      description,
      category,
      default_priority: defaultPriority,
      due_mode: dueMode,
      due_offset: dueOffset,
      assignment_strategy:
        assignmentStrategy,
      default_assignee_id:
        assignmentStrategy ===
        "specific_employee"
          ? defaultAssigneeId
          : null,
      is_system_type: false,
      is_active: isActive,
      created_at: now,
      updated_at: now,
    })
    .select(taskTypeSelect)
    .single();

  if (error) {
    const isDuplicate =
      error.code === "23505";

    return NextResponse.json(
      {
        success: false,
        error: isDuplicate
          ? "A task type with that name or task key already exists."
          : error.message,
      },
      {
        status: isDuplicate
          ? 409
          : 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      taskType: data,
    },
    {
      status: 201,
    },
  );
}