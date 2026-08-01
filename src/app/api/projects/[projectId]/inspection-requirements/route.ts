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

type ContractorDecision =
  | "unreviewed"
  | "required"
  | "not_required"
  | "verify_with_authority";

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
  const converted = Number(value);

  if (
    !Number.isInteger(converted) ||
    converted < 0
  ) {
    return fallback;
  }

  return converted;
}

function validDecision(
  value: unknown,
): value is ContractorDecision {
  return [
    "unreviewed",
    "required",
    "not_required",
    "verify_with_authority",
  ].includes(String(value));
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

async function loadSettings(
  projectId: string,
) {
  const supabase =
    createAdminServerClient();

  return supabase
    .from(
      "project_inspection_settings",
    )
    .select("*")
    .eq("project_id", projectId)
    .single();
}

function normalizeRequirement(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),

    projectId: String(
      record.project_id ?? "",
    ),

    inspectionSettingsId:
      String(
        record.inspection_settings_id ??
          "",
      ),

    inspectionKey:
      typeof record.inspection_key ===
      "string"
        ? record.inspection_key
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

    description:
      typeof record.description ===
      "string"
        ? record.description
        : null,

    sourceType:
      String(
        record.source_type ??
          "custom",
      ),

    researchedRequirementStatus:
      String(
        record
          .researched_requirement_status ??
          "suggested",
      ),

    contractorDecision:
      String(
        record.contractor_decision ??
          "unreviewed",
      ),

    contractorNotes:
      typeof record.contractor_notes ===
      "string"
        ? record.contractor_notes
        : null,

    sourceTitle:
      typeof record.source_title ===
      "string"
        ? record.source_title
        : null,

    sourceUrl:
      typeof record.source_url ===
      "string"
        ? record.source_url
        : null,

    sourceExcerpt:
      typeof record.source_excerpt ===
      "string"
        ? record.source_excerpt
        : null,

    sourceLastVerifiedAt:
      typeof record
        .source_last_verified_at ===
      "string"
        ? record
            .source_last_verified_at
        : null,

    sortOrder:
      Number(record.sort_order ?? 0),

    isCustom:
      Boolean(record.is_custom),

    reviewedAt:
      typeof record.reviewed_at ===
      "string"
        ? record.reviewed_at
        : null,

    createdAt:
      String(record.created_at ?? ""),

    updatedAt:
      String(record.updated_at ?? ""),
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
    requirementsResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single(),

    loadSettings(projectId),

    supabase
      .from(
        "project_inspection_requirements",
      )
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
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

  if (
    settingsResult.error ||
    !settingsResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection setup must be completed before reviewing the checklist.",
      },
      {
        status: 400,
      },
    );
  }

  if (requirementsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          requirementsResult.error
            .message,
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
    },

    settings: {
      id: settings.id,

      inspectionMode:
        settings.inspection_mode,

      inspectionsEnabled:
        settings.inspections_enabled,

      municipalityResearchEnabled:
        settings
          .municipality_research_enabled,

      governingAuthorityName:
        settings
          .governing_authority_name,

      municipality:
        settings.municipality,

      county:
        settings.county,

      stateCode:
        settings.state_code,

      researchedAt:
        settings.researched_at,

      researchSourceSummary:
        settings
          .research_source_summary,

      researchSources:
        settings.research_sources ??
        [],

      contractorVerifiedAt:
        settings
          .contractor_verified_at,

      contractorVerificationText:
        settings
          .contractor_verification_text,

      checklistLockedAt:
        settings.checklist_locked_at,
    },

    requirements: (
      requirementsResult.data ?? []
    ).map((record) =>
      normalizeRequirement(
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
      inspectionName?: unknown;
      inspectionCategory?: unknown;
      description?: unknown;
      contractorDecision?: unknown;
      contractorNotes?: unknown;
      sortOrder?: unknown;
    };

  const inspectionName =
    cleanText(body.inspectionName);

  if (!inspectionName) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection name is required.",
      },
      {
        status: 400,
      },
    );
  }

  const decision =
    body.contractorDecision ??
    "required";

  if (!validDecision(decision)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid contractor decision.",
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
    settingsResult,
    appUserResult,
  ] = await Promise.all([
    loadSettings(projectId),

    supabase
      .from("app_users")
      .select("id")
      .eq(
        "auth_user_id",
        authorization.authUser.id,
      )
      .single(),
  ]);

  if (
    settingsResult.error ||
    !settingsResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection setup must be completed first.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !settingsResult.data
      .inspections_enabled
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspections are disabled for this project.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    settingsResult.data
      .checklist_locked_at
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The verified inspection checklist is locked. Reopen the checklist before adding requirements.",
      },
      {
        status: 400,
      },
    );
  }

  const inspectionKey =
    `custom-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const {
    data,
    error,
  } = await supabase
    .from(
      "project_inspection_requirements",
    )
    .insert({
      project_id:
        projectId,

      inspection_settings_id:
        settingsResult.data.id,

      inspection_key:
        inspectionKey,

      inspection_name:
        inspectionName,

      inspection_category:
        cleanText(
          body.inspectionCategory,
        ) ?? "general",

      description:
        cleanText(body.description),

      source_type:
        "custom",

      researched_requirement_status:
        "unknown",

      contractor_decision:
        decision,

      contractor_notes:
        cleanText(
          body.contractorNotes,
        ),

      sort_order:
        cleanInteger(
          body.sortOrder,
          1000,
        ),

      is_custom:
        true,

      created_by:
        appUserResult.data?.id ??
        null,

      reviewed_by:
        decision === "unreviewed"
          ? null
          : appUserResult.data?.id ??
            null,

      reviewed_at:
        decision === "unreviewed"
          ? null
          : new Date().toISOString(),
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

    requirement:
      normalizeRequirement(
        data as Record<
          string,
          unknown
        >,
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
      requirementId?: unknown;
      contractorDecision?: unknown;
      contractorNotes?: unknown;
      inspectionName?: unknown;
      inspectionCategory?: unknown;
      description?: unknown;
      sortOrder?: unknown;
    };

  const requirementId =
    cleanText(body.requirementId);

  if (
    !isUuid(projectId) ||
    !requirementId ||
    !isUuid(requirementId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or inspection requirement ID.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.contractorDecision !==
      undefined &&
    !validDecision(
      body.contractorDecision,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid contractor decision.",
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
    settingsResult,
    requirementResult,
    appUserResult,
  ] = await Promise.all([
    loadSettings(projectId),

    supabase
      .from(
        "project_inspection_requirements",
      )
      .select("*")
      .eq("id", requirementId)
      .eq("project_id", projectId)
      .single(),

    supabase
      .from("app_users")
      .select("id")
      .eq(
        "auth_user_id",
        authorization.authUser.id,
      )
      .single(),
  ]);

  if (
    settingsResult.error ||
    !settingsResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection setup not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    settingsResult.data
      .checklist_locked_at
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The verified inspection checklist is locked.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    requirementResult.error ||
    !requirementResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection requirement not found.",
      },
      {
        status: 404,
      },
    );
  }

  const existing =
    requirementResult.data;

  const decision =
    body.contractorDecision ===
      undefined
      ? existing.contractor_decision
      : body.contractorDecision;

  const updateValues: Record<
    string,
    unknown
  > = {
    contractor_decision:
      decision,

    contractor_notes:
      cleanText(
        body.contractorNotes,
      ),

    reviewed_by:
      decision === "unreviewed"
        ? null
        : appUserResult.data?.id ??
          null,

    reviewed_at:
      decision === "unreviewed"
        ? null
        : new Date().toISOString(),
  };

  if (
    existing.is_custom &&
    body.inspectionName !==
      undefined
  ) {
    const inspectionName =
      cleanText(
        body.inspectionName,
      );

    if (!inspectionName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Inspection name is required.",
        },
        {
          status: 400,
        },
      );
    }

    updateValues.inspection_name =
      inspectionName;
  }

  if (
    existing.is_custom &&
    body.inspectionCategory !==
      undefined
  ) {
    updateValues.inspection_category =
      cleanText(
        body.inspectionCategory,
      ) ?? "general";
  }

  if (
    existing.is_custom &&
    body.description !==
      undefined
  ) {
    updateValues.description =
      cleanText(body.description);
  }

  if (
    body.sortOrder !== undefined
  ) {
    updateValues.sort_order =
      cleanInteger(
        body.sortOrder,
        existing.sort_order ?? 0,
      );
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "project_inspection_requirements",
    )
    .update(updateValues)
    .eq("id", requirementId)
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

    requirement:
      normalizeRequirement(
        data as Record<
          string,
          unknown
        >,
      ),
  });
}

export async function DELETE(
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

  const requirementId =
    request.nextUrl.searchParams.get(
      "requirementId",
    );

  if (
    !isUuid(projectId) ||
    !requirementId ||
    !isUuid(requirementId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid project or inspection requirement ID.",
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

  const settingsResult =
    await loadSettings(projectId);

  if (
    settingsResult.error ||
    !settingsResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Inspection setup not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    settingsResult.data
      .checklist_locked_at
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The verified inspection checklist is locked.",
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
      "project_inspection_requirements",
    )
    .delete()
    .eq("id", requirementId)
    .eq("project_id", projectId)
    .eq("is_custom", true)
    .select("id")
    .maybeSingle();

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

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Only custom inspection requirements can be deleted.",
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
  });
}
