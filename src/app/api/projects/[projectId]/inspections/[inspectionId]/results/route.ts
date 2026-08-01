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

function cleanBoolean(
  value: unknown,
) {
  return value === true;
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

  const {
    projectId,
    inspectionId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(inspectionId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or inspection ID.",
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
    data,
    error,
  } = await supabase
    .from(
      "project_inspection_result_history",
    )
    .select(
      `
        *,
        project_inspection_result_area_history (*)
      `,
    )
    .eq("project_id", projectId)
    .eq(
      "inspection_id",
      inspectionId,
    )
    .order("created_at", {
      ascending: false,
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
    results: data ?? [],
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

  const {
    projectId,
    inspectionId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(inspectionId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or inspection ID.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    (await request.json()) as {
      resultStatus?: unknown;
      resultSummary?: unknown;
      correctionSummary?: unknown;
      inspectorName?: unknown;
      inspectorDepartment?: unknown;
      inspectionNumber?: unknown;
      completedAt?: unknown;
      reinspectionRequired?: unknown;
      reinspectionDueDate?: unknown;
      resultDocumentUrls?: unknown;
      resultPhotoUrls?: unknown;
      extractedResult?: unknown;
      extractionStatus?: unknown;
      areas?: unknown;
    };

  const resultStatus =
    cleanText(body.resultStatus);

  if (
    !resultStatus ||
    ![
      "passed",
      "partial_pass",
      "failed",
    ].includes(resultStatus)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Result must be passed, partial pass, or failed.",
      },
      {
        status: 400,
      },
    );
  }

  const areas =
    Array.isArray(body.areas)
      ? body.areas.map(
          (
            area: Record<
              string,
              unknown
            >,
          ) => ({
            area_name:
              cleanText(
                area.areaName,
              ),

            area_code:
              cleanText(
                area.areaCode,
              ),

            result_status:
              cleanText(
                area.resultStatus,
              ) ?? "not_inspected",

            work_may_continue:
              cleanBoolean(
                area.workMayContinue,
              ),

            blocked_reason:
              cleanText(
                area.blockedReason,
              ),

            correction_notes:
              cleanText(
                area.correctionNotes,
              ),

            reinspection_required:
              cleanBoolean(
                area
                  .reinspectionRequired,
              ),
          }),
        )
      : [];

  if (
    resultStatus ===
      "partial_pass" &&
    areas.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A partial pass must identify at least one project area.",
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
    data: inspection,
    error: inspectionError,
  } = await supabase
    .from("project_inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq("project_id", projectId)
    .single();

  if (
    inspectionError ||
    !inspection
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          inspectionError?.message ??
          "Inspection not found.",
      },
      {
        status: 404,
      },
    );
  }

  const extractedResult =
    body.extractedResult &&
    typeof body.extractedResult ===
      "object" &&
    !Array.isArray(
      body.extractedResult,
    )
      ? body.extractedResult
      : {};

  const extractionStatus =
    cleanText(
      body.extractionStatus,
    ) ?? "not_started";

  const { data, error } =
    await supabase.rpc(
      "record_project_inspection_result",
      {
        requested_inspection_id:
          inspectionId,

        requested_result_status:
          resultStatus,

        requested_result_summary:
          cleanText(
            body.resultSummary,
          ),

        requested_correction_summary:
          cleanText(
            body.correctionSummary,
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

        requested_completed_at:
          cleanText(
            body.completedAt,
          ) ??
          new Date().toISOString(),

        requested_reinspection_required:
          cleanBoolean(
            body.reinspectionRequired,
          ),

        requested_reinspection_due_date:
          cleanText(
            body.reinspectionDueDate,
          ),

        requested_result_document_urls:
          cleanStringArray(
            body.resultDocumentUrls,
          ),

        requested_result_photo_urls:
          cleanStringArray(
            body.resultPhotoUrls,
          ),

        requested_extracted_result:
          extractedResult,

        requested_extraction_status:
          extractionStatus,

        requested_areas:
          areas,

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
    result: data,
  });
}
