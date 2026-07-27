import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET() {
  try {
    const supabase = getSupabaseClient();

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
    console.error("Unable to load tasks:", error);

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
          error: "Choose a valid task category.",
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
          error: "Choose a valid task priority.",
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
            error: "Choose a valid due date.",
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
        Number.isNaN(parsedDueDate.getTime())
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Choose a valid due date.",
          },
          {
            status: 400,
          },
        );
      }

      dueAt = parsedDueDate.toISOString();
    }

    const assignedToId =
      normalizeOptionalId(
        body.assignedToId,
      );

    const leadId = normalizeOptionalId(
      body.leadId,
    );

    const projectId = normalizeOptionalId(
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

    const now = new Date().toISOString();

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        description:
          normalizeOptionalText(
            body.description,
          ),
        category,
        task_type: "manual",
        task_type_id: taskTypeId,
        status: "open",
        priority,
        due_at: dueAt,
        assigned_to_id: assignedToId,
        assigned_at: assignedToId
          ? now
          : null,
        lead_id: leadId,
        project_id: projectId,
        customer_id: customerId,
        source_type: "manual",
        metadata: {},
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
    console.error("Unable to create task:", error);

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