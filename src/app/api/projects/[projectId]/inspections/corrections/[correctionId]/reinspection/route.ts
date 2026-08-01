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
    correctionId: string;
  }>;
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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const featureAccess =
    await checkApiFeature(
      request,
      "inspection_corrections",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection correction workflows are disabled for this account.",
      },
      {
        status: 403,
      },
    );
  }

  const {
    projectId,
    correctionId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(correctionId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or correction ID.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    (await request.json()) as {
      scheduledStartAt?: unknown;
      scheduledEndAt?: unknown;
      inspectorName?: unknown;
      inspectorDepartment?: unknown;
      inspectionNumber?: unknown;
    };

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
      "create_project_inspection_reinspection",
      {
        requested_correction_id:
          correctionId,

        requested_project_id:
          projectId,

        requested_scheduled_start_at:
          cleanText(
            body.scheduledStartAt,
          ),

        requested_scheduled_end_at:
          cleanText(
            body.scheduledEndAt,
          ),

        requested_inspector_name:
          cleanText(
            body.inspectorName,
          ),

        requested_inspector_department:
          cleanText(
            body.inspectorDepartment,
          ),

        requested_inspection_number:
          cleanText(
            body.inspectionNumber,
          ),

        requested_auth_user_id:
          authUser.id,
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
    reinspection: data,
  });
}
