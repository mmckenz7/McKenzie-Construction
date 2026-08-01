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
      "inspection_municipality_research",
    );

  if (!featureAccess.enabled) {
    return {
      authUser: null,
      response:
        NextResponse.json(
          {
            success: false,
            error:
              "Municipality inspection research is disabled for this account.",
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
    projectResult,
    settingsResult,
    runsResult,
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
      .from(
        "project_inspection_research_runs",
      )
      .select(
        `
          *,
          project_inspection_research_sources (
            id,
            source_type,
            source_title,
            source_url,
            source_authority_name,
            source_accessed_at,
            source_excerpt,
            source_notes,
            is_primary_authority_source,
            is_current
          ),
          project_inspection_research_findings (
            id,
            source_id,
            finding_type,
            finding_key,
            finding_title,
            finding_description,
            requirement_status,
            inspection_category,
            inspection_sequence,
            prerequisite_summary,
            scheduling_notes,
            contact_name,
            contact_phone,
            contact_email,
            confidence_level,
            contractor_review_status,
            contractor_review_notes,
            applied_requirement_id,
            applied_at,
            sort_order
          )
        `,
      )
      .eq("project_id", projectId)
      .order("created_at", {
        ascending: false,
      }),
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

  if (runsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          runsResult.error.message,
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

  const settings =
    settingsResult.data;

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

      city: String(
        project.city ?? "",
      ),

      county: String(
        project.county ?? "",
      ),

      stateCode: String(
        project.state_code ??
          project.state ??
          "",
      ),

      postalCode: String(
        project.postal_code ??
          project.zip ??
          project.zip_code ??
          "",
      ),
    },

    settings: settings
      ? {
          inspectionsEnabled:
            settings
              .inspections_enabled,

          municipalityResearchEnabled:
            settings
              .municipality_research_enabled,

          municipality:
            settings.municipality,

          county:
            settings.county,

          stateCode:
            settings.state_code,

          governingAuthorityName:
            settings
              .governing_authority_name,

          governingAuthorityType:
            settings
              .governing_authority_type,

          projectType:
            settings.project_type,

          permitType:
            settings.permit_type,

          projectScopeSummary:
            settings
              .project_scope_summary,

          checklistLockedAt:
            settings
              .checklist_locked_at,
        }
      : null,

    researchRuns:
      runsResult.data ?? [],
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
      address?: unknown;
      city?: unknown;
      county?: unknown;
      stateCode?: unknown;
      postalCode?: unknown;
      municipality?: unknown;
      authorityName?: unknown;
      authorityType?: unknown;
      projectType?: unknown;
      permitType?: unknown;
      scopeSummary?: unknown;
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
      "create_project_inspection_research_run",
      {
        requested_project_id:
          projectId,

        requested_address:
          cleanText(body.address),

        requested_city:
          cleanText(body.city),

        requested_county:
          cleanText(body.county),

        requested_state_code:
          cleanText(body.stateCode),

        requested_postal_code:
          cleanText(body.postalCode),

        requested_municipality:
          cleanText(body.municipality),

        requested_authority_name:
          cleanText(body.authorityName),

        requested_authority_type:
          cleanText(body.authorityType),

        requested_project_type:
          cleanText(body.projectType),

        requested_permit_type:
          cleanText(body.permitType),

        requested_scope_summary:
          cleanText(body.scopeSummary),

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
    researchRun: data,
  });
}
