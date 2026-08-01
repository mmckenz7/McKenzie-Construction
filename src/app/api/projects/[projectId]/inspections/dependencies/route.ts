import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import { checkApiFeature } from "@/lib/features/server";
import { authorizeInspectionProjectRequest } from "@/lib/inspection-project-access";
import {
  taskBelongsToProject,
} from "@/lib/inspection-task-dependencies";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type InspectionDependencyRow = {
  dependency_id: string;
  inspection_id: string;
  inspection_name: string;
  inspection_status: string;
  inspection_area_id: string | null;
  inspection_area_name: string | null;
  task_id: string;
  dependency_type: string;
  is_blocking: boolean;
  released_at: string | null;
  blocked_reason: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

async function authorize(
  request: NextRequest,
) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return {
      access: null,
      response:
        createUnauthorizedApiResponse(
          request,
        ),
    };
  }

  const featureAccess =
    await checkApiFeature(
      request,
      "inspection_schedule_dependencies",
    );

  if (!featureAccess.enabled) {
    return {
      access: null,
      response:
        NextResponse.json(
          {
            success: false,
            error:
              "Inspection schedule dependencies are disabled for this account.",
          },
          {
            status: 403,
          },
        ),
    };
  }

  return {
    access,
    response: null,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
  }

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const projectAuthorization =
    await authorizeInspectionProjectRequest(
      request,
      projectId,
    );

  if (projectAuthorization.response) {
    return projectAuthorization.response;
  }

  const [
    settingsResult,
    inspectionsResult,
    dependenciesResult,
    tasksResult,
  ] = await Promise.all([
    supabase
      .from(
        "project_inspection_settings",
      )
      .select(
        `
          inspections_enabled,
          schedule_dependencies_enabled,
          workflow_activated_at
        `,
      )
      .eq("project_id", projectId)
      .maybeSingle(),

    supabase
      .from("project_inspections")
      .select(
        `
          id,
          inspection_name,
          inspection_status,
          sort_order,
          project_inspection_areas (
            id,
            area_name,
            result_status,
            work_may_continue
          )
        `,
      )
      .eq("project_id", projectId)
      .order("sort_order", {
        ascending: true,
      })
      .order("inspection_name", {
        ascending: true,
      }),

    supabase.rpc(
      "get_project_inspection_dependencies",
      {
        requested_project_id:
          projectId,
      },
    ),

    supabase
      .from("tasks")
      .select(
        `
          id,
          title,
          status,
          due_at,
          project_id
        `,
      )
      .eq("project_id", projectId)
      .order("due_at", {
        ascending: true,
        nullsFirst: false,
      })
      .order("title", {
        ascending: true,
      }),
  ]);

  if (settingsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          settingsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!settingsResult.data) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection setup has not been completed.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    !settingsResult.data
      .inspections_enabled
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspections are disabled for this project.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !settingsResult.data
      .schedule_dependencies_enabled
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection schedule dependencies are disabled for this project.",
      },
      {
        status: 400,
      },
    );
  }

  if (inspectionsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          inspectionsResult.error
            .message,
      },
      {
        status: 500,
      },
    );
  }

  if (dependenciesResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          dependenciesResult.error
            .message,
      },
      {
        status: 500,
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

    workflowActivatedAt:
      settingsResult.data
        .workflow_activated_at,

    inspections: (
      inspectionsResult.data ?? []
    ).map((inspection) => ({
      id: inspection.id,

      inspectionName:
        inspection.inspection_name,

      inspectionStatus:
        inspection.inspection_status,

      areas: Array.isArray(
        inspection
          .project_inspection_areas,
      )
        ? inspection
            .project_inspection_areas
            .map((area) => ({
              id: area.id,

              areaName:
                area.area_name,

              resultStatus:
                area.result_status,

              workMayContinue:
                area
                  .work_may_continue,
            }))
        : [],
    })),

    scheduleTasks: (
      tasksResult.data ?? []
    ).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.due_at,
    })),

    dependencies: (
      (dependenciesResult.data ?? []) as InspectionDependencyRow[]
    ).map((dependency) => ({
      dependencyId:
        dependency.dependency_id,

      inspectionId:
        dependency.inspection_id,

      inspectionName:
        dependency.inspection_name,

      inspectionStatus:
        dependency.inspection_status,

      inspectionAreaId:
        dependency
          .inspection_area_id,

      inspectionAreaName:
        dependency
          .inspection_area_name,

      taskId:
        dependency.task_id,

      dependencyType:
        dependency.dependency_type,

      isBlocking:
        dependency.is_blocking,

      releasedAt:
        dependency.released_at,

      blockedReason:
        dependency.blocked_reason,
    })),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (
    authorization.response ||
    !authorization.access
  ) {
    return authorization.response;
  }

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    (await request.json()) as {
      inspectionId?: unknown;
      inspectionAreaId?: unknown;
      taskId?: unknown;
      dependencyType?: unknown;
      action?: unknown;
    };

  const action =
    cleanText(body.action) ??
    "create";

  const supabase =
    createAdminServerClient();

  const projectAuthorization =
    await authorizeInspectionProjectRequest(
      request,
      projectId,
    );

  if (projectAuthorization.response) {
    return projectAuthorization.response;
  }

  if (action === "refresh") {
    const { data, error } =
      await supabase.rpc(
        "refresh_project_inspection_dependencies",
        {
          requested_project_id:
            projectId,

          requested_auth_user_id:
            authorization.access.user.id,
        },
      );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json({
      success: true,
      refresh: data,
    });
  }

  const inspectionId =
    cleanText(body.inspectionId);

  const inspectionAreaId =
    cleanText(
      body.inspectionAreaId,
    );

  const taskId =
    cleanText(body.taskId);

  const dependencyType =
    cleanText(
      body.dependencyType,
    );

  if (
    !inspectionId ||
    !isUuid(inspectionId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid inspection is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    inspectionAreaId &&
    !isUuid(inspectionAreaId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid inspection area ID.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !taskId ||
    !isUuid(taskId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid schedule task ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !dependencyType ||
    ![
      "must_pass_before_start",
      "must_be_scheduled_before_start",
      "area_release_required",
    ].includes(dependencyType)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid inspection dependency type.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    dependencyType ===
      "area_release_required" &&
    !inspectionAreaId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "An inspection area is required for an area-release dependency.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    data: task,
    error: taskError,
  } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The selected project task could not be validated.",
      },
      {
        status: 500,
      },
    );
  }

  if (!taskBelongsToProject(task, projectId)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project task not found.",
      },
      {
        status: 404,
      },
    );
  }

  let duplicateQuery =
    supabase
      .from(
        "project_inspection_task_dependencies",
      )
      .select("id")
      .eq("project_id", projectId)
      .eq(
        "inspection_id",
        inspectionId,
      )
      .eq("task_id", taskId)
      .eq(
        "dependency_type",
        dependencyType,
      );

  duplicateQuery = inspectionAreaId
    ? duplicateQuery.eq(
        "inspection_area_id",
        inspectionAreaId,
      )
    : duplicateQuery.is(
        "inspection_area_id",
        null,
      );

  const {
    data: duplicateDependencies,
    error: duplicateError,
  } = await duplicateQuery.limit(1);

  if (duplicateError) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The dependency could not be validated.",
      },
      {
        status: 500,
      },
    );
  }

  if (duplicateDependencies.length) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This inspection dependency already exists.",
      },
      {
        status: 409,
      },
    );
  }

  const { data, error } =
    await supabase.rpc(
      "set_project_inspection_task_dependency",
      {
        requested_project_id:
          projectId,

        requested_inspection_id:
          inspectionId,

        requested_inspection_area_id:
          inspectionAreaId,

        requested_task_id:
          taskId,

        requested_dependency_type:
          dependencyType,

        requested_auth_user_id:
          authorization.access.user.id,
      },
    );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
    dependency: data,
  });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (
    authorization.response ||
    !authorization.access
  ) {
    return authorization.response;
  }

  const { projectId } =
    await context.params;

  const dependencyId =
    request.nextUrl.searchParams.get(
      "dependencyId",
    );

  const reason =
    request.nextUrl.searchParams.get(
      "reason",
    );

  if (
    !isUuid(projectId) ||
    !dependencyId ||
    !isUuid(dependencyId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or dependency ID.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const projectAuthorization =
    await authorizeInspectionProjectRequest(
      request,
      projectId,
    );

  if (projectAuthorization.response) {
    return projectAuthorization.response;
  }

  const { data, error } =
    await supabase.rpc(
      "remove_project_inspection_task_dependency",
      {
        requested_dependency_id:
          dependencyId,

        requested_project_id:
          projectId,

        requested_reason:
          reason,

        requested_auth_user_id:
          authorization.access.user.id,
      },
    );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
    result: data,
  });
}
