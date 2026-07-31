import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type CreateRequestBody = {
  projectId?: string;
  subcontractorId?: string;
  language?: "en" | "es";
  expiresInDays?: number;
};

function normalizeProject(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    name:
      String(
        record.name ??
          record.project_name ??
          record.title ??
          "Unnamed project",
      ),
    address:
      String(
        record.address ??
          record.project_address ??
          record.job_address ??
          "",
      ),
  };
}

function normalizeTeamMember(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    name:
      String(
        record.name ??
          record.display_name ??
          "Unnamed subcontractor",
      ),
    email:
      record.email
        ? String(record.email)
        : null,
    phone:
      record.phone
        ? String(record.phone)
        : null,
    roles: Array.isArray(record.roles)
      ? record.roles.map(String)
      : [],
  };
}

export async function GET(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    projectsResult,
    teamResult,
    requestsResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("team_members")
      .select("*")
      .order("name", {
        ascending: true,
      }),

    supabase
      .from(
        "subcontractor_schedule_requests",
      )
      .select(`
        *,
        projects (*),
        team_members (*)
      `)
      .order("created_at", {
        ascending: false,
      })
      .limit(100),
  ]);

  if (projectsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (teamResult.error) {
    return NextResponse.json(
      {
        success: false,
        error: teamResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (requestsResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          requestsResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  const projects = (
    projectsResult.data ?? []
  ).map((record) =>
    normalizeProject(
      record as Record<string, unknown>,
    ),
  );

  const subcontractors = (
    teamResult.data ?? []
  )
    .map((record) =>
      normalizeTeamMember(
        record as Record<string, unknown>,
      ),
    )
    .filter((member) => {
      const lowercaseRoles =
        member.roles.map((role) =>
          role.toLowerCase(),
        );

      return (
        lowercaseRoles.includes(
          "subcontractor",
        ) ||
        lowercaseRoles.includes(
          "installer",
        )
      );
    });

  const scheduleRequests = (
    requestsResult.data ?? []
  ).map((record) => {
    const raw =
      record as Record<string, unknown>;

    const project =
      raw.projects &&
      typeof raw.projects === "object"
        ? normalizeProject(
            raw.projects as Record<
              string,
              unknown
            >,
          )
        : null;

    const subcontractor =
      raw.team_members &&
      typeof raw.team_members === "object"
        ? normalizeTeamMember(
            raw.team_members as Record<
              string,
              unknown
            >,
          )
        : null;

    return {
      id: String(raw.id ?? ""),
      secureToken: String(
        raw.secure_token ?? "",
      ),
      status: String(
        raw.status ?? "pending",
      ),
      language: String(
        raw.language ?? "en",
      ),
      sentAt:
        raw.sent_at
          ? String(raw.sent_at)
          : null,
      openedAt:
        raw.opened_at
          ? String(raw.opened_at)
          : null,
      submittedAt:
        raw.submitted_at
          ? String(raw.submitted_at)
          : null,
      expiresAt:
        raw.expires_at
          ? String(raw.expires_at)
          : null,
      demoStart:
        raw.earliest_demo_start
          ? String(
              raw.earliest_demo_start,
            )
          : null,
      constructionStart:
        raw.earliest_construction_start
          ? String(
              raw.earliest_construction_start,
            )
          : null,
      demoDurationDays:
        typeof raw.demo_duration_days ===
        "number"
          ? raw.demo_duration_days
          : null,
      totalDurationDays:
        typeof raw.total_duration_days ===
        "number"
          ? raw.total_duration_days
          : null,
      notesOriginal:
        raw.notes_original
          ? String(raw.notes_original)
          : null,
      notesEnglishTranslation:
        raw.notes_english_translation
          ? String(
              raw.notes_english_translation,
            )
          : null,
      translationStatus: String(
        raw.translation_status ??
          "not_requested",
      ),
      project,
      subcontractor,
    };
  });

  return NextResponse.json({
    success: true,
    projects,
    subcontractors,
    scheduleRequests,
  });
}

export async function POST(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  let body: CreateRequestBody;

  try {
    body =
      (await request.json()) as CreateRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !body.projectId ||
    !body.subcontractorId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project and subcontractor are required.",
      },
      {
        status: 400,
      },
    );
  }

  const language =
    body.language === "es"
      ? "es"
      : "en";

  const expiresInDays =
    typeof body.expiresInDays ===
      "number" &&
    body.expiresInDays >= 1 &&
    body.expiresInDays <= 90
      ? body.expiresInDays
      : 14;

  const supabase =
    createAdminServerClient();

  const { data: accessData } =
    await supabase.rpc(
      "get_effective_user_access",
      {
        requested_auth_user_id:
          authUser.id,
      },
    );

  const createdBy =
    accessData &&
    typeof accessData === "object" &&
    "user_id" in accessData
      ? String(accessData.user_id)
      : null;

  const expiresAt = new Date();

  expiresAt.setDate(
    expiresAt.getDate() +
      expiresInDays,
  );

  const { data, error } =
    await supabase
      .from(
        "subcontractor_schedule_requests",
      )
      .insert({
        project_id: body.projectId,
        subcontractor_id:
          body.subcontractorId,
        status: "pending",
        language,
        sent_at: new Date().toISOString(),
        expires_at:
          expiresAt.toISOString(),
        created_by: createdBy,
      })
      .select(
        "id, secure_token, status, expires_at",
      )
      .single();

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
    scheduleRequest: {
      id: data.id,
      secureToken:
        data.secure_token,
      status: data.status,
      expiresAt: data.expires_at,
    },
  });
}
