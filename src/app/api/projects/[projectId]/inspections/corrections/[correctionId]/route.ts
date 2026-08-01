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

function cleanStringArray(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function PATCH(
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
      action?: unknown;
      assignedAppUserId?: unknown;
      assignedSubcontractorId?: unknown;
      assignedName?: unknown;
      assignedCompany?: unknown;
      assignedEmail?: unknown;
      assignedPhone?: unknown;
      dueDate?: unknown;
      completionNotes?: unknown;
      completionPhotoUrls?: unknown;
      completionDocumentUrls?: unknown;
      verificationNotes?: unknown;
    };

  const action =
    cleanText(body.action);

  if (
    !action ||
    ![
      "assign",
      "start",
      "complete",
      "verify",
      "reopen",
      "cancel",
      "request_reinspection",
      "schedule_reinspection",
    ].includes(action)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid correction action.",
      },
      {
        status: 400,
      },
    );
  }

  const assignedAppUserId =
    cleanText(
      body.assignedAppUserId,
    );

  const assignedSubcontractorId =
    cleanText(
      body.assignedSubcontractorId,
    );

  if (
    assignedAppUserId &&
    !isUuid(assignedAppUserId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid assigned user ID.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    assignedSubcontractorId &&
    !isUuid(
      assignedSubcontractorId,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid subcontractor ID.",
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
      "update_project_inspection_correction",
      {
        requested_correction_id:
          correctionId,

        requested_project_id:
          projectId,

        requested_action:
          action,

        requested_assigned_app_user_id:
          assignedAppUserId,

        requested_assigned_subcontractor_id:
          assignedSubcontractorId,

        requested_assigned_name:
          cleanText(
            body.assignedName,
          ),

        requested_assigned_company:
          cleanText(
            body.assignedCompany,
          ),

        requested_assigned_email:
          cleanText(
            body.assignedEmail,
          ),

        requested_assigned_phone:
          cleanText(
            body.assignedPhone,
          ),

        requested_due_date:
          cleanText(body.dueDate),

        requested_completion_notes:
          cleanText(
            body.completionNotes,
          ),

        requested_completion_photo_urls:
          cleanStringArray(
            body.completionPhotoUrls,
          ),

        requested_completion_document_urls:
          cleanStringArray(
            body
              .completionDocumentUrls,
          ),

        requested_verification_notes:
          cleanText(
            body.verificationNotes,
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
    correction: data,
  });
}
