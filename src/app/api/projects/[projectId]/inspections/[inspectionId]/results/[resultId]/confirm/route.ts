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
    inspectionId: string;
    resultId: string;
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

  const {
    projectId,
    inspectionId,
    resultId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(inspectionId) ||
    !isUuid(resultId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project, inspection, or result ID.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    (await request.json()) as {
      confirmedResultStatus?: unknown;
      confirmationNotes?: unknown;
    };

  const confirmedResultStatus =
    cleanText(
      body.confirmedResultStatus,
    );

  if (
    !confirmedResultStatus ||
    ![
      "passed",
      "partial_pass",
      "failed",
    ].includes(
      confirmedResultStatus,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Confirmed result must be passed, partial pass, or failed.",
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

  const {
    data: resultRecord,
    error: resultError,
  } = await supabase
    .from(
      "project_inspection_result_history",
    )
    .select("id")
    .eq("id", resultId)
    .eq(
      "inspection_id",
      inspectionId,
    )
    .eq("project_id", projectId)
    .single();

  if (
    resultError ||
    !resultRecord
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          resultError?.message ??
          "Inspection result not found.",
      },
      {
        status: 404,
      },
    );
  }

  const { data, error } =
    await supabase.rpc(
      "confirm_project_inspection_result",
      {
        requested_inspection_id:
          inspectionId,

        requested_result_history_id:
          resultId,

        requested_confirmed_result_status:
          confirmedResultStatus,

        requested_confirmation_notes:
          cleanText(
            body.confirmationNotes,
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
    confirmation: data,
  });
}
