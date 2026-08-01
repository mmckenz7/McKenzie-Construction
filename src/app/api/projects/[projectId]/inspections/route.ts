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

function normalizeInspection(
  record: Record<string, unknown>,
) {
  const areas =
    Array.isArray(
      record.project_inspection_areas,
    )
      ? record.project_inspection_areas
      : [];

  return {
    id: String(record.id ?? ""),

    projectId: String(
      record.project_id ?? "",
    ),

    requirementId:
      typeof record.requirement_id ===
      "string"
        ? record.requirement_id
        : null,

    inspectionName:
      String(
        record.inspection_name ??
          "Inspection",
      ),

    inspectionCategory:
      String(
        record.inspection_category ??
          "general",
      ),

    inspectionStatus:
      String(
        record.inspection_status ??
          "not_scheduled",
      ),

    requestedAt:
      typeof record.requested_at ===
      "string"
        ? record.requested_at
        : null,

    scheduledStartAt:
      typeof record
        .scheduled_start_at ===
      "string"
        ? record
            .scheduled_start_at
        : null,

    scheduledEndAt:
      typeof record
        .scheduled_end_at ===
      "string"
        ? record
            .scheduled_end_at
        : null,

    completedAt:
      typeof record.completed_at ===
      "string"
        ? record.completed_at
        : null,

    inspectorName:
      typeof record.inspector_name ===
      "string"
        ? record.inspector_name
        : null,

    inspectorDepartment:
      typeof record
        .inspector_department ===
      "string"
        ? record
            .inspector_department
        : null,

    inspectionNumber:
      typeof record
        .inspection_number ===
      "string"
        ? record.inspection_number
        : null,

    permitNumber:
      typeof record.permit_number ===
      "string"
        ? record.permit_number
        : null,

    resultSummary:
      typeof record.result_summary ===
      "string"
        ? record.result_summary
        : null,

    correctionSummary:
      typeof record
        .correction_summary ===
      "string"
        ? record.correction_summary
        : null,

    reinspectionRequired:
      Boolean(
        record.reinspection_required,
      ),

    reinspectionDueDate:
      typeof record
        .reinspection_due_date ===
      "string"
        ? record
            .reinspection_due_date
        : null,

    contractorResultVerifiedAt:
      typeof record
        .contractor_result_verified_at ===
      "string"
        ? record
            .contractor_result_verified_at
        : null,

    extractionStatus:
      String(
        record.extraction_status ??
          "not_started",
      ),

    extractedResult:
      record.extracted_result &&
      typeof record.extracted_result ===
        "object"
        ? record.extracted_result
        : {},

    resultDocumentUrls:
      Array.isArray(
        record.result_document_urls,
      )
        ? record.result_document_urls
        : [],

    resultPhotoUrls:
      Array.isArray(
        record.result_photo_urls,
      )
        ? record.result_photo_urls
        : [],

    scheduleBlockingEnabled:
      Boolean(
        record
          .schedule_blocking_enabled,
      ),

    sortOrder:
      Number(record.sort_order ?? 0),

    areas: areas.map(
      (
        area: Record<
          string,
          unknown
        >,
      ) => ({
        id: String(area.id ?? ""),

        areaName:
          String(
            area.area_name ?? "Area",
          ),

        areaCode:
          typeof area.area_code ===
          "string"
            ? area.area_code
            : null,

        resultStatus:
          String(
            area.result_status ??
              "pending",
          ),

        workMayContinue:
          Boolean(
            area.work_may_continue,
          ),

        blockedReason:
          typeof area.blocked_reason ===
          "string"
            ? area.blocked_reason
            : null,

        correctionNotes:
          typeof area
            .correction_notes ===
          "string"
            ? area.correction_notes
            : null,

        reinspectionRequired:
          Boolean(
            area.reinspection_required,
          ),
      }),
    ),
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
    projectResult,
    settingsResult,
    inspectionsResult,
    summaryResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single(),

    supabase
      .from(
        "project_inspection_settings",
      )
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle(),

    supabase
      .from("project_inspections")
      .select(
        `
          *,
          project_inspection_areas (*)
        `,
      )
      .eq("project_id", projectId)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      }),

    supabase.rpc(
      "get_project_inspection_summary",
      {
        requested_project_id:
          projectId,
      },
    ),
  ]);

  if (
    projectResult.error ||
    !projectResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectResult.error?.message ??
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

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

  if (inspectionsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          inspectionsResult.error.message,
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

  const project =
    projectResult.data as Record<
      string,
      unknown
    >;

  return NextResponse.json({
    success: true,

    project: {
      id: projectId,

      name: String(
        project.name ??
          project.project_name ??
          project.title ??
          "Project",
      ),

      address: String(
        project.address ??
          project.project_address ??
          project.job_address ??
          "",
      ),
    },

    settings:
      settingsResult.data
        ? {
            inspectionsEnabled:
              settingsResult.data
                .inspections_enabled,

            workflowActivatedAt:
              settingsResult.data
                .workflow_activated_at,

            documentExtractionEnabled:
              settingsResult.data
                .document_extraction_enabled,

            partialPassEnabled:
              settingsResult.data
                .partial_pass_enabled,

            scheduleDependenciesEnabled:
              settingsResult.data
                .schedule_dependencies_enabled,
          }
        : null,

    summary:
      summaryResult.data ?? {},

    inspections: (
      inspectionsResult.data ?? []
    ).map((record) =>
      normalizeInspection(
        record as Record<
          string,
          unknown
        >,
      ),
    ),
  });
}

export async function PATCH(
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

  const body =
    (await request.json()) as {
      inspectionId?: unknown;
      action?: unknown;
      scheduledStartAt?: unknown;
      scheduledEndAt?: unknown;
      inspectorName?: unknown;
      inspectorDepartment?: unknown;
      inspectionNumber?: unknown;
    };

  const inspectionId =
    cleanText(body.inspectionId);

  const action =
    cleanText(body.action);

  if (
    !isUuid(projectId) ||
    !inspectionId ||
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

  if (
    !action ||
    ![
      "request",
      "schedule",
      "reschedule",
      "cancel",
      "reset",
    ].includes(action)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid inspection action.",
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
    inspectionResult,
    appUserResult,
  ] = await Promise.all([
    supabase
      .from("project_inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("project_id", projectId)
      .single(),

    supabase
      .from("app_users")
      .select("id")
      .eq(
        "auth_user_id",
        authorization.authUser.id,
      )
      .maybeSingle(),
  ]);

  if (
    inspectionResult.error ||
    !inspectionResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          inspectionResult.error
            ?.message ??
          "Inspection not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    [
      "passed",
      "partial_pass",
      "failed",
    ].includes(
      inspectionResult.data
        .inspection_status,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "An inspection with a recorded result cannot be rescheduled or reset.",
      },
      {
        status: 400,
      },
    );
  }

  const now =
    new Date().toISOString();

  const scheduledStartAt =
    cleanText(
      body.scheduledStartAt,
    );

  if (
    [
      "schedule",
      "reschedule",
    ].includes(action) &&
    !scheduledStartAt
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A scheduled date and time are required.",
      },
      {
        status: 400,
      },
    );
  }

  const updateValues: Record<
    string,
    unknown
  > =
    action === "request"
      ? {
          inspection_status:
            "requested",

          requested_at: now,
        }
      : action === "schedule"
        ? {
            inspection_status:
              "scheduled",

            requested_at:
              inspectionResult.data
                .requested_at ?? now,

            scheduled_start_at:
              scheduledStartAt,

            scheduled_end_at:
              cleanText(
                body.scheduledEndAt,
              ),

            inspector_name:
              cleanText(
                body.inspectorName,
              ),

            inspector_department:
              cleanText(
                body
                  .inspectorDepartment,
              ),

            inspection_number:
              cleanText(
                body.inspectionNumber,
              ),
          }
        : action === "reschedule"
          ? {
              inspection_status:
                "rescheduled",

              scheduled_start_at:
                scheduledStartAt,

              scheduled_end_at:
                cleanText(
                  body.scheduledEndAt,
                ),

              inspector_name:
                cleanText(
                  body.inspectorName,
                ),

              inspector_department:
                cleanText(
                  body
                    .inspectorDepartment,
                ),

              inspection_number:
                cleanText(
                  body.inspectionNumber,
                ),
            }
          : action === "cancel"
            ? {
                inspection_status:
                  "cancelled",

                scheduled_start_at:
                  null,

                scheduled_end_at:
                  null,
              }
            : {
                inspection_status:
                  "not_scheduled",

                requested_at:
                  null,

                scheduled_start_at:
                  null,

                scheduled_end_at:
                  null,

                inspector_name:
                  null,

                inspector_department:
                  null,

                inspection_number:
                  null,
              };

  updateValues.updated_at = now;

  const {
    data,
    error,
  } = await supabase
    .from("project_inspections")
    .update(updateValues)
    .eq("id", inspectionId)
    .eq("project_id", projectId)
    .select("*")
    .single();

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

  const activityType =
    action === "request"
      ? "inspection_requested"
      : action === "schedule"
        ? "inspection_scheduled"
        : action === "reschedule"
          ? "inspection_rescheduled"
          : action === "cancel"
            ? "inspection_cancelled"
            : "inspection_settings_updated";

  await supabase
    .from("project_activity")
    .insert({
      project_id:
        projectId,

      activity_type:
        activityType,

      title:
        action === "request"
          ? `${data.inspection_name} requested`
          : action === "schedule"
            ? `${data.inspection_name} scheduled`
            : action === "reschedule"
              ? `${data.inspection_name} rescheduled`
              : action === "cancel"
                ? `${data.inspection_name} cancelled`
                : `${data.inspection_name} reset`,

      actor_type:
        "office",

      actor_app_user_id:
        appUserResult.data?.id ??
        null,

      source_table:
        "project_inspections",

      source_id:
        inspectionId,

      metadata: {
        action,

        scheduled_start_at:
          data.scheduled_start_at,

        scheduled_end_at:
          data.scheduled_end_at,

        inspector_name:
          data.inspector_name,

        inspector_department:
          data.inspector_department,

        inspection_number:
          data.inspection_number,
      },

      occurred_at: now,
    });

  return NextResponse.json({
    success: true,

    inspection:
      normalizeInspection(
        data as Record<
          string,
          unknown
        >,
      ),
  });
}
