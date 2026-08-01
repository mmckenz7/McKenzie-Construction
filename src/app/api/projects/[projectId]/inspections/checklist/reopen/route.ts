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
      "inspections",
    );

  if (!featureAccess.enabled) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspections are disabled for this account.",
      },
      {
        status: 403,
      },
    );
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
      reason?: unknown;
    };

  const reason =
    typeof body.reason === "string"
      ? body.reason.trim()
      : "";

  if (!reason) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A reason is required to reopen the checklist.",
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
      "reopen_project_inspection_checklist",
      {
        requested_project_id:
          projectId,

        requested_reason:
          reason,

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
    result: data,
  });
}
