import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type MaterialItemInput = {
  itemName?: string;
  description?: string | null;
  quantity?: number;
  unit?: string | null;
};

type CreateReviewBody = {
  projectId?: string;
  subcontractorId?: string;
  language?: "en" | "es";
  expiresInDays?: number;
  items?: MaterialItemInput[];
};

function normalizeProject(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.project_name ??
        record.title ??
        "Unnamed project",
    ),
    address: String(
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
  const rawRoles =
    record.roles ?? record.role ?? [];

  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.display_name ??
        record.full_name ??
        "Unnamed installer",
    ),
    phone:
      typeof record.phone === "string"
        ? record.phone
        : null,
    email:
      typeof record.email === "string"
        ? record.email
        : null,
    roles: Array.isArray(rawRoles)
      ? rawRoles.map(String)
      : typeof rawRoles === "string"
        ? [rawRoles]
        : [],
  };
}

function isInstaller(
  roles: string[],
) {
  return roles.some((role) => {
    const normalized =
      role.toLowerCase();

    return (
      normalized.includes("installer") ||
      normalized.includes(
        "subcontractor",
      )
    );
  });
}

function normalizeReview(
  record: Record<string, unknown>,
) {
  const project =
    record.projects &&
    typeof record.projects === "object"
      ? normalizeProject(
          record.projects as Record<
            string,
            unknown
          >,
        )
      : null;

  const subcontractor =
    record.team_members &&
    typeof record.team_members ===
      "object"
      ? normalizeTeamMember(
          record.team_members as Record<
            string,
            unknown
          >,
        )
      : null;

  return {
    id: String(record.id ?? ""),
    secureToken: String(
      record.secure_token ?? "",
    ),
    status: String(
      record.status ?? "pending",
    ),
    language: String(
      record.language ?? "en",
    ),
    reviewResult:
      typeof record.review_result ===
      "string"
        ? record.review_result
        : null,
    notesOriginal:
      typeof record.notes_original ===
      "string"
        ? record.notes_original
        : null,
    notesEnglishTranslation:
      typeof record
        .notes_english_translation ===
      "string"
        ? record
            .notes_english_translation
        : null,
    translationStatus: String(
      record.translation_status ??
        "not_requested",
    ),
    sentAt:
      typeof record.sent_at === "string"
        ? record.sent_at
        : null,
    openedAt:
      typeof record.opened_at ===
      "string"
        ? record.opened_at
        : null,
    submittedAt:
      typeof record.submitted_at ===
      "string"
        ? record.submitted_at
        : null,
    expiresAt:
      typeof record.expires_at ===
      "string"
        ? record.expires_at
        : null,
    project,
    subcontractor,
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
    reviewsResult,
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
        "subcontractor_material_reviews",
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

  const firstError =
    projectsResult.error ??
    teamResult.error ??
    reviewsResult.error;

  if (firstError) {
    return NextResponse.json(
      {
        success: false,
        error: firstError.message,
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
    .filter((member) =>
      isInstaller(member.roles),
    );

  const reviews = (
    reviewsResult.data ?? []
  ).map((record) =>
    normalizeReview(
      record as Record<string, unknown>,
    ),
  );

  return NextResponse.json({
    success: true,
    projects,
    subcontractors,
    reviews,
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

  let body: CreateReviewBody;

  try {
    body =
      (await request.json()) as CreateReviewBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
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
          "Project and installer are required.",
      },
      {
        status: 400,
      },
    );
  }

  const validItems = (
    body.items ?? []
  )
    .map((item) => ({
      itemName:
        item.itemName?.trim() ?? "",
      description:
        item.description?.trim() ||
        null,
      quantity:
        typeof item.quantity ===
          "number" &&
        item.quantity >= 0
          ? item.quantity
          : 0,
      unit:
        item.unit?.trim() || null,
    }))
    .filter(
      (item) => item.itemName.length > 0,
    );

  if (validItems.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Add at least one material item.",
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

  const expiresAt = new Date();

  expiresAt.setDate(
    expiresAt.getDate() +
      expiresInDays,
  );

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

  const {
    data: review,
    error: reviewError,
  } = await supabase
    .from(
      "subcontractor_material_reviews",
    )
    .upsert(
      {
        project_id: body.projectId,
        subcontractor_id:
          body.subcontractorId,
        language,
        status: "pending",
        review_result: null,
        notes_original: null,
        notes_language: null,
        notes_english_translation:
          null,
        translation_status:
          "not_requested",
        sent_at:
          new Date().toISOString(),
        opened_at: null,
        submitted_at: null,
        expires_at:
          expiresAt.toISOString(),
        created_by: createdBy,
      },
      {
        onConflict:
          "project_id,subcontractor_id",
      },
    )
    .select(
      "id, secure_token, status, expires_at",
    )
    .single();

  if (reviewError) {
    return NextResponse.json(
      {
        success: false,
        error: reviewError.message,
      },
      {
        status: 500,
      },
    );
  }

  const { error: deleteError } =
    await supabase
      .from(
        "subcontractor_material_review_items",
      )
      .delete()
      .eq("review_id", review.id);

  if (deleteError) {
    return NextResponse.json(
      {
        success: false,
        error: deleteError.message,
      },
      {
        status: 500,
      },
    );
  }

  const rows = validItems.map(
    (item, index) => ({
      review_id: review.id,
      item_name: item.itemName,
      description:
        item.description,
      quantity: item.quantity,
      unit: item.unit,
      display_order: index + 1,
    }),
  );

  const { error: itemsError } =
    await supabase
      .from(
        "subcontractor_material_review_items",
      )
      .insert(rows);

  if (itemsError) {
    return NextResponse.json(
      {
        success: false,
        error: itemsError.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    review: {
      id: review.id,
      secureToken:
        review.secure_token,
      status: review.status,
      expiresAt:
        review.expires_at,
    },
  });
}
