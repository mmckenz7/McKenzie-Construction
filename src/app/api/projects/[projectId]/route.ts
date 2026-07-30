import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import {
  projectManagerIsRequired,
  validateActiveAssignee,
  type CompanyAssignmentSettings,
} from "@/lib/crm/assignment";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedProjectStatuses = new Set([
  "planning",
  "scheduled",
  "in_progress",
  "on_hold",
  "completed",
  "canceled",
]);

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type UpdateProjectBody = {
  projectName?: unknown;
  projectType?: unknown;
  description?: unknown;
  propertyAddress?: unknown;
  status?: unknown;
  projectManagerId?: unknown;
  estimatedValue?: unknown;
  contractValue?: unknown;
  startDate?: unknown;
  targetCompletionDate?: unknown;
  notes?: unknown;
};

type ProjectRecord = {
  id: string;
  customer_id: string;
  project_name: string;
  project_type: string | null;
  description: string | null;
  property_address: string | null;
  status: string;
  project_manager_id: string | null;
  estimated_value: number | null;
  contract_value: number | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const projectSelect = `
  id,
  customer_id,
  project_name,
  project_type,
  description,
  property_address,
  status,
  project_manager_id,
  estimated_value,
  contract_value,
  start_date,
  target_completion_date,
  completed_at,
  notes,
  metadata,
  created_at,
  updated_at
`;

function cleanText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function optionalText(
  value: unknown,
): string | null | undefined {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  return value.trim() || null;
}

function optionalDate(
  value: unknown,
): string | null | undefined {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const cleaned =
    value.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      cleaned,
    )
  ) {
    return undefined;
  }

  const date =
    new Date(
      `${cleaned}T00:00:00Z`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    ) ||
    date
      .toISOString()
      .slice(0, 10) !==
      cleaned
  ) {
    return undefined;
  }

  return cleaned;
}

function optionalMoney(
  value: unknown,
): number | null | undefined {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value ===
          "string"
        ? Number(
            value.replace(
              /[$,\s]/g,
              "",
            ),
          )
        : Number.NaN;

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return undefined;
  }

  return (
    Math.round(
      parsed * 100,
    ) / 100
  );
}

function normalizeMetadata(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

async function loadCompanySettings(
  supabase: ReturnType<
    typeof createAdminServerClient
  >,
): Promise<CompanyAssignmentSettings> {
  const {
    data,
    error,
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
    error ||
    !data
  ) {
    throw new Error(
      error?.message ??
        "Company assignment settings could not be loaded.",
    );
  }

  return data as CompanyAssignmentSettings;
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

  const {
    projectId: rawProjectId,
  } = await context.params;

  const projectId =
    rawProjectId.trim();

  if (!projectId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid project ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    projectResult,
    tasksResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(projectSelect)
      .eq("id", projectId)
      .maybeSingle(),

    supabase
      .from("tasks")
      .select(
        `
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
        `,
      )
      .eq(
        "project_id",
        projectId,
      )
      .order(
        "due_at",
        {
          ascending: true,
          nullsFirst: false,
        },
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      ),
  ]);

  if (projectResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!projectResult.data) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (tasksResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          tasksResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    project:
      projectResult.data,
    tasks:
      tasksResult.data ?? [],
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

  const {
    projectId: rawProjectId,
  } = await context.params;

  const projectId =
    rawProjectId.trim();

  if (!projectId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid project ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  let body: UpdateProjectBody;

  try {
    body =
      (await request.json()) as UpdateProjectBody;
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
    data: existingProject,
    error: projectReadError,
  } = await supabase
    .from("projects")
    .select(projectSelect)
    .eq("id", projectId)
    .maybeSingle();

  if (projectReadError) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectReadError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!existingProject) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  const project =
    existingProject as ProjectRecord;

  const updates: Record<
    string,
    unknown
  > = {};

  if (
    body.projectName !==
    undefined
  ) {
    const projectName =
      cleanText(
        body.projectName,
      );

    if (!projectName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The project name is required.",
        },
        {
          status: 400,
        },
      );
    }

    updates.project_name =
      projectName;
  }

  if (
    body.projectType !==
    undefined
  ) {
    const projectType =
      optionalText(
        body.projectType,
      );

    if (
      projectType ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid project type.",
        },
        {
          status: 400,
        },
      );
    }

    updates.project_type =
      projectType;
  }

  if (
    body.description !==
    undefined
  ) {
    const description =
      optionalText(
        body.description,
      );

    if (
      description ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid project description.",
        },
        {
          status: 400,
        },
      );
    }

    updates.description =
      description;
  }

  if (
    body.propertyAddress !==
    undefined
  ) {
    const propertyAddress =
      optionalText(
        body.propertyAddress,
      );

    if (
      propertyAddress ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid property address.",
        },
        {
          status: 400,
        },
      );
    }

    updates.property_address =
      propertyAddress;
  }

  if (
    body.estimatedValue !==
    undefined
  ) {
    const estimatedValue =
      optionalMoney(
        body.estimatedValue,
      );

    if (
      estimatedValue ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Estimated value must be a valid non-negative number.",
        },
        {
          status: 400,
        },
      );
    }

    updates.estimated_value =
      estimatedValue;
  }

  if (
    body.contractValue !==
    undefined
  ) {
    const contractValue =
      optionalMoney(
        body.contractValue,
      );

    if (
      contractValue ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Contract value must be a valid non-negative number.",
        },
        {
          status: 400,
        },
      );
    }

    updates.contract_value =
      contractValue;
  }

  if (
    body.startDate !==
    undefined
  ) {
    const startDate =
      optionalDate(
        body.startDate,
      );

    if (
      startDate ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The start date must use the YYYY-MM-DD format.",
        },
        {
          status: 400,
        },
      );
    }

    updates.start_date =
      startDate;
  }

  if (
    body.targetCompletionDate !==
    undefined
  ) {
    const targetDate =
      optionalDate(
        body.targetCompletionDate,
      );

    if (
      targetDate ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The target completion date must use the YYYY-MM-DD format.",
        },
        {
          status: 400,
        },
      );
    }

    updates.target_completion_date =
      targetDate;
  }

  const effectiveStartDate =
    updates.start_date !==
    undefined
      ? (updates.start_date as
          | string
          | null)
      : project.start_date;

  const effectiveTargetDate =
    updates.target_completion_date !==
    undefined
      ? (updates.target_completion_date as
          | string
          | null)
      : project.target_completion_date;

  if (
    effectiveStartDate &&
    effectiveTargetDate &&
    effectiveTargetDate <
      effectiveStartDate
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The target completion date cannot be before the start date.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.notes !== undefined
  ) {
    const notes =
      optionalText(body.notes);

    if (
      notes === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid project notes.",
        },
        {
          status: 400,
        },
      );
    }

    updates.notes = notes;
  }

  if (
    body.projectManagerId !==
    undefined
  ) {
    const requestedManagerId =
      optionalText(
        body.projectManagerId,
      );

    if (
      requestedManagerId ===
      undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid project manager selection.",
        },
        {
          status: 400,
        },
      );
    }

    let companySettings:
      CompanyAssignmentSettings;

    try {
      companySettings =
        await loadCompanySettings(
          supabase,
        );
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Company assignment settings could not be loaded.",
        },
        {
          status: 500,
        },
      );
    }

    let activeManagerId:
      | string
      | null = null;

    if (
      requestedManagerId
    ) {
      try {
        activeManagerId =
          await validateActiveAssignee(
            supabase,
            requestedManagerId,
          );
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "The project manager could not be validated.",
          },
          {
            status: 500,
          },
        );
      }

      if (!activeManagerId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Only active employees can be assigned as project managers.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (
      !activeManagerId &&
      projectManagerIsRequired(
        companySettings,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A project manager is required for this project.",
        },
        {
          status: 400,
        },
      );
    }

    updates.project_manager_id =
      activeManagerId;
  }

  if (
    body.status !==
    undefined
  ) {
    const status =
      cleanText(body.status);

    if (
      !allowedProjectStatuses.has(
        status,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Choose a valid project status.",
        },
        {
          status: 400,
        },
      );
    }

    updates.status = status;

    if (
      status ===
      "completed"
    ) {
      updates.completed_at =
        project.completed_at ??
        new Date().toISOString();
    } else {
      updates.completed_at =
        null;
    }
  }

  const metadata = {
    ...normalizeMetadata(
      project.metadata,
    ),
    last_updated_by:
      "project_detail_api",
    last_updated_by_auth_user_id:
      user.id,
    last_updated_at:
      new Date().toISOString(),
  };

  updates.metadata =
    metadata;

  const {
    data: updatedProject,
    error: updateError,
  } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .select(projectSelect)
    .single();

  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        error:
          updateError.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    project:
      updatedProject,
  });
}