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
  fallback: boolean,
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

function normalizeSettings(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),

    projectId: String(
      record.project_id ?? "",
    ),

    inspectionMode: String(
      record.inspection_mode ??
        "determine",
    ),

    inspectionsEnabled:
      Boolean(
        record.inspections_enabled,
      ),

    municipalityResearchEnabled:
      Boolean(
        record
          .municipality_research_enabled,
      ),

    scheduleDependenciesEnabled:
      Boolean(
        record
          .schedule_dependencies_enabled,
      ),

    documentExtractionEnabled:
      Boolean(
        record
          .document_extraction_enabled,
      ),

    partialPassEnabled:
      Boolean(
        record.partial_pass_enabled,
      ),

    governingAuthorityName:
      typeof record
        .governing_authority_name ===
      "string"
        ? record
            .governing_authority_name
        : null,

    governingAuthorityType:
      typeof record
        .governing_authority_type ===
      "string"
        ? record
            .governing_authority_type
        : null,

    municipality:
      typeof record.municipality ===
      "string"
        ? record.municipality
        : null,

    county:
      typeof record.county ===
      "string"
        ? record.county
        : null,

    stateCode:
      typeof record.state_code ===
      "string"
        ? record.state_code
        : null,

    permitNumber:
      typeof record.permit_number ===
      "string"
        ? record.permit_number
        : null,

    permitType:
      typeof record.permit_type ===
      "string"
        ? record.permit_type
        : null,

    projectType:
      typeof record.project_type ===
      "string"
        ? record.project_type
        : null,

    projectScopeSummary:
      typeof record
        .project_scope_summary ===
      "string"
        ? record
            .project_scope_summary
        : null,

    researchedAt:
      typeof record.researched_at ===
      "string"
        ? record.researched_at
        : null,

    researchSourceSummary:
      typeof record
        .research_source_summary ===
      "string"
        ? record
            .research_source_summary
        : null,

    researchSources:
      Array.isArray(
        record.research_sources,
      )
        ? record.research_sources
        : [],

    contractorVerifiedAt:
      typeof record
        .contractor_verified_at ===
      "string"
        ? record
            .contractor_verified_at
        : null,

    contractorVerificationText:
      typeof record
        .contractor_verification_text ===
      "string"
        ? record
            .contractor_verification_text
        : null,

    checklistLockedAt:
      typeof record
        .checklist_locked_at ===
      "string"
        ? record
            .checklist_locked_at
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

  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (
    projectError ||
    !project
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectError?.message ??
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data: settings,
    error: settingsError,
  } = await supabase
    .from(
      "project_inspection_settings",
    )
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          settingsError.message,
      },
      {
        status: 500,
      },
    );
  }

  const projectRecord =
    project as Record<
      string,
      unknown
    >;

  return NextResponse.json({
    success: true,

    project: {
      id: projectId,

      name:
        String(
          projectRecord.name ??
            projectRecord
              .project_name ??
            projectRecord.title ??
            "Project",
        ),

      address:
        String(
          projectRecord.address ??
            projectRecord
              .project_address ??
            projectRecord.job_address ??
            "",
        ),

      city:
        String(
          projectRecord.city ?? "",
        ),

      county:
        String(
          projectRecord.county ?? "",
        ),

      state:
        String(
          projectRecord.state ??
            projectRecord
              .state_code ??
            "",
        ),
    },

    settings: settings
      ? normalizeSettings(
          settings as Record<
            string,
            unknown
          >,
        )
      : null,
  });
}

export async function PUT(
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
      inspectionMode?: unknown;
      inspectionsEnabled?: unknown;
      municipalityResearchEnabled?: unknown;
      scheduleDependenciesEnabled?: unknown;
      documentExtractionEnabled?: unknown;
      partialPassEnabled?: unknown;
      governingAuthorityName?: unknown;
      governingAuthorityType?: unknown;
      municipality?: unknown;
      county?: unknown;
      stateCode?: unknown;
      permitNumber?: unknown;
      permitType?: unknown;
      projectType?: unknown;
      projectScopeSummary?: unknown;
    };

  const inspectionMode =
    cleanText(body.inspectionMode) ??
    "determine";

  if (
    ![
      "required",
      "not_required",
      "determine",
    ].includes(inspectionMode)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid inspection mode.",
      },
      {
        status: 400,
      },
    );
  }

  const authorityType =
    cleanText(
      body.governingAuthorityType,
    );

  if (
    authorityType &&
    ![
      "city",
      "county",
      "state",
      "special_district",
      "other",
    ].includes(authorityType)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid governing authority type.",
      },
      {
        status: 400,
      },
    );
  }

  const inspectionsEnabled =
    inspectionMode !==
      "not_required" &&
    cleanBoolean(
      body.inspectionsEnabled,
      true,
    );

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
    data: appUser,
  } = await supabase
    .from("app_users")
    .select("id")
    .eq(
      "auth_user_id",
      authorization.authUser.id,
    )
    .maybeSingle();

  const {
    data,
    error,
  } = await supabase
    .from(
      "project_inspection_settings",
    )
    .upsert(
      {
        project_id:
          projectId,

        inspection_mode:
          inspectionMode,

        inspections_enabled:
          inspectionsEnabled,

        municipality_research_enabled:
          inspectionsEnabled &&
          cleanBoolean(
            body
              .municipalityResearchEnabled,
            true,
          ),

        schedule_dependencies_enabled:
          inspectionsEnabled &&
          cleanBoolean(
            body
              .scheduleDependenciesEnabled,
            true,
          ),

        document_extraction_enabled:
          inspectionsEnabled &&
          cleanBoolean(
            body
              .documentExtractionEnabled,
            true,
          ),

        partial_pass_enabled:
          inspectionsEnabled &&
          cleanBoolean(
            body.partialPassEnabled,
            true,
          ),

        governing_authority_name:
          cleanText(
            body
              .governingAuthorityName,
          ),

        governing_authority_type:
          authorityType,

        municipality:
          cleanText(
            body.municipality,
          ),

        county:
          cleanText(body.county),

        state_code:
          cleanText(
            body.stateCode,
          ),

        permit_number:
          cleanText(
            body.permitNumber,
          ),

        permit_type:
          cleanText(
            body.permitType,
          ),

        project_type:
          cleanText(
            body.projectType,
          ),

        project_scope_summary:
          cleanText(
            body
              .projectScopeSummary,
          ),

        researched_by:
          appUser?.id ?? null,
      },
      {
        onConflict:
          "project_id",
      },
    )
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

  await supabase
    .from("project_activity")
    .insert({
      project_id:
        projectId,

      activity_type:
        "inspection_settings_updated",

      title:
        inspectionsEnabled
          ? "Project inspection settings updated"
          : "Project inspections disabled",

      actor_type:
        "office",

      actor_app_user_id:
        appUser?.id ?? null,

      source_table:
        "project_inspection_settings",

      source_id:
        data.id,

      metadata: {
        inspection_mode:
          inspectionMode,

        inspections_enabled:
          inspectionsEnabled,

        municipality_research_enabled:
          data
            .municipality_research_enabled,

        schedule_dependencies_enabled:
          data
            .schedule_dependencies_enabled,

        document_extraction_enabled:
          data
            .document_extraction_enabled,

        partial_pass_enabled:
          data
            .partial_pass_enabled,
      },

      occurred_at:
        new Date().toISOString(),
    });

  return NextResponse.json({
    success: true,
    settings:
      normalizeSettings(
        data as Record<
          string,
          unknown
        >,
      ),
  });
}
