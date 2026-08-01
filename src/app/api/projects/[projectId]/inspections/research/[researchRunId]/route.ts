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
    researchRunId: string;
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

function cleanInteger(
  value: unknown,
  fallback = 0,
) {
  const converted =
    Number(value);

  return Number.isInteger(
    converted,
  )
    ? converted
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
    researchRunId,
  } = await context.params;

  if (
    !isUuid(projectId) ||
    !isUuid(researchRunId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or research-run ID.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    (await request.json()) as {
      action?: unknown;

      sourceType?: unknown;
      sourceTitle?: unknown;
      sourceUrl?: unknown;
      sourceAuthorityName?: unknown;
      sourceExcerpt?: unknown;
      sourceNotes?: unknown;
      isPrimaryAuthoritySource?: unknown;

      sourceId?: unknown;
      findingType?: unknown;
      findingKey?: unknown;
      findingTitle?: unknown;
      findingDescription?: unknown;
      requirementStatus?: unknown;
      inspectionCategory?: unknown;
      inspectionSequence?: unknown;
      prerequisiteSummary?: unknown;
      schedulingNotes?: unknown;
      confidenceLevel?: unknown;
      sortOrder?: unknown;

      findingId?: unknown;
      reviewStatus?: unknown;
      reviewNotes?: unknown;
      modifiedTitle?: unknown;
      modifiedDescription?: unknown;
      modifiedRequirementStatus?: unknown;

      detectedMunicipality?: unknown;
      detectedCounty?: unknown;
      detectedStateCode?: unknown;
      detectedAuthorityName?: unknown;
      detectedAuthorityType?: unknown;
      confidenceNotes?: unknown;
      researchSummary?: unknown;
      failureMessage?: unknown;
    };

  const action =
    cleanText(body.action);

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
    data: run,
    error: runError,
  } = await supabase
    .from(
      "project_inspection_research_runs",
    )
    .select("*")
    .eq("id", researchRunId)
    .eq("project_id", projectId)
    .single();

  if (
    runError ||
    !run
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          runError?.message ??
          "Inspection research run not found.",
      },
      {
        status: 404,
      },
    );
  }

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

  if (action === "add_source") {
    const sourceTitle =
      cleanText(
        body.sourceTitle,
      );

    if (!sourceTitle) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Source title is required.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "project_inspection_research_sources",
      )
      .insert({
        research_run_id:
          researchRunId,

        project_id:
          projectId,

        source_type:
          cleanText(
            body.sourceType,
          ) ??
          "municipality_website",

        source_title:
          sourceTitle,

        source_url:
          cleanText(
            body.sourceUrl,
          ),

        source_authority_name:
          cleanText(
            body.sourceAuthorityName,
          ),

        source_excerpt:
          cleanText(
            body.sourceExcerpt,
          ),

        source_notes:
          cleanText(
            body.sourceNotes,
          ),

        is_primary_authority_source:
          body
            .isPrimaryAuthoritySource ===
          true,

        is_current:
          true,
      })
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

    return NextResponse.json({
      success: true,
      source: data,
    });
  }

  if (action === "add_finding") {
    const findingTitle =
      cleanText(
        body.findingTitle,
      );

    if (!findingTitle) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Finding title is required.",
        },
        {
          status: 400,
        },
      );
    }

    const sourceId =
      cleanText(body.sourceId);

    if (
      sourceId &&
      !isUuid(sourceId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid research source ID.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "project_inspection_research_findings",
      )
      .insert({
        research_run_id:
          researchRunId,

        project_id:
          projectId,

        source_id:
          sourceId,

        finding_type:
          cleanText(
            body.findingType,
          ) ??
          "inspection_requirement",

        finding_key:
          cleanText(
            body.findingKey,
          ) ??
          `finding-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,

        finding_title:
          findingTitle,

        finding_description:
          cleanText(
            body.findingDescription,
          ),

        requirement_status:
          cleanText(
            body.requirementStatus,
          ) ??
          "suggested",

        inspection_category:
          cleanText(
            body.inspectionCategory,
          ),

        inspection_sequence:
          cleanInteger(
            body.inspectionSequence,
            0,
          ),

        prerequisite_summary:
          cleanText(
            body.prerequisiteSummary,
          ),

        scheduling_notes:
          cleanText(
            body.schedulingNotes,
          ),

        confidence_level:
          cleanText(
            body.confidenceLevel,
          ) ??
          "medium",

        sort_order:
          cleanInteger(
            body.sortOrder,
            0,
          ),
      })
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

    return NextResponse.json({
      success: true,
      finding: data,
    });
  }

  if (action === "review_finding") {
    const findingId =
      cleanText(
        body.findingId,
      );

    if (
      !findingId ||
      !isUuid(findingId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid finding ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const { data, error } =
      await supabase.rpc(
        "review_project_inspection_research_finding",
        {
          requested_finding_id:
            findingId,

          requested_project_id:
            projectId,

          requested_review_status:
            cleanText(
              body.reviewStatus,
            ),

          requested_review_notes:
            cleanText(
              body.reviewNotes,
            ),

          requested_modified_title:
            cleanText(
              body.modifiedTitle,
            ),

          requested_modified_description:
            cleanText(
              body.modifiedDescription,
            ),

          requested_modified_requirement_status:
            cleanText(
              body
                .modifiedRequirementStatus,
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
      finding: data,
    });
  }

  if (action === "complete") {
    const {
      data,
      error,
    } = await supabase
      .from(
        "project_inspection_research_runs",
      )
      .update({
        research_status:
          "review_required",

        detected_municipality:
          cleanText(
            body.detectedMunicipality,
          ),

        detected_county:
          cleanText(
            body.detectedCounty,
          ),

        detected_state_code:
          cleanText(
            body.detectedStateCode,
          ),

        detected_authority_name:
          cleanText(
            body.detectedAuthorityName,
          ),

        detected_authority_type:
          cleanText(
            body.detectedAuthorityType,
          ),

        confidence_level:
          cleanText(
            body.confidenceLevel,
          ) ??
          "medium",

        confidence_notes:
          cleanText(
            body.confidenceNotes,
          ),

        research_summary:
          cleanText(
            body.researchSummary,
          ),

        completed_at:
          new Date().toISOString(),

        failure_message:
          null,
      })
      .eq("id", researchRunId)
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

    await supabase
      .from("project_activity")
      .insert({
        project_id:
          projectId,

        activity_type:
          "inspection_research_completed",

        title:
          "Municipality inspection research completed",

        actor_type:
          "office",

        actor_app_user_id:
          appUser?.id ?? null,

        source_table:
          "project_inspection_research_runs",

        source_id:
          researchRunId,

        metadata: {
          authority_name:
            data
              .detected_authority_name,

          municipality:
            data.detected_municipality,

          county:
            data.detected_county,

          state_code:
            data.detected_state_code,

          confidence_level:
            data.confidence_level,
        },

        occurred_at:
          new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      researchRun: data,
    });
  }

  if (action === "fail") {
    const failureMessage =
      cleanText(
        body.failureMessage,
      ) ??
      "Research could not be completed.";

    const {
      data,
      error,
    } = await supabase
      .from(
        "project_inspection_research_runs",
      )
      .update({
        research_status:
          "failed",

        failed_at:
          new Date().toISOString(),

        failure_message:
          failureMessage,
      })
      .eq("id", researchRunId)
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

    return NextResponse.json({
      success: true,
      researchRun: data,
    });
  }

  if (action === "apply") {
    const { data, error } =
      await supabase.rpc(
        "apply_project_inspection_research",
        {
          requested_research_run_id:
            researchRunId,

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
      application: data,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Invalid research action.",
    },
    {
      status: 400,
    },
  );
}
