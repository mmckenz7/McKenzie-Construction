import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";

import {
  NextRequest,
  NextResponse,
} from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{
    taskTypeId: string;
  }>;
};

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

const allowedDueModes = new Set([
  "same_day",
  "business_days",
  "calendar_days",
  "no_due_date",
]);

const allowedAssignmentRoles = new Set([
  "lead_owner",
  "estimator",
  "project_manager",
  "admin",
  "owner",
  "unassigned",
]);

function getSupabaseClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are missing.",
    );
  }

  return createClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function normalizeTaskKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

export async function GET(
  request: NextRequest,
  context: RouteContext,
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

  try {
    const { taskTypeId } =
      await context.params;

    if (!taskTypeId) {
      return NextResponse.json(
        {
          success: false,
          error: "Task type ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("task_types")
      .select("*")
      .eq("id", taskTypeId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: "Task type not found.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,
      taskType: data,
    });
  } catch (error) {
    console.error(
      "Unable to load task type:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load task type.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
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

  try {
    const { taskTypeId } =
      await context.params;

    if (!taskTypeId) {
      return NextResponse.json(
        {
          success: false,
          error: "Task type ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const body = (await request.json()) as {
      taskKey?: unknown;
      name?: unknown;
      description?: unknown;
      category?: unknown;
      defaultDueMode?: unknown;
      defaultDueOffset?: unknown;
      defaultAssignmentRole?: unknown;
      isActive?: unknown;
    };

    const supabase = getSupabaseClient();

    const {
      data: existingTaskType,
      error: existingTaskTypeError,
    } = await supabase
      .from("task_types")
      .select("*")
      .eq("id", taskTypeId)
      .maybeSingle();

    if (existingTaskTypeError) {
      throw existingTaskTypeError;
    }

    if (!existingTaskType) {
      return NextResponse.json(
        {
          success: false,
          error: "Task type not found.",
        },
        {
          status: 404,
        },
      );
    }

    const updates: Record<
      string,
      string | number | boolean | null
    > = {};

    if (body.name !== undefined) {
      const name =
        typeof body.name === "string"
          ? body.name.trim()
          : "";

      if (!name) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Task type name is required.",
          },
          {
            status: 400,
          },
        );
      }

      updates.name = name;
    }

    if (body.taskKey !== undefined) {
      const taskKey =
        typeof body.taskKey === "string"
          ? normalizeTaskKey(body.taskKey)
          : "";

      if (!taskKey) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Task type key is required.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        existingTaskType.is_system &&
        taskKey !==
          existingTaskType.task_key
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The key for a system task type cannot be changed.",
          },
          {
            status: 409,
          },
        );
      }

      if (
        taskKey !==
        existingTaskType.task_key
      ) {
        const {
          data: duplicateTaskType,
          error: duplicateTaskTypeError,
        } = await supabase
          .from("task_types")
          .select("id")
          .eq("task_key", taskKey)
          .neq("id", taskTypeId)
          .maybeSingle();

        if (duplicateTaskTypeError) {
          throw duplicateTaskTypeError;
        }

        if (duplicateTaskType) {
          return NextResponse.json(
            {
              success: false,
              error:
                "A task type with that key already exists.",
            },
            {
              status: 409,
            },
          );
        }

        updates.task_key = taskKey;
      }
    }

    if (body.description !== undefined) {
      updates.description =
        normalizeOptionalText(
          body.description,
        );
    }

    if (body.category !== undefined) {
      const category =
        typeof body.category === "string"
          ? body.category
          : "";

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

      updates.category = category;
    }

    if (
      body.defaultDueMode !== undefined
    ) {
      const defaultDueMode =
        typeof body.defaultDueMode ===
        "string"
          ? body.defaultDueMode
          : "";

      if (
        !allowedDueModes.has(
          defaultDueMode,
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Choose a valid due-date rule.",
          },
          {
            status: 400,
          },
        );
      }

      updates.default_due_mode =
        defaultDueMode;
    }

    if (
      body.defaultDueOffset !== undefined
    ) {
      const defaultDueOffset = Number(
        body.defaultDueOffset,
      );

      if (
        !Number.isInteger(
          defaultDueOffset,
        ) ||
        defaultDueOffset < 0 ||
        defaultDueOffset > 365
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The due-date offset must be a whole number from 0 to 365.",
          },
          {
            status: 400,
          },
        );
      }

      updates.default_due_offset =
        defaultDueOffset;
    }

    if (
      body.defaultAssignmentRole !==
      undefined
    ) {
      const defaultAssignmentRole =
        typeof body.defaultAssignmentRole ===
        "string"
          ? body.defaultAssignmentRole
          : "";

      if (
        !allowedAssignmentRoles.has(
          defaultAssignmentRole,
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Choose a valid assignment rule.",
          },
          {
            status: 400,
          },
        );
      }

      updates.default_assignment_role =
        defaultAssignmentRole;
    }

    if (body.isActive !== undefined) {
      if (
        typeof body.isActive !== "boolean"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Active status must be true or false.",
          },
          {
            status: 400,
          },
        );
      }

      updates.is_active = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        taskType: existingTaskType,
      });
    }

    updates.updated_at =
      new Date().toISOString();

    const { data, error } = await supabase
      .from("task_types")
      .update(updates)
      .eq("id", taskTypeId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            error:
              "A task type with that key already exists.",
          },
          {
            status: 409,
          },
        );
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      taskType: data,
    });
  } catch (error) {
    console.error(
      "Unable to update task type:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update task type.",
      },
      {
        status: 500,
      },
    );
  }
}