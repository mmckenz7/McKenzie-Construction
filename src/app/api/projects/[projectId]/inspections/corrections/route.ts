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

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function cleanBoolean(
  value: unknown,
  fallback = false,
) {
  return typeof value === "boolean"
    ? value
    : fallback;
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
      "inspection_corrections",
    );

  if (!featureAccess.enabled) {
    return {
      authUser: null,
      response:
        NextResponse.json(
          {
            success: false,
            error:
              "Inspection correction workflows are disabled for this account.",
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

function normalizeCorrection(
  record: Record<string, unknown>,
) {
  const inspection =
    Array.isArray(
      record.project_inspections,
    )
      ? record.project_inspections[0]
      : record.project_inspections;

  const area =
    Array.isArray(
      record.project_inspection_areas,
    )
      ? record.project_inspection_areas[0]
      : record.project_inspection_areas;

  return {
    id: String(record.id ?? ""),

    projectId: String(
      record.project_id ?? "",
    ),

    inspectionId: String(
      record.inspection_id ?? "",
    ),

    resultHistoryId:
      typeof record.result_history_id ===
      "string"
        ? record.result_history_id
        : null,

    inspectionAreaId:
      typeof record.inspection_area_id ===
      "string"
        ? record.inspection_area_id
        : null,

    correctionNumber:
      Number(
        record.correction_number ?? 0,
      ),

    title:
      String(record.title ?? ""),

    description:
      typeof record.description ===
      "string"
        ? record.description
        : null,

    correctionStatus:
      String(
        record.correction_status ??
          "open",
      ),

    priority:
      String(
        record.priority ?? "normal",
      ),

    assignedAppUserId:
      typeof record
        .assigned_app_user_id ===
      "string"
        ? record
            .assigned_app_user_id
        : null,

    assignedSubcontractorId:
      typeof record
        .assigned_subcontractor_id ===
      "string"
        ? record
            .assigned_subcontractor_id
        : null,

    assignedName:
      typeof record.assigned_name ===
      "string"
        ? record.assigned_name
        : null,

    assignedCompany:
      typeof record
        .assigned_company ===
      "string"
        ? record.assigned_company
        : null,

    assignedEmail:
      typeof record.assigned_email ===
      "string"
        ? record.assigned_email
        : null,

    assignedPhone:
      typeof record.assigned_phone ===
      "string"
        ? record.assigned_phone
        : null,

    dueDate:
      typeof record.due_date ===
      "string"
        ? record.due_date
        : null,

    workStartedAt:
      typeof record.work_started_at ===
      "string"
        ? record.work_started_at
        : null,

    workCompletedAt:
      typeof record
        .work_completed_at ===
      "string"
        ? record
            .work_completed_at
        : null,

    completionNotes:
      typeof record
        .completion_notes ===
      "string"
        ? record.completion_notes
        : null,

    completionPhotoUrls:
      Array.isArray(
        record.completion_photo_urls,
      )
        ? record.completion_photo_urls
        : [],

    completionDocumentUrls:
      Array.isArray(
        record
          .completion_document_urls,
      )
        ? record
            .completion_document_urls
        : [],

    verifiedAt:
      typeof record.verified_at ===
      "string"
        ? record.verified_at
        : null,

    verificationNotes:
      typeof record
        .verification_notes ===
      "string"
        ? record.verification_notes
        : null,

    reinspectionRequired:
      Boolean(
        record.reinspection_required,
      ),

    reinspectionRequestedAt:
      typeof record
        .reinspection_requested_at ===
      "string"
        ? record
            .reinspection_requested_at
        : null,

    reinspectionScheduledAt:
      typeof record
        .reinspection_scheduled_at ===
      "string"
        ? record
            .reinspection_scheduled_at
        : null,

    reinspectionInspectionId:
      typeof record
        .reinspection_inspection_id ===
      "string"
        ? record
            .reinspection_inspection_id
        : null,

    sourceType:
      String(
        record.source_type ??
          "contractor",
      ),

    sourceExcerpt:
      typeof record.source_excerpt ===
      "string"
        ? record.source_excerpt
        : null,

    createdAt:
      String(record.created_at ?? ""),

    updatedAt:
      String(record.updated_at ?? ""),

    inspectionName:
      inspection &&
      typeof inspection === "object"
        ? String(
            (
              inspection as Record<
                string,
                unknown
              >
            ).inspection_name ??
              "Inspection",
          )
        : "Inspection",

    inspectionStatus:
      inspection &&
      typeof inspection === "object"
        ? String(
            (
              inspection as Record<
                string,
                unknown
              >
            ).inspection_status ??
              "",
          )
        : "",

    areaName:
      area &&
      typeof area === "object"
        ? String(
            (
              area as Record<
                string,
                unknown
              >
            ).area_name ?? "",
          )
        : null,
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
    correctionsResult,
    inspectionsResult,
    summaryResult,
  ] = await Promise.all([
    supabase
      .from(
        "project_inspection_corrections",
      )
      .select(
        `
          *,
          project_inspections (
            inspection_name,
            inspection_status
          ),
          project_inspection_areas (
            area_name,
            result_status,
            work_may_continue
          )
        `,
      )
      .eq("project_id", projectId)
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("project_inspections")
      .select(
        `
          id,
          inspection_name,
          inspection_status,
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
      }),

    supabase.rpc(
      "get_project_inspection_correction_summary",
      {
        requested_project_id:
          projectId,
      },
    ),
  ]);

  if (correctionsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          correctionsResult.error
            .message,
      },
      {
        status: 500,
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

    summary:
      summaryResult.data ?? {},

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

    corrections: (
      correctionsResult.data ?? []
    ).map((record) =>
      normalizeCorrection(
        record as Record<
          string,
          unknown
        >,
      ),
    ),
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

  const body =
    (await request.json()) as {
      inspectionId?: unknown;
      resultHistoryId?: unknown;
      inspectionAreaId?: unknown;
      title?: unknown;
      description?: unknown;
      priority?: unknown;
      dueDate?: unknown;
      reinspectionRequired?: unknown;
      sourceType?: unknown;
      sourceExcerpt?: unknown;
    };

  const inspectionId =
    cleanText(body.inspectionId);

  const resultHistoryId =
    cleanText(
      body.resultHistoryId,
    );

  const inspectionAreaId =
    cleanText(
      body.inspectionAreaId,
    );

  const title =
    cleanText(body.title);

  const priority =
    cleanText(body.priority) ??
    "normal";

  const sourceType =
    cleanText(body.sourceType) ??
    "contractor";

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
    resultHistoryId &&
    !isUuid(resultHistoryId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid inspection result ID.",
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

  if (!title) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Correction title is required.",
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
      "create_project_inspection_correction",
      {
        requested_project_id:
          projectId,

        requested_inspection_id:
          inspectionId,

        requested_result_history_id:
          resultHistoryId,

        requested_inspection_area_id:
          inspectionAreaId,

        requested_title:
          title,

        requested_description:
          cleanText(body.description),

        requested_priority:
          priority,

        requested_due_date:
          cleanText(body.dueDate),

        requested_reinspection_required:
          cleanBoolean(
            body.reinspectionRequired,
            true,
          ),

        requested_source_type:
          sourceType,

        requested_source_excerpt:
          cleanText(
            body.sourceExcerpt,
          ),

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
    correction: data,
  });
}
