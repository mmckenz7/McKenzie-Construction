import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { checkApiFeature } from "@/lib/features/server";
import { authorizeInspectionProjectRequest } from "@/lib/inspection-project-access";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function authorize(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return {
      authUser: null,
      response:
        createUnauthorizedApiResponse(
          request,
        ),
    };
  }

  const featureAccess =
    await checkApiFeature(
      request,
      "inspections",
    );

  if (!featureAccess.enabled) {
    return {
      authUser: null,
      response:
        NextResponse.json(
          {
            success: false,
            error:
              "Inspections are disabled for this account.",
          },
          {
            status: 403,
          },
        ),
    };
  }

  return {
    authUser,
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

  const projectAuthorization =
    await authorizeInspectionProjectRequest(
      request,
      projectId,
    );

  if (projectAuthorization.response) {
    return projectAuthorization.response;
  }

  const supabase =
    createAdminServerClient();

  const [
    settingsResult,
    summaryResult,
  ] = await Promise.all([
    supabase
      .from(
        "project_inspection_settings",
      )
      .select(
        `
          inspections_enabled,
          inspection_mode,
          contractor_verified_at,
          checklist_locked_at,
          workflow_activated_at
        `,
      )
      .eq("project_id", projectId)
      .maybeSingle(),

    supabase.rpc(
      "get_project_inspection_summary",
      {
        requested_project_id:
          projectId,
      },
    ),
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

  if (summaryResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          summaryResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,

    workflow: {
      inspectionsEnabled:
        settingsResult.data
          .inspections_enabled,

      inspectionMode:
        settingsResult.data
          .inspection_mode,

      contractorVerifiedAt:
        settingsResult.data
          .contractor_verified_at,

      checklistLockedAt:
        settingsResult.data
          .checklist_locked_at,

      workflowActivatedAt:
        settingsResult.data
          .workflow_activated_at,
    },

    summary:
      summaryResult.data ?? {},
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
    !authorization.authUser
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

  const projectAuthorization =
    await authorizeInspectionProjectRequest(
      request,
      projectId,
    );

  if (projectAuthorization.response) {
    return projectAuthorization.response;
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "activate_project_inspection_workflow",
      {
        requested_project_id:
          projectId,

        requested_auth_user_id:
          authorization.authUser.id,
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
    workflow: data,
  });
}
